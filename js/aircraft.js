import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FUS, fusProfile, U, WING, WIN, WINDOWS, WIN_ROWS, IS_DD, IS_NARROW, DOORS, linspace, mulberry32 } from './geo.js';
import { buildFlightDeck } from './flightdeck.js';
import { WS_POLY, WINDSCREEN_DX, makeLiveryTexture, makeInnerWallTextures, makeCarpetTexture, makeFacetCarpetTexture, makeFanTexture, decorateLivery, makeTailTexture, decorateTail, makeEngineTexture, decorateEngine, makeShellWindowMask, makeCeilingTexture, makeWindowGlowTexture, makeWindscreenMask } from './textures.js';
import { CONFIG } from './config.js';

const TAU = Math.PI * 2;

// Parametric fuselage patch: rows along x, columns around theta.
function surface(xs, thetas, inset, uvFn, inward = false) {
  const nx = xs.length, nt = thetas.length;
  const pos = new Float32Array(nx * nt * 3);
  const uv = new Float32Array(nx * nt * 2);
  let k = 0, q = 0;
  for (let i = 0; i < nx; i++) {
    const x = xs[i];
    const { r, c } = fusProfile(x);
    const rr = Math.max(0.0004, r - inset);
    for (let j = 0; j < nt; j++) {
      const th = thetas[j];
      pos[k++] = x;
      pos[k++] = c + rr * Math.cos(th);
      pos[k++] = rr * Math.sin(th);
      const [u, v] = uvFn(x, th, i, j);
      uv[q++] = u; uv[q++] = v;
    }
  }
  const idx = [];
  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < nt - 1; j++) {
      const a = i * nt + j, b = (i + 1) * nt + j, c2 = (i + 1) * nt + j + 1, d = i * nt + j + 1;
      if (inward) idx.push(a, b, d, b, c2, d);
      else idx.push(a, d, b, b, d, c2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Lofted airfoil surface. Local frame: root leading edge at origin, chord runs to -X,
// span runs along +Z, thickness along Y.
function liftingSurface(o) {
  const {
    span, rootChord, kinkChord = null, kinkAt = 0.5, tipChord, sweep, dihedral = 0,
    rootT = 0.12, tipT = 0.1, camber = 0, flex = 0, winglet = 0, rake = 0,
    nSpan = 30, nChord = 22,
    colTop = new THREE.Color('#e6e9ec'), colBot = new THREE.Color('#d9dde2'),
    colLE = new THREE.Color('#bfc5cc'), colHinge = new THREE.Color('#b8bec6'),
    tipColor = null, planarUV = 0, splitFaces = false,
  } = o;
  const kc = kinkChord ?? (rootChord + tipChord) / 2;
  const chordAt = (s) => (s < kinkAt ? THREE.MathUtils.lerp(rootChord, kc, s / kinkAt) : THREE.MathUtils.lerp(kc, tipChord, (s - kinkAt) / (1 - kinkAt)));
  const xc = [];
  for (let k = 0; k <= nChord; k++) xc.push((1 - Math.cos((Math.PI * k) / nChord)) / 2);
  const thick = (x, T) => 5 * T * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
  const camb = (x) => {
    if (!camber) return 0;
    const p = 0.4, m = camber;
    return x < p ? (m / (p * p)) * (2 * p * x - x * x) : (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * x - x * x);
  };
  // ring: top surface TE -> LE, then bottom LE -> TE (skip duplicate LE)
  const ring = [];
  for (let k = nChord; k >= 0; k--) ring.push({ x: xc[k], top: true });
  for (let k = 1; k <= nChord; k++) ring.push({ x: xc[k], top: false });
  const M = ring.length;

  const pos = [], col = [], uvs = [], aw = [], ach = [];
  const tmp = new THREE.Color();
  const stations = [];
  for (let i = 0; i <= nSpan; i++) {
    const u = i / nSpan;
    stations.push(1 - Math.pow(1 - u, 1.25));
  }
  for (const s of stations) {
    const wl = winglet ? Math.pow(Math.max(0, (s - 0.9) / 0.1), 2.3) : 0;
    const chord = chordAt(s) * (1 - 0.35 * wl);
    const xle = -s * span * Math.tan(sweep) - rake * Math.pow(Math.max(0, (s - 0.88) / 0.12), 1.6);
    const y0 = s * span * Math.tan(dihedral) + flex * s * s + winglet * wl;
    const z = s * span - (winglet ? 0.25 * winglet * wl : 0);
    const T = THREE.MathUtils.lerp(rootT, tipT, s);
    for (const p of ring) {
      const yt = thick(p.x, T) * chord;
      const yc = camb(p.x) * chord;
      const X = xle - p.x * chord;
      pos.push(X, y0 + yc + (p.top ? yt : -yt), z);
      aw.push(p.x, s, p.top ? 1 : 0);
      ach.push(chord);
      if (planarUV) uvs.push(-X / planarUV, splitFaces ? (p.top ? 0 : 0.5) + (0.5 * z) / planarUV : z / planarUV);
      if (tipColor && wl > 0.04) tmp.copy(tipColor);
      else if (p.x < 0.045) tmp.copy(colLE);
      else if (p.top && p.x > 0.72 && p.x < 0.745) tmp.copy(colHinge);
      else tmp.copy(p.top ? colTop : colBot);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  const idx = [];
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < M - 1; j++) {
      const a = i * M + j, b = (i + 1) * M + j, c = (i + 1) * M + j + 1, d = i * M + j + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  // tip cap (fan)
  const last = (stations.length - 1) * M;
  let cx = 0, cy = 0, cz = 0;
  for (let j = 0; j < M; j++) { cx += pos[(last + j) * 3]; cy += pos[(last + j) * 3 + 1]; cz += pos[(last + j) * 3 + 2]; }
  const centre = pos.length / 3;
  pos.push(cx / M, cy / M, cz / M);
  aw.push(0.5, 1, 1);
  ach.push(0);
  col.push(colTop.r, colTop.g, colTop.b);
  if (planarUV) uvs.push(-(cx / M) / planarUV, splitFaces ? (0.5 * (cz / M)) / planarUV : (cz / M) / planarUV);
  for (let j = 0; j < M - 1; j++) idx.push(last + j, centre, last + j + 1);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(aw, 3));
  g.setAttribute('aChord', new THREE.Float32BufferAttribute(ach, 1));
  if (planarUV) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geometry: g, chordAt };
}

// spinner: graphite with the white spiral engines carry so ground crew can see them turning
function makeSpinnerTexture() {
  const W = 256, H = 128;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const f = (u + v * 0.85) % 1;
    const w = f < 0.09 || (v > 0.93) ? 1 : 0;
    const i = (y * W + x) * 4, k = w ? 238 : 44;
    img.data[i] = k; img.data[i + 1] = k + (w ? 0 : 3); img.data[i + 2] = k + (w ? 0 : 8); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// window bezels for one row of windows (moulded surround + a short tunnel to the skin, bent to
// the wall's curve) and a few blinds pulled part-way down
function windowTrim(row, hi, seed) {
  const Ri = FUS.R - FUS.WALL;
  const rrect = (w, h, r) => {
    const sh = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
    sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r);
    sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
    return sh;
  };
  const openPath = () => rrect(WIN.OPEN_W, WIN.OPEN_H, WIN.OPEN_W * 0.46);
  const face = rrect(WIN.BEZEL_W, WIN.BEZEL_H, WIN.BEZEL_W * 0.4);
  face.holes.push(openPath());
  const cs = hi ? 7 : 4;
  const faceGeo = new THREE.ExtrudeGeometry(face, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: hi ? 2 : 1, curveSegments: cs });
  const tube = rrect(WIN.OPEN_W + 0.03, WIN.OPEN_H + 0.03, (WIN.OPEN_W + 0.03) * 0.46);
  tube.holes.push(openPath());
  const tubeGeo = new THREE.ExtrudeGeometry(tube, { depth: 0.12, bevelEnabled: false, curveSegments: cs });
  tubeGeo.translate(0, 0, -0.12);
  const geo = mergeGeometries([faceGeo.toNonIndexed(), tubeGeo.toNonIndexed()], false);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + (p.getY(i) ** 2) / (2 * Ri) - 0.004);
  geo.computeVertexNormals();
  const g = new THREE.Group();
  g.name = `windowTrim-${row.deck}`;
  const bezels = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.48 }), row.xs.length * 2);
  const blindGeo = new THREE.PlaneGeometry(WIN.OPEN_W + 0.02, 1).translate(0, -0.5, 0);
  const blinds = [];
  const rng = mulberry32(seed);
  const th = Math.acos(row.y / Ri);
  const m = new THREE.Matrix4(), m2 = new THREE.Matrix4();
  let k = 0;
  for (const side of [1, -1]) {
    const pos = new THREE.Vector3(0, Ri * Math.cos(th), side * Ri * Math.sin(th));
    const nIn = new THREE.Vector3(0, -Math.cos(th), -side * Math.sin(th));
    const up = new THREE.Vector3(0, Math.sin(th), -side * Math.cos(th));
    const ax = new THREE.Vector3(-side, 0, 0);
    for (const x of row.xs) {
      m.makeBasis(ax, up, nIn).setPosition(x, pos.y, pos.z);
      bezels.setMatrixAt(k++, m);
      if (rng() < 0.24) {
        const drop = 0.18 + rng() * 0.3;
        m2.makeTranslation(0, WIN.OPEN_H / 2 + 0.01, -0.035).multiply(new THREE.Matrix4().makeScale(1, WIN.OPEN_H * drop, 1));
        blinds.push(m.clone().multiply(m2));
      }
    }
  }
  bezels.castShadow = true; bezels.receiveShadow = true;
  g.add(bezels);
  const bl = new THREE.InstancedMesh(blindGeo, new THREE.MeshStandardMaterial({ color: 0xf1f3f6, roughness: 0.9, side: THREE.DoubleSide }), Math.max(1, blinds.length));
  blinds.forEach((mm, i) => bl.setMatrixAt(i, mm));
  bl.count = blinds.length;
  bl.castShadow = true; bl.receiveShadow = true;
  g.add(bl);
  return g;
}

function lathe(points, segs = 64) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
}

export function makeGlassMaterial(sky, horizon, sunDir) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uOpacity: { value: 0 },
      uSky: { value: new THREE.Color(sky) },
      uHorizon: { value: new THREE.Color(horizon) },
      uSunDir: { value: sunDir.clone() },
      uGlint: { value: 1 },
    },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity; uniform vec3 uSky; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform float uGlint;
      varying vec3 vN; varying vec3 vW;
      void main() {
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 v = normalize(cameraPosition - vW);
        float f = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 3.0);
        vec3 r = reflect(-v, n);
        vec3 env = mix(uHorizon, uSky, clamp(r.y * 0.6 + 0.4, 0.0, 1.0));
        float spec = pow(max(dot(r, uSunDir), 0.0), 260.0) * 3.0 * uGlint;
        float a = (0.035 + 0.55 * f + spec * 0.5) * uOpacity;
        gl_FragColor = vec4(env * 1.05 + spec, clamp(a, 0.0, 0.85));
      }`,
  });
}

export function buildAircraft({ aniso = 8, sunDir, preset, hi = false, glow = 3 }) {
  const group = new THREE.Group();
  group.name = 'aircraft';

  const brandBlue = new THREE.Color(CONFIG.brand.colors.primary);
  const brandColors = { ...CONFIG.brand.colors, fin: CONFIG.brand.colors.fin || '#0e8fb5' };
  const livery = makeLiveryTexture(aniso, hi, brandColors);
  const paint = new THREE.MeshPhysicalMaterial({
    map: livery, color: 0xffffff, roughness: 0.3, metalness: 0.0,
    clearcoat: 0.75, clearcoatRoughness: 0.12,
  });
  const paintPlain = new THREE.MeshPhysicalMaterial({ color: 0xf1f2f4, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  // the moving surfaces, drawn as real panels with their gaps: trailing-edge flaps (inboard and
  // outboard) and the aileron behind the hinge line, spoiler panels on top just ahead of the
  // flaps, leading-edge slats along the front; on the tailplane the same lines make the elevators.
  // They really move: the vertex shader turns each surface about its hinge (flaps and slats out
  // on approach, small aileron and elevator trim movements in cruise).
  const ctrlWing = { uFlap: { value: 0 }, uSlat: { value: 0 }, uAil: { value: 0 }, uTail: { value: 0 } };
  const ctrlTail = { uFlap: { value: 0 }, uSlat: { value: 0 }, uAil: { value: 0 }, uTail: { value: 1 } };
  const makeWingMat = (ctrl) => {
    const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.0, clearcoat: 0.2, clearcoatRoughness: 0.3, envMapIntensity: 0.8, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, ctrl);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec3 aWing; attribute float aChord;
varying vec3 vWing;
uniform float uFlap; uniform float uSlat; uniform float uAil; uniform float uTail;`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
float wcx = aWing.x, wsp = aWing.y;
float wside = modelMatrix[2][2] < 0.0 ? -1.0 : 1.0;          // the left wing is the mirror image
float inF = step(0.07, wsp) * step(wsp, 0.66);
float inA = step(0.66, wsp) * step(wsp, 0.86);
float teAng = uTail > 0.5 ? (inF + inA) * uAil : inF * uFlap + inA * (uAil * wside + uFlap * 0.22);
float teOn = step(0.745, wcx) * step(wsp, 0.86) * step(0.07, wsp);
float teD = max(wcx - 0.745, 0.0) * aChord;
float leOn = step(wcx, 0.11) * step(0.1, wsp) * step(wsp, 0.93) * (1.0 - uTail);
float leD = max(0.11 - wcx, 0.0) * aChord;
if (teOn > 0.5) { float c = cos(teAng), s = sin(teAng); objectNormal.xy = vec2(objectNormal.x * c - objectNormal.y * s, objectNormal.x * s + objectNormal.y * c); }
if (leOn > 0.5) { float c = cos(-uSlat), s = sin(-uSlat); objectNormal.xy = vec2(objectNormal.x * c - objectNormal.y * s, objectNormal.x * s + objectNormal.y * c); }`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vWing = aWing;
if (teOn > 0.5) { transformed.y -= teD * sin(teAng); transformed.x += teD * (1.0 - cos(teAng)); }
if (leOn > 0.5) { transformed.y -= leD * sin(uSlat); transformed.x += -leD * (1.0 - cos(uSlat)) + aChord * 0.035 * clamp(uSlat / 0.35, 0.0, 1.0); }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWing;
float seam(float v, float at) { float w = fwidth(v) * 1.1 + 1e-5; return 1.0 - smoothstep(0.0, w, abs(v - at)); }
float within(float v, float a, float b) { return step(a, v) * step(v, b); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  float cx = vWing.x, sp = vWing.y, top = vWing.z;
  float lines = 0.0;
  float te = within(sp, 0.07, 0.86);
  lines += seam(cx, 0.745) * te;                                         // hinge line
  float tez = within(cx, 0.745, 1.0) * te;
  lines += (seam(sp, 0.07) + seam(sp, 0.36) + seam(sp, 0.66) + seam(sp, 0.86)) * tez;   // flap / flap / aileron
  float spo = within(cx, 0.6, 0.745) * within(sp, 0.12, 0.64) * top;
  lines += seam(cx, 0.6) * within(sp, 0.12, 0.64) * top;
  lines += seam(fract((sp - 0.12) / 0.0867), 0.0) * spo;                 // six spoiler panels
  float le = within(sp, 0.1, 0.93);
  lines += seam(cx, 0.11) * le;                                          // slats
  lines += seam(fract((sp - 0.1) / 0.138), 0.0) * within(cx, 0.0, 0.11) * le;
  diffuseColor.rgb *= 1.0 - 0.06 * tez;                                  // control surfaces: a shade darker
  diffuseColor.rgb *= 1.0 - 0.55 * clamp(lines, 0.0, 1.0);
}`);
    };
    mat.customProgramCacheKey = () => 'safar-wing-v2';
    return mat;
  };
  const wingMat = makeWingMat(ctrlWing);
  const tailplaneMat = makeWingMat(ctrlTail);
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9ced5, metalness: 1.0, roughness: 0.22 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x6d737c, metalness: 0.8, roughness: 0.42 });

  const add = (geo, mat, { cast = true, receive = true, name } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = receive;
    if (name) m.name = name;
    group.add(m);
    return m;
  };

  // ---------------- Fuselage: four-engine double-decker ----------------
  // Two full decks in a 7.8 m fuselage. The skin is split where the two cutaways run: the lower
  // hull, a band between the decks that carries the upper windows (solid while you look at the
  // upper deck, glass when you look down into the main deck) and the roof above the upper deck.
  var bandMat = null;
  const bands = [], bandGlass = [], upperParts = [];
  let slabParts = [];
  if (IS_DD || IS_NARROW) {
    // (the single-aisle jet uses the same builder with one deck: no band, no slab)
    const uvOuter = (x, th) => [U(x), th / TAU];
    const fullTh = linspace(-Math.PI, Math.PI, 97);
    const TC = FUS.THETA_C, TM = IS_DD ? FUS.THETA_M : FUS.THETA_C, RI = FUS.R - FUS.WALL;
    const cabXs = linspace(FUS.CABIN_X0, FUS.CABIN_X1, 64);
    const UX0 = IS_DD ? FUS.UPPER_X0 : FUS.CABIN_X0, UX1 = IS_DD ? FUS.UPPER_X1 : FUS.CABIN_X1, UY = IS_DD ? FUS.UPPER_Y : FUS.FLOOR_Y;
    const upXs = linspace(UX0, UX1, 56);
    add(surface(linspace(FUS.TAIL_END - 0.55, FUS.CABIN_X0, 46, 1.35), fullTh, 0, uvOuter), paint, { name: 'tailcone' });
    add(surface(linspace(FUS.CABIN_X1, FUS.NOSE_END, 44, 0.55), fullTh, 0, uvOuter), paint, { name: 'nose' });
    const shellMesh = add(surface(cabXs, linspace(TM, TAU - TM, 64), 0, uvOuter), paint, { name: 'shell' });
    const mask = makeShellWindowMask();
    const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    dm.onBeforeCompile = (sh) => {
      sh.uniforms.uWinMask = { value: mask };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWinUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWinUv = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uWinMask;\nvarying vec2 vWinUv;')
        .replace('void main() {', 'void main() {\n  if (texture2D(uWinMask, vWinUv).g < 0.5) discard;');
    };
    dm.customProgramCacheKey = () => 'safar-window-mask';
    shellMesh.customDepthMaterial = dm;
    paint.shadowSide = THREE.DoubleSide;
    bandMat = paint.clone();
    bandMat.side = THREE.FrontSide;
    bandMat.transparent = true;
    if (IS_DD) for (const th of [linspace(TC, TM, 24), linspace(TAU - TM, TAU - TC, 24)]) {
      const g = surface(cabXs, th, 0, uvOuter);
      const m = add(g, bandMat, { name: 'band' });
      m.customDepthMaterial = dm;
      bands.push(m);
      bandGlass.push(g);
    }
    const roofTh = linspace(-TC, TC, 40);
    roofGeo = surface(cabXs, roofTh, 0, uvOuter);
    roofMat = paint.clone();
    roofMat.side = THREE.FrontSide;
    roofMat.transparent = true;
    roofSolid = add(roofGeo, roofMat, { name: 'roof' });
    ceilMat = new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 0.75, emissive: 0xfff2e2, emissiveIntensity: 0.22, transparent: true, opacity: 1 });
    ceiling = new THREE.Mesh(surface(upXs, roofTh, FUS.WALL, uvOuter, true), ceilMat);
    ceiling.name = 'ceiling';
    group.add(ceiling);
    roofFaders = [];
    fadeWithRoof = (mesh, mat) => { mat.transparent = true; roofFaders.push({ mesh, mat }); };
    glassMat = makeGlassMaterial(preset.glass.zenith, preset.glass.horizon, sunDir);
    roofGlass = new THREE.Mesh(roofGeo, glassMat);
    roofGlass.renderOrder = 5;
    roofGlass.visible = false;
    group.add(roofGlass);
    for (let i = 0; i < bandGlass.length; i++) {
      const m = new THREE.Mesh(bandGlass[i], glassMat);
      m.renderOrder = 5; m.visible = false; m.name = 'bandGlass';
      group.add(m);
      bandGlass[i] = m;
    }

    // floors: the main deck, and the upper deck on a slab whose underside is the main ceiling
    const carpet = makeFacetCarpetTexture({ size: 512, seed: 5 });
    carpet.anisotropy = aniso;
    floorMat = new THREE.MeshPhysicalMaterial({ map: carpet, roughness: 0.96, metalness: 0, sheen: 0.5, sheenRoughness: 0.8, sheenColor: new THREE.Color('#d6e6f5') });
    const level = (y, x0, x1, mat, name, down = false) => {
      const pos = [], uv = [], idx = [];
      linspace(x0, x1, 44).forEach((x, i) => {
        const { r, c } = fusProfile(x);
        const ri = r - FUS.WALL;
        const hw = Math.sqrt(Math.max(0, ri * ri - (y - c) ** 2));
        pos.push(x, y, -hw, x, y, hw);
        uv.push(x * 0.55, -hw * 0.55, x * 0.55, hw * 0.55);
        if (i > 0) { const a = (i - 1) * 2; idx.push(...(down ? [a, a + 2, a + 1, a + 1, a + 2, a + 3] : [a, a + 1, a + 2, a + 1, a + 3, a + 2])); }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const n = g.attributes.normal;
      for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, down ? -1 : 1, 0);
      return add(g, mat, { cast: !down, name });
    };
    level(FUS.FLOOR_Y, FUS.CABIN_X0, FUS.CABIN_X1, floorMat, 'floor');
    const slabBot = IS_DD ? FUS.UPPER_Y - FUS.SLAB : FUS.FLOOR_Y + 2.12;
    const ceilTex = makeCeilingTexture();
    if (IS_DD) {
    const upperFloor = level(FUS.UPPER_Y, FUS.CABIN_X0 + 0.05, FUS.CABIN_X1 - 0.05, floorMat, 'upperFloor');
    const mainCeilMat = new THREE.MeshStandardMaterial({ map: ceilTex, color: 0xffffff, roughness: 0.82, emissive: 0xfff3e2, emissiveIntensity: 0.24, side: THREE.DoubleSide });
    const mainCeil = level(slabBot, FUS.CABIN_X0 + 0.05, FUS.CABIN_X1 - 0.05, mainCeilMat, 'mainCeiling', true);
    slabParts = [upperFloor, mainCeil];
    }

    // inner sidewalls with real window openings, one set per deck
    const wallSet = (row, xs, name) => {
      const tex = makeInnerWallTextures(aniso, row);
      const mat = new THREE.MeshStandardMaterial({ map: tex.map, alphaMap: tex.alpha, alphaTest: 0.5, roughness: 0.78, side: THREE.DoubleSide });
      const tArr = linspace(0, 1, 16);
      const thR = tArr.map((t) => row.th0 + t * (row.th1 - row.th0));
      const thL = tArr.map((t) => TAU - row.th0 - t * (row.th1 - row.th0));
      const uvIn = (x, th, i, j) => [U(x), tArr[j]];
      return [add(surface(xs, thR, FUS.WALL, uvIn, true), mat, { name: `${name}R` }), add(surface(xs, thL, FUS.WALL, uvIn, false), mat, { name: `${name}L` })];
    };
    wallSet(WIN_ROWS[0], cabXs, 'wallMain');
    if (IS_DD) upperParts.push(...wallSet(WIN_ROWS[1], upXs, 'wallUpper'));
    group.add(windowTrim(WIN_ROWS[0], hi, 41));
    if (IS_DD) { const upTrim = windowTrim(WIN_ROWS[1], hi, 43); group.add(upTrim); upperParts.push(upTrim); }

    // overhead bins: on the main deck along both walls under the ceiling and over the centre
    // block; on the upper deck curved bins high on the sidewalls
    binMat = new THREE.MeshStandardMaterial({ color: 0xf5f7f9, roughness: 0.42, transparent: true, opacity: 1 });
    const upperBinMat = binMat.clone();
    const extrudeRuns = (shape, runs) => {
      const geos = [];
      for (const [x0, x1] of runs) {
        const n = Math.max(1, Math.round((x1 - x0) / 1.55));
        const len = (x1 - x0) / n;
        for (let i = 0; i < n; i++) {
          const g = new THREE.ExtrudeGeometry(shape, { depth: len - 0.022, bevelEnabled: false, curveSegments: 4 });
          g.rotateY(-Math.PI / 2);
          g.translate(x0 + (i + 1) * len - 0.011, 0, 0);
          geos.push(g.toNonIndexed());
        }
      }
      const g = mergeGeometries(geos, false);
      g.computeVertexNormals();
      return g;
    };
    const runsBetween = (x0, x1, doors) => {
      const cuts = doors.filter((d) => d > x0 && d < x1).sort((a, b) => a - b);
      const out = []; let a = x0;
      for (const d of cuts) { if (d - 0.95 > a + 0.5) out.push([a, d - 0.95]); a = d + 0.95; }
      if (x1 > a + 0.5) out.push([a, x1]);
      return out;
    };
    const onWall = (y) => Math.sqrt(Math.max(0, RI * RI - y * y)) - 0.004;
    const shapeFrom = (pts) => { const sh = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y))); sh.closePath(); return sh; };
    const yb = slabBot - 0.02, ya = slabBot - 0.6;
    if (IS_DD) {
    const mainRuns = runsBetween(FUS.CABIN_X0 + 2.0, FUS.CABIN_X1 - 2.4, DOORS);
    const geos = [];
    for (const k of [1, -1]) {
      const pts = [[onWall(ya), ya], [3.12, ya + 0.02], [3.05, ya + 0.1], [3.02, yb - 0.08], [3.08, yb], [onWall(yb), yb]];
      geos.push(extrudeRuns(shapeFrom(pts.map(([z, y]) => [k * z, y])), mainRuns));
    }
    geos.push(extrudeRuns(shapeFrom([[-0.97, yb], [-0.97, ya + 0.12], [-0.9, ya + 0.04], [-0.8, ya], [0.8, ya], [0.9, ya + 0.04], [0.97, ya + 0.12], [0.97, yb]]), mainRuns));
    bins = new THREE.Mesh(mergeGeometries(geos, false), binMat);
    bins.name = 'bins'; bins.receiveShadow = true;
    group.add(bins);
    }
    const ut = UY + (IS_DD ? 2.42 : 2.02), ub = UY + (IS_DD ? 1.78 : 1.55), bd = IS_DD ? 1 : 0.8;
    const upGeos = [];
    for (const k of [1, -1]) {
      const pts = [[onWall(ub), ub], [onWall(ub) - 0.5 * bd, ub + 0.03], [onWall(ub) - 0.56 * bd, ub + 0.16], [onWall(ut) - 0.5 * bd, ut - 0.04], [onWall(ut) - 0.42 * bd, ut], [onWall(ut), ut]];
      for (let i = 1; i < 6; i++) { const y = ut - (i / 6) * (ut - ub); pts.push([onWall(y), y]); }
      upGeos.push(extrudeRuns(shapeFrom(pts.map(([z, y]) => [k * z, y])), runsBetween(UX0 + 1.2, UX1 - 1.6, IS_DD ? [] : DOORS)));
    }
    const upBins = new THREE.Mesh(mergeGeometries(upGeos, false), upperBinMat);
    upBins.name = 'upperBins'; upBins.receiveShadow = true;
    group.add(upBins);
    fadeWithRoof(upBins, upperBinMat);
    if (IS_DD) upperParts.push(upBins); else { bins = upBins; binMat = upperBinMat; }
    // upper-deck lowered ceiling with warm light lines
    const upCeilMat = new THREE.MeshStandardMaterial({ map: ceilTex, color: 0xffffff, roughness: 0.82, emissive: 0xfff3e2, emissiveIntensity: 0.3, side: THREE.DoubleSide, transparent: true });
    const ucY = UY + (IS_DD ? 2.5 : 2.18);
    const ucW = onWall(ucY) - (IS_DD ? 0.45 : 0.36);
    const upCeil = new THREE.Mesh(new THREE.PlaneGeometry(UX1 - UX0 - 0.2, ucW * 2).rotateX(Math.PI / 2).translate((UX0 + UX1) / 2, ucY, 0), upCeilMat);
    upCeil.name = 'upperCeiling'; upCeil.receiveShadow = true;
    group.add(upCeil);
    fadeWithRoof(upCeil, upCeilMat);
    upperParts.push(upCeil);
    const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.93, 0.8).multiplyScalar(glow * 0.55), side: THREE.DoubleSide, transparent: true });
    for (const k of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.PlaneGeometry(UX1 - UX0 - 0.4, 0.06).rotateX(Math.PI / 2).translate((UX0 + UX1) / 2, ucY - 0.005, k * (ucW + 0.05)), warm.clone());
      st.name = 'upperCove'; group.add(st); fadeWithRoof(st, st.material); upperParts.push(st);
      if (IS_DD) {
        const mt = new THREE.Mesh(new THREE.PlaneGeometry(FUS.CABIN_X1 - FUS.CABIN_X0 - 4.4, 0.06).rotateX(Math.PI / 2).translate((FUS.CABIN_X0 + FUS.CABIN_X1) / 2, slabBot - 0.004, k * 2.98), warm.clone());
        mt.name = 'mainCove'; group.add(mt); fadeWithRoof(mt, mt.material);
      }
    }
    fadeWithRoof(bins, binMat);

    // cut rims and the sky-blue LED line under the top of each sidewall
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xf2f0ec, roughness: 0.6, side: THREE.DoubleSide });
    const coveMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.18, 0.72, 1.0).multiplyScalar(glow * 0.6), side: THREE.DoubleSide });
    const ribbon = (xs, f) => {
      const pos = [], idx = [];
      for (const side of [1, -1]) {
        const base = pos.length / 3;
        for (const x of xs) for (const p of f(x, side)) pos.push(...p);
        for (let i = 0; i < xs.length - 1; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const at = (x, th, inset) => { const { r, c } = fusProfile(x); return [x, c + (r - inset) * Math.cos(th), (r - inset) * Math.sin(th)]; };
    const rim = (xs, th0) => ribbon(xs, (x, side) => { const th = side > 0 ? th0 : TAU - th0; return [at(x, th, 0), at(x, th, FUS.WALL)]; });
    const mainTh = WIN_ROWS[0].th0;
    add(rim(cabXs, TC), rimMat, { cast: false, name: 'rim' });
    const lineAt = (xs, th0) => ribbon(xs, (x, side) => [0.03, 0.052].map((d) => at(x, side > 0 ? th0 + d : TAU - th0 - d, FUS.WALL + 0.012)));
    const upCove = new THREE.Mesh(lineAt(linspace(UX0 + 0.3, UX1 - 0.3, 56), TC), coveMat);
    upCove.name = 'cove'; group.add(upCove); upperParts.push(upCove);
    if (IS_DD) { const mainLine = new THREE.Mesh(lineAt(linspace(FUS.CABIN_X0 + 0.3, FUS.CABIN_X1 - 0.3, 60), mainTh), coveMat); mainLine.name = 'cove'; group.add(mainLine); }

    // bulkheads closing each deck front and back
    const bulkMat = new THREE.MeshStandardMaterial({ color: 0xe7f0f8, roughness: 0.7, side: THREE.DoubleSide });
    const bulk = (x, y0, y1) => {
      const { r, c } = fusProfile(x);
      const ri = r - FUS.WALL;
      const th0 = Math.acos(THREE.MathUtils.clamp((y0 - c) / ri, -1, 1));
      const th1 = y1 == null ? 0 : Math.acos(THREE.MathUtils.clamp((y1 - c) / ri, -1, 1));
      const sh = new THREE.Shape();
      const pts = [];
      for (let i = 0; i <= 24; i++) { const th = th0 - (i / 24) * (th0 - th1); pts.push([ri * Math.sin(th), c + ri * Math.cos(th)]); }
      const all = pts.concat(pts.slice().reverse().map(([z, y]) => [-z, y]));
      all.forEach(([z, y], i) => (i ? sh.lineTo(-z, y) : sh.moveTo(-z, y)));
      sh.closePath();
      const g = new THREE.ShapeGeometry(sh, 1);
      g.rotateY(Math.PI / 2);
      g.translate(x, 0, 0);
      return add(g, bulkMat, { name: 'bulkhead' });
    };
    if (IS_DD) {
      bulk(FUS.CABIN_X0 + 0.02, FUS.FLOOR_Y, slabBot);
      bulk(FUS.CABIN_X1 - 0.02, FUS.FLOOR_Y, slabBot);
      upperParts.push(bulk(FUS.UPPER_X0 + 0.02, FUS.UPPER_Y, null), bulk(FUS.UPPER_X1 - 0.02, FUS.UPPER_Y, null));
    } else { bulk(FUS.CABIN_X0 + 0.02, FUS.FLOOR_Y, null); bulk(FUS.CABIN_X1 - 0.02, FUS.FLOOR_Y, null); }
  } else {
  // ---------------- Fuselage ----------------
  const uvOuter = (x, th) => [U(x), th / TAU];
  const fullTh = linspace(-Math.PI, Math.PI, 97);
  const tailXs = linspace(-35.55, FUS.CABIN_X0, 46, 1.35);
  const noseXs = linspace(FUS.CABIN_X1, 35.0, 44, 0.55);
  const cabXs = linspace(FUS.CABIN_X0, FUS.CABIN_X1, 56);
  const shellTh = linspace(FUS.THETA_C, TAU - FUS.THETA_C, 78);
  const roofTh = linspace(-FUS.THETA_C, FUS.THETA_C, 42);

  add(surface(tailXs, fullTh, 0, uvOuter), paint, { name: 'tailcone' });
  add(surface(noseXs, fullTh, 0, uvOuter), paint, { name: 'nose' });
  const shellMesh = add(surface(cabXs, shellTh, 0, uvOuter), paint, { name: 'shell' });
  // the skin is solid to the eye, but lets sunlight through its windows into the cabin
  // (three.js copies the visible material's alphaMap/alphaTest onto custom depth materials, so the
  // window mask goes in through its own uniform instead)
  {
    const mask = makeShellWindowMask();
    const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    dm.onBeforeCompile = (sh) => {
      sh.uniforms.uWinMask = { value: mask };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWinUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWinUv = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uWinMask;\nvarying vec2 vWinUv;')
        .replace('void main() {', 'void main() {\n  if (texture2D(uWinMask, vWinUv).g < 0.5) discard;');
    };
    dm.customProgramCacheKey = () => 'safar-window-mask';
    shellMesh.customDepthMaterial = dm;
  }

  var roofGeo = surface(cabXs, roofTh, 0, uvOuter);
  // the skin is a single open surface: cast shadows from both faces, otherwise the sun-facing
  // side never blocks the sun and the closed cabin is lit straight through the roof
  paint.shadowSide = THREE.DoubleSide;
  var roofMat = paint.clone();
  roofMat.side = THREE.FrontSide;
  roofMat.transparent = true;
  roofMat.opacity = 1;
  var roofSolid = add(roofGeo, roofMat, { name: 'roof' });
  // cabin ceiling seen from inside when the roof closes over the camera (instead of the livery's back face)
  var ceilMat = new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 0.75, emissive: 0xfff2e2, emissiveIntensity: 0.22, transparent: true, opacity: 1 });
  var ceiling = new THREE.Mesh(surface(cabXs, roofTh, FUS.WALL, uvOuter, true), ceilMat);
  ceiling.name = 'ceiling';
  group.add(ceiling);
  // overhead bins over Economy, Premium and Business (part of the closed cabin, so they fade with the roof)
  var binMat = new THREE.MeshStandardMaterial({ color: 0xf5f7f9, roughness: 0.42, transparent: true, opacity: 1 });
  var bins = (() => {
    const RI = FUS.R - FUS.WALL;
    const onWall = (y) => Math.sqrt(RI * RI - y * y) - 0.004;
    const profile = (k) => {                       // k = +1 starboard, -1 port; (z, y) outline
      const pts = [[onWall(0.47), 0.47], [2.2, 0.5], [1.82, 0.535], [1.7, 0.6], [1.64, 0.74], [1.645, 0.9],
        [1.69, 1.03], [1.82, 1.13], [2.1, 1.19]];
      const yTop = 1.24;
      pts.push([onWall(yTop), yTop]);
      for (let i = 1; i < 8; i++) { const y = yTop - (i / 8) * (yTop - 0.47); pts.push([onWall(y), y]); }
      const sh = new THREE.Shape();
      pts.forEach(([z, y], i) => (i ? sh.lineTo(k * z, y) : sh.moveTo(k * z, y)));
      sh.closePath();
      return sh;
    };
    const runs = [[-19.7, 1.0], [2.6, 11.0]];          // keep the door 2 crossover clear
    const geos = [];
    for (const k of [1, -1]) {
      const sh = profile(k);
      for (const [x0, x1] of runs) {
        const n = Math.max(1, Math.round((x1 - x0) / 1.55));
        const len = (x1 - x0) / n;
        for (let i = 0; i < n; i++) {
          const g = new THREE.ExtrudeGeometry(sh, { depth: len - 0.022, bevelEnabled: false, curveSegments: 4 });
          g.rotateY(-Math.PI / 2);                   // shape x -> world z, extrusion -> world -x
          g.translate(x0 + (i + 1) * len - 0.011, 0, 0);
          geos.push(g.toNonIndexed());
        }
      }
    }
    const g = mergeGeometries(geos, false);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, binMat);
    m.name = 'bins';
    m.receiveShadow = true;
    return m;
  })();
  group.add(bins);

  // Lowered cabin ceiling, like a real widebody: the side panels rise from the top of the
  // sidewall (about 2.5 m above the floor) to a raised centre panel (about 2.67 m), with warm
  // light lines along its edges. It hides the bare fuselage crown, which is four metres up.
  // It belongs to the closed cabin, so it fades with the roof like the bins.
  var roofFaders = [];
  var fadeWithRoof = (mesh, mat) => { mat.transparent = true; roofFaders.push({ mesh, mat }); };
  {
    const ceilTex = makeCeilingTexture();
    const panelMat = new THREE.MeshStandardMaterial({
      map: ceilTex, color: 0xffffff, roughness: 0.82, emissive: 0xfff3e2, emissiveIntensity: 0.16,
      side: THREE.DoubleSide, transparent: true, opacity: 1,
    });
    const centreMat = panelMat.clone();
    centreMat.emissiveIntensity = 0.34;            // the raised centre panel is washed by the cove lights
    const LIP = 1.17, Y_SIDE = 1.335, Y_TOP = 1.405;
    const wallZ = (x, y) => { const { r, c } = fusProfile(x); const ri = r - FUS.WALL - 0.006; return Math.sqrt(Math.max(0, ri * ri - (y - c) ** 2)); };
    // a ribbon swept along x through the profile returned by prof(x) = [[z, y], ...]
    const sweep = (xs, prof) => {
      const rows = xs.map(prof), n = rows[0].length;
      const pos = [], uv = [], idx = [];
      xs.forEach((x, i) => {
        let len = 0;
        rows[i].forEach(([z, y], j) => {
          if (j) len += Math.hypot(z - rows[i][j - 1][0], y - rows[i][j - 1][1]);
          pos.push(x, y, z); uv.push(x / 1.524, len / 1.2);
        });
      });
      for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < n - 1; j++) {
        const a = i * n + j, b = (i + 1) * n + j;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const xs = linspace(FUS.CABIN_X0 + 0.04, FUS.CABIN_X1 - 0.04, 64);
    const side = (k) => (x) => {
      const wz = wallZ(x, 1.26);
      const pts = [[wz, 1.26], [Math.min(wz, 2.2), 1.29], [Math.min(wz, 1.65), 1.318], [Math.min(wz, LIP), Y_SIDE]];
      return pts.map(([z, y]) => [k * z, y]);
    };
    const centre = (x) => {
      const w = Math.min(LIP, wallZ(x, Y_TOP) - 0.02);
      return [[-w, Y_SIDE], [-w, Y_TOP], [-0.6, Y_TOP + 0.012], [0, Y_TOP + 0.016], [0.6, Y_TOP + 0.012], [w, Y_TOP], [w, Y_SIDE]];
    };
    const sideL = new THREE.Mesh(sweep(xs, side(-1)), panelMat);
    const sideR = new THREE.Mesh(sweep(xs, side(1)), panelMat);
    const top = new THREE.Mesh(sweep(xs, centre), centreMat);
    for (const m of [sideL, sideR, top]) { m.receiveShadow = true; m.name = 'cabinCeiling'; group.add(m); }
    fadeWithRoof(sideL, panelMat); fadeWithRoof(sideR, panelMat); fadeWithRoof(top, centreMat);
    // warm light lines on the lip of the side panels (they face down, so every seat sees them)
    const coveMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.93, 0.8).multiplyScalar(glow * 0.55), side: THREE.DoubleSide, transparent: true });
    const strip = (k) => sweep(xs, (x) => { const w = Math.min(LIP, wallZ(x, Y_SIDE) - 0.02); return [[k * w, Y_SIDE - 0.004], [k * (w + 0.07), Y_SIDE - 0.006]]; });
    for (const k of [-1, 1]) { const m = new THREE.Mesh(strip(k), coveMat); m.name = 'ceilingCove'; group.add(m); fadeWithRoof(m, coveMat); }
    // warm up-light along the top of the side bins (the glow you see between bin and ceiling)
    const binCove = (k) => {
      const geos = [];
      for (const [x0, x1] of [[-19.7, 1.0], [2.6, 11.0]]) {
        const g = new THREE.PlaneGeometry(x1 - x0, 0.05);
        g.rotateX(-Math.PI / 2);
        g.rotateX(k * 0.2);
        g.translate((x0 + x1) / 2, 1.142, k * 1.78);
        geos.push(g);
      }
      return mergeGeometries(geos, false);
    };
    for (const k of [-1, 1]) { const m = new THREE.Mesh(binCove(k), coveMat); m.name = 'binCove'; group.add(m); fadeWithRoof(m, coveMat); }
  }

  var glassMat = makeGlassMaterial(preset.glass.zenith, preset.glass.horizon, sunDir);
  var roofGlass = new THREE.Mesh(roofGeo, glassMat);
  roofGlass.renderOrder = 5;
  roofGlass.visible = false;
  group.add(roofGlass);

  // inner sidewalls
  const wallTex = makeInnerWallTextures(aniso);
  const innerMat = new THREE.MeshStandardMaterial({
    map: wallTex.map, alphaMap: wallTex.alpha, alphaTest: 0.5,
    roughness: 0.78, side: THREE.DoubleSide,
  });
  const tArr = linspace(0, 1, 16);
  const span = FUS.THETA_F - FUS.THETA_C;
  const thR = tArr.map((t) => FUS.THETA_C + t * span);
  const thL = tArr.map((t) => TAU - FUS.THETA_C - t * span);
  const uvIn = (x, th, i, j) => [U(x), tArr[j]];
  add(surface(cabXs, thR, FUS.WALL, uvIn, true), innerMat, { name: 'wallR' });
  add(surface(cabXs, thL, FUS.WALL, uvIn, false), innerMat, { name: 'wallL' });

  // window bezels: moulded surround + a short tunnel to the skin, bent to the wall's curve,
  // and a few blinds pulled part-way down
  {
    const Ri = FUS.R - FUS.WALL;
    const rrect = (w, h, r) => {
      const sh = new THREE.Shape();
      const x = -w / 2, y = -h / 2;
      sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
      sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r);
      sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
      return sh;
    };
    const openPath = () => rrect(WIN.OPEN_W, WIN.OPEN_H, WIN.OPEN_W * 0.46);
    const face = rrect(WIN.BEZEL_W, WIN.BEZEL_H, WIN.BEZEL_W * 0.4);
    face.holes.push(openPath());
    const cs = hi ? 7 : 4;
    const faceGeo = new THREE.ExtrudeGeometry(face, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: hi ? 2 : 1, curveSegments: cs });
    const tube = rrect(WIN.OPEN_W + 0.03, WIN.OPEN_H + 0.03, (WIN.OPEN_W + 0.03) * 0.46);
    tube.holes.push(openPath());
    const tubeGeo = new THREE.ExtrudeGeometry(tube, { depth: 0.1, bevelEnabled: false, curveSegments: cs });
    tubeGeo.translate(0, 0, -0.1);
    const geo = mergeGeometries([faceGeo.toNonIndexed(), tubeGeo.toNonIndexed()], false);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + (p.getY(i) ** 2) / (2 * Ri) - 0.004);
    geo.computeVertexNormals();
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.48 });
    const bezels = new THREE.InstancedMesh(geo, bezelMat, WINDOWS.length * 2);
    const blindGeo = new THREE.PlaneGeometry(WIN.OPEN_W + 0.02, 1).translate(0, -0.5, 0);
    const blindMat = new THREE.MeshStandardMaterial({ color: 0xf1f3f6, roughness: 0.9, side: THREE.DoubleSide });
    const blinds = [];
    const rng = mulberry32(41);
    const th = Math.acos(WIN.y / Ri);
    const m = new THREE.Matrix4(), m2 = new THREE.Matrix4();
    let k = 0;
    for (const side of [1, -1]) {
      const pos = new THREE.Vector3(0, Ri * Math.cos(th), side * Ri * Math.sin(th));
      const nIn = new THREE.Vector3(0, -Math.cos(th), -side * Math.sin(th));
      const up = new THREE.Vector3(0, Math.sin(th), -side * Math.cos(th));
      const ax = new THREE.Vector3(-side, 0, 0);
      for (const x of WINDOWS) {
        m.makeBasis(ax, up, nIn).setPosition(x, pos.y, pos.z);
        bezels.setMatrixAt(k++, m);
        if (rng() < 0.24) {
          const drop = 0.18 + rng() * 0.3;
          m2.makeTranslation(0, WIN.OPEN_H / 2 + 0.01, -0.035).multiply(new THREE.Matrix4().makeScale(1, WIN.OPEN_H * drop, 1));
          blinds.push(m.clone().multiply(m2));
        }
      }
    }
    bezels.castShadow = true; bezels.receiveShadow = true;
    bezels.name = 'bezels';
    group.add(bezels);
    const bl = new THREE.InstancedMesh(blindGeo, blindMat, blinds.length);
    blinds.forEach((mm, i) => bl.setMatrixAt(i, mm));
    bl.castShadow = true; bl.receiveShadow = true;
    bl.name = 'blinds';
    group.add(bl);
  }

  // cut rim (top edge of the wall section)
  {
    const pos = [], nor = [], idx = [];
    for (const side of [1, -1]) {
      const th = side > 0 ? FUS.THETA_C : TAU - FUS.THETA_C;
      const base = pos.length / 3;
      for (const x of cabXs) {
        const { r, c } = fusProfile(x);
        pos.push(x, c + r * Math.cos(th), r * Math.sin(th));
        pos.push(x, c + (r - FUS.WALL) * Math.cos(th), (r - FUS.WALL) * Math.sin(th));
        nor.push(0, 1, 0, 0, 1, 0);
      }
      for (let i = 0; i < cabXs.length - 1; i++) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    add(g, new THREE.MeshStandardMaterial({ color: 0xf2f0ec, roughness: 0.6, side: THREE.DoubleSide }), { cast: false, name: 'rim' });
  }

  // sky-blue LED cove light running just under the top of each sidewall
  {
    const pos = [], idx = [];
    const xs = linspace(FUS.CABIN_X0 + 0.3, FUS.CABIN_X1 - 0.3, 60);
    for (const side of [1, -1]) {
      const base = pos.length / 3;
      for (const x of xs) {
        const { r, c } = fusProfile(x);
        const ri = r - FUS.WALL - 0.012;
        for (const dth of [0.028, 0.05]) {
          const th = side > 0 ? FUS.THETA_C + dth : TAU - FUS.THETA_C - dth;
          pos.push(x, c + ri * Math.cos(th), ri * Math.sin(th));
        }
      }
      for (let i = 0; i < xs.length - 1; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const cove = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.18, 0.72, 1.0).multiplyScalar(glow * 0.6), side: THREE.DoubleSide }));
    cove.name = 'cove';
    group.add(cove);
  }

  // bulkheads closing the cabin front and back
  const bulkMat = new THREE.MeshStandardMaterial({ color: 0xe7f0f8, roughness: 0.7, side: THREE.DoubleSide });
  for (const x of [FUS.CABIN_X0 + 0.02, FUS.CABIN_X1 - 0.02]) {
    const { r, c } = fusProfile(x);
    const ri = r - FUS.WALL;
    const thF = Math.acos(THREE.MathUtils.clamp((FUS.FLOOR_Y - c) / ri, -1, 1));
    const shape = new THREE.Shape();
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const th = thF - (i / steps) * (2 * thF); // right floor -> top -> left floor
      const z = ri * Math.sin(th), y = c + ri * Math.cos(th);
      if (i === 0) shape.moveTo(-z, y); else shape.lineTo(-z, y);
    }
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape, 1);
    g.rotateY(Math.PI / 2);
    g.translate(x, 0, 0);
    add(g, bulkMat, { name: 'bulkhead' });
  }

  // floor
  const carpet = makeFacetCarpetTexture({ size: 512, seed: 5 });
  carpet.anisotropy = aniso;
  var floorMat = new THREE.MeshPhysicalMaterial({ map: carpet, roughness: 0.96, metalness: 0, sheen: 0.5, sheenRoughness: 0.8, sheenColor: new THREE.Color('#d6e6f5') });
  {
    const pos = [], uv = [], idx = [];
    const xs = linspace(FUS.CABIN_X0, FUS.CABIN_X1, 40);
    xs.forEach((x, i) => {
      const { r, c } = fusProfile(x);
      const ri = r - FUS.WALL;
      const hw = Math.sqrt(Math.max(0, ri * ri - (FUS.FLOOR_Y - c) ** 2));
      pos.push(x, FUS.FLOOR_Y, -hw, x, FUS.FLOOR_Y, hw);
      uv.push(x * 0.55, -hw * 0.55, x * 0.55, hw * 0.55);
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // make sure the floor normal points up
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    add(g, floorMat, { cast: false, name: 'floor' });
  }

  }

  // ---------------- Flight deck ----------------
  // Behind the windscreen: the pilots' seats, the instrument panel with its six displays, the
  // glareshield, the centre pedestal with the thrust levers (one per engine), side consoles with
  // the sidesticks and the overhead panel. The windscreen is real glass cut into the nose skin,
  // so you can see out from the jump seat and, from outside, catch the glow of the displays.
  // Placed from the windscreen: the pilots' eyes level with the bottom of the front windows,
  // just behind the side windows, and the panel 75 cm ahead of the eyes.
  const wsAt = (x, deg, inset = 0) => {
    const { r, c } = fusProfile(x), ri = r - FUS.WALL - inset, th = THREE.MathUtils.degToRad(deg);
    return new THREE.Vector3(x, c + ri * Math.cos(th), ri * Math.sin(th));
  };
  const hwAt = (x, y) => { const { r, c } = fusProfile(x), ri = r - FUS.WALL; return Math.sqrt(Math.max(0, ri * ri - (y - c) ** 2)); };
  const roofAt = (x) => { const { r, c } = fusProfile(x); return c + r - FUS.WALL; };
  const wsFront = WS_POLY[0][0] + WINDSCREEN_DX, wsRear = Math.min(...WS_POLY.map((q) => q[0])) + WINDSCREEN_DX;
  const eyeX = wsRear + 0.05;
  const FD = {
    floor: wsAt(wsFront, 30).y + 0.1 - 1.18,
    back: IS_DD ? 31.6 : FUS.CABIN_X1 + 0.02,
    seatX: eyeX + 0.1, panelX: eyeX + 0.75, front: wsFront - 0.1,
  };
  const cockpit = new THREE.Group();
  cockpit.name = 'flightDeck';
  let cockpitCaptain = null;
  {
    const nose = group.getObjectByName('nose');
    const noseMat = paint.clone();
    noseMat.alphaMap = makeWindscreenMask();
    noseMat.alphaTest = 0.5;
    noseMat.side = THREE.FrontSide;
    nose.material = noseMat;
    const glass = new THREE.Mesh(nose.geometry, new THREE.MeshPhysicalMaterial({
      color: '#0d141c', roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03,
      transparent: true, opacity: 0.24, alphaMap: makeWindscreenMask({ glass: true }), alphaTest: 0.02,
      depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6,
    }));
    glass.name = 'windscreen'; glass.renderOrder = 4;
    group.add(glass);
    // inside of the nose (dark trim), with the same windscreen openings
    const lining = new THREE.MeshStandardMaterial({ color: 0x5c6570, roughness: 0.75, alphaMap: noseMat.alphaMap, alphaTest: 0.5, side: THREE.DoubleSide });
    const ix = linspace(FD.back, FUS.NOSE_END - 0.3, 30, 0.8);
    cockpit.add(new THREE.Mesh(surface(ix, linspace(-Math.PI, Math.PI, 73), FUS.WALL, (x, th) => [U(x), th / TAU], true), lining));
    // floor
    const fpos = [], fidx = [];
    linspace(FD.back, FD.front + 0.3, 16).forEach((x, i) => {
      const { r, c } = fusProfile(x);
      const ri = r - FUS.WALL - 0.02;
      const hw = Math.sqrt(Math.max(0, ri * ri - (FD.floor - c) ** 2));
      fpos.push(x, FD.floor, -hw, x, FD.floor, hw);
      if (i) { const a = (i - 1) * 2; fidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
    fg.setIndex(fidx);
    fg.computeVertexNormals();
    const fn = fg.attributes.normal; for (let i = 0; i < fn.count; i++) fn.setXYZ(i, 0, 1, 0);
    cockpit.add(new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: 0x3a414b, roughness: 0.95 })));
    if (IS_DD) {
      // back wall behind the seats (the double-decker's flight deck sits between the decks)
      const { r, c } = fusProfile(FD.back);
      const sh = new THREE.Shape(), ri = r - FUS.WALL;
      const th0 = Math.acos(THREE.MathUtils.clamp((FD.floor - c) / ri, -1, 1));
      for (let i = 0; i <= 32; i++) { const th = th0 - (i / 32) * 2 * th0; const z = ri * Math.sin(th), y = c + ri * Math.cos(th); if (i) sh.lineTo(-z, y); else sh.moveTo(-z, y); }
      sh.closePath();
      const bg = new THREE.ShapeGeometry(sh, 1); bg.rotateY(Math.PI / 2); bg.translate(FD.back, 0, 0);
      cockpit.add(new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: 0x3a414b, roughness: 0.8, side: THREE.DoubleSide })));
    }
    const deck = buildFlightDeck({ FD, nEng: IS_DD ? 4 : 2, hwAt, roofAt, wsAt, wsPoly: WS_POLY, wsDX: WINDSCREEN_DX });
    cockpit.add(deck.group);
    cockpitCaptain = deck.captainEye;
    cockpit.traverse((o) => { if (o.isMesh && o.castShadow === false) o.receiveShadow = true; });
  }
  group.add(cockpit);
  // where the camera sits for the flight-deck view: the jump seat behind the pilots
  const cockpitView = {
    // the single-aisle flight deck is short, so keep the eye just in front of its back wall
    eye: new THREE.Vector3(Math.max(FD.seatX - 1.25, FD.back + 0.22), FD.floor + 1.66, 0),
    look: new THREE.Vector3(Math.max(FD.seatX - 1.25, FD.back + 0.22) + 2.4, FD.floor + 0.62, 0),
    // from the captain's seat
    captain: cockpitCaptain ? { eye: cockpitCaptain.clone(), look: cockpitCaptain.clone().add(new THREE.Vector3(4, -0.25, 0.15)) } : null,
  };

  // belly / wing-body fairing
  {
    const g = new THREE.SphereGeometry(1, 48, 24);
    const m = add(g, paintPlain, { name: 'fairing' });
    if (IS_NARROW) { m.scale.set(8.4, 0.72, 1.86); m.position.set(1.6, -1.62, 0); }
    else if (IS_DD) { m.scale.set(17.5, 1.45, 3.7); m.position.set(3.4, -3.2, 0); }
    else { m.scale.set(12.5, 1.05, 2.75); m.position.set(2.6, -2.35, 0); }
  }

  // ---------------- Wings ----------------
  const wing = liftingSurface({
    span: WING.span, rootChord: WING.rootChord, kinkChord: WING.kinkChord, kinkAt: WING.kinkAt,
    tipChord: WING.tipChord, sweep: WING.sweep, dihedral: WING.dihedral,
    rootT: IS_DD ? 0.14 : 0.13, tipT: 0.095, camber: 0.02, flex: IS_DD ? 1.1 : IS_NARROW ? 0.4 : 0.9, winglet: IS_DD ? 1.2 : IS_NARROW ? 1.15 : 1.7, rake: IS_DD ? 0.6 : IS_NARROW ? 0.2 : 1.4, nSpan: 34, nChord: 24,
  });
  const wingR = add(wing.geometry, wingMat, { name: 'wingR' });
  wingR.position.set(WING.rootX, WING.rootY, WING.rootZ);
  const wingL = add(wing.geometry, wingMat, { name: 'wingL' });
  wingL.position.set(WING.rootX, WING.rootY, -WING.rootZ);
  wingL.scale.z = -1;

  // flap-track fairings
  const ftf = new THREE.CapsuleGeometry(0.19, 2.3, 6, 12);
  ftf.rotateZ(Math.PI / 2);
  for (const s of IS_DD ? [0.2, 0.4, 0.52, 0.7, 0.82] : IS_NARROW ? [0.42, 0.62] : [0.4, 0.56, 0.72]) {
    const chord = wing.chordAt(s);
    const xle = WING.rootX - s * WING.span * Math.tan(WING.sweep);
    const y = WING.rootY + s * WING.span * Math.tan(WING.dihedral) + 0.9 * s * s - 0.32;
    for (const side of [1, -1]) {
      const m = add(ftf, paintPlain);
      m.position.set(xle - chord * 0.93, y, side * (WING.rootZ + s * WING.span));
    }
  }

  // ---------------- Engines ----------------
  const fanTex = makeFanTexture();
  const fanMat = new THREE.MeshStandardMaterial({ map: fanTex, metalness: 0.6, roughness: 0.45 });
  const engineTex = makeEngineTexture(brandColors, hi);
  engineTex.anisotropy = aniso;
  const cowlMat = new THREE.MeshPhysicalMaterial({ map: engineTex, color: 0xffffff, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.1, side: THREE.DoubleSide });
  // even spacing along the profile so the cowl lettering isn't stretched
  const cowlCurve = new THREE.SplineCurve([[1.22, -2.6], [1.45, -2.0], [1.66, -1.0], [1.78, 0.3], [1.79, 1.6], [1.74, 2.6], [1.64, 3.25], [1.54, 3.5]].map(([r, y]) => new THREE.Vector2(r, y)));
  const cowlGeo = new THREE.LatheGeometry(cowlCurve.getSpacedPoints(44), 96);
  const cowlArc = cowlCurve.getLength();
  const rotors = [];
  const spinnerMat = new THREE.MeshStandardMaterial({ map: makeSpinnerTexture(), metalness: 0.35, roughness: 0.32 });
  const makeEngine = () => {
    const eg = new THREE.Group();
    const parts = new THREE.Group();
    const cowl = new THREE.Mesh(cowlGeo, cowlMat);
    const lip = new THREE.Mesh(lathe([[1.54, 3.5], [1.46, 3.57], [1.38, 3.47], [1.33, 3.2], [1.31, 2.6]], 72), metal);
    const core = new THREE.Mesh(lathe([[0.02, -4.45], [0.32, -4.1], [0.56, -3.6], [0.8, -3.05], [0.97, -2.5], [1.04, -2.0], [1.05, -1.4]], 48), darkMetal);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(1.31, 64), fanMat);
    fan.geometry.rotateX(-Math.PI / 2);
    fan.position.y = 2.62;
    const spinner = new THREE.Mesh(lathe([[0.44, 2.62], [0.38, 2.92], [0.22, 3.18], [0.0, 3.32]], 32), spinnerMat);
    parts.add(cowl, lip, core, fan, spinner);
    rotors.push(fan, spinner);
    parts.rotation.z = -Math.PI / 2;
    parts.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    eg.add(parts);
    // pylon (in world-aligned engine space)
    const ps = new THREE.Shape();
    ps.moveTo(2.3, 1.6); ps.lineTo(1.1, 2.25); ps.lineTo(-3.1, 2.35); ps.lineTo(-2.3, 1.5); ps.closePath();
    const pg = new THREE.ExtrudeGeometry(ps, { depth: 0.36, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
    pg.translate(0, 0, -0.18);
    const pylon = new THREE.Mesh(pg, paintPlain);
    pylon.castShadow = pylon.receiveShadow = true;
    eg.add(pylon);
    return eg;
  };
  const exhausts = [];
  // [x, y, z (starboard), scale]: hung under the wing's leading edge
  const enginePos = IS_DD ? [[3.45, -4.4, 13.4, 1.12], [-4.45, -3.05, 25.24, 1.12]] : IS_NARROW ? [[2.9, -2.35, 6.3, 0.7]] : [[3.2, -3.4, 10.8, 1]];
  for (const [x, y, z, sc] of enginePos) for (const side of [1, -1]) {
    const e = makeEngine();
    e.position.set(x, y, side * z);
    e.scale.setScalar(sc);
    group.add(e);
    exhausts.push(new THREE.Vector3(x - 4.45 * sc, y, side * z));
  }
  // ---------------- Landing gear ----------------
  // stowed in the wing roots and the nose in cruise; on approach the legs swing down (the main
  // gear inboard to outboard, the nose gear forward to back)
  const gear = [];
  {
    const tyre = new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.88 });
    const strutMat = new THREE.MeshStandardMaterial({ color: 0xd6dade, metalness: 0.6, roughness: 0.34 });
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x9aa1a9, metalness: 0.8, roughness: 0.3 });
    const legs = IS_NARROW
      ? [[1.6, 3.2, -1.6, 1.95, 1, 0.55], [1.6, -3.2, -1.6, 1.95, 1, 0.55], [13.0, 0, -1.6, 1.85, 1, 0.36]]
      : IS_DD
      ? [[2.4, 5.6, -3.0, 3.0, 2, 0.66], [2.4, -5.6, -3.0, 3.0, 2, 0.66], [-1.6, 2.0, -3.2, 2.9, 3, 0.66], [-1.6, -2.0, -3.2, 2.9, 3, 0.66], [31.0, 0, -3.0, 2.7, 1, 0.5]]
      : [[2.0, 4.6, -2.25, 2.55, 2, 0.6], [2.0, -4.6, -2.25, 2.55, 2, 0.6], [26.0, 0, -2.3, 2.35, 1, 0.45]];
    for (const [x, z, topY, len, axles, wr] of legs) {
      const nose = z === 0;
      const g = new THREE.Group(); g.position.set(x, topY, z);
      const inner = new THREE.Group(); g.add(inner);
      const parts = { strut: [], tyre: [], hub: [] };
      const leg = new THREE.CylinderGeometry(0.13, 0.15, len, 12); leg.translate(0, -len / 2, 0); parts.strut.push(leg);
      const brace = new THREE.CylinderGeometry(0.06, 0.06, len * 0.75, 8); brace.rotateZ(nose ? 0.5 : 0); brace.rotateX(nose ? 0 : (z > 0 ? -0.45 : 0.45)); brace.translate(nose ? -0.35 : 0, -len * 0.38, nose ? 0 : (z > 0 ? -0.32 : 0.32)); parts.strut.push(brace);
      const pitch = wr * 2.25;
      if (axles > 1) { const beam = new THREE.BoxGeometry(pitch * (axles - 1) + 0.4, 0.16, 0.2); beam.translate(0, -len, 0); parts.strut.push(beam); }
      for (let a = 0; a < axles; a++) for (const k of [-1, 1]) {
        const ax = (a - (axles - 1) / 2) * pitch, az = k * (nose ? 0.32 : 0.48);
        const w = new THREE.CylinderGeometry(wr, wr, 0.36, 24); w.rotateX(Math.PI / 2); w.translate(ax, -len, az); parts.tyre.push(w);
        const h = new THREE.CylinderGeometry(wr * 0.55, wr * 0.55, 0.38, 16); h.rotateX(Math.PI / 2); h.translate(ax, -len, az); parts.hub.push(h);
      }
      for (const [k, mat] of [['strut', strutMat], ['tyre', tyre], ['hub', hubMat]]) {
        const m = new THREE.Mesh(mergeGeometries(parts[k].map((q) => q.toNonIndexed()), false), mat);
        m.castShadow = true; m.receiveShadow = true;
        inner.add(m);
      }
      g.visible = false;
      group.add(g);
      gear.push({ g, inner, nose, side: Math.sign(z), len });
    }
  }
  // landing lights in the wing roots and on the nose gear, switched on for the approach
  const landingLights = [];
  {
    const tex = new THREE.CanvasTexture(makeCanvas2(64));
    tex.colorSpace = THREE.SRGBColorSpace;
    const mk = (parent, pos, size) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color('#fff6e6'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      sp.position.copy(pos); sp.scale.setScalar(size); sp.renderOrder = 6; sp.visible = false;
      parent.add(sp); landingLights.push(sp);
    };
    for (const k of [1, -1]) mk(group, new THREE.Vector3(WING.rootX - 1.6, WING.rootY + 0.05, k * (WING.rootZ + 2.6)), IS_DD ? 3.6 : 3.0);
    const ng = gear.find((q) => q.nose);
    if (ng) mk(ng.inner, new THREE.Vector3(0.25, -ng.len * 0.55, 0), 2.6);
  }
  // flight phase: 'cruise' (clean wing, gear up) or 'approach' (slats, flaps, gear and lights)
  const ctl = { phase: 'cruise', flap: 0, slat: 0, gear: 0, lights: 0, t: 0 };
  const toward = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
  const smooth01 = (x) => x * x * (3 - 2 * x);
  function updateControls(dt) {
    ctl.t += dt;
    const app = ctl.phase === 'approach';
    const m = ctl.manual;                                                         // takeoff and landing set them directly
    ctl.slat = toward(ctl.slat, m ? m.slat : app ? 1 : 0, dt / 3.0);              // slats first, about 3 s
    ctl.flap = toward(ctl.flap, m ? m.flap : app && ctl.slat > 0.6 ? 1 : app ? ctl.flap : 0, dt / 6.5);   // then flaps, about 6 s
    ctl.gear = toward(ctl.gear, m ? m.gear : app && ctl.flap > 0.35 ? 1 : 0, dt / (m ? 6 : 4.0));
    ctl.lights = toward(ctl.lights, m ? m.lights : app ? 1 : 0, dt / 0.6);
    // the autopilot keeps the wings level with small aileron and elevator movements
    const trim = 0.016 * Math.sin(ctl.t * 0.71) + 0.009 * Math.sin(ctl.t * 1.93 + 1.3);
    ctrlWing.uFlap.value = smooth01(ctl.flap) * 0.55;                            // about 31 degrees
    ctrlWing.uSlat.value = smooth01(ctl.slat) * 0.36;                            // about 21 degrees
    ctrlWing.uAil.value = trim * (app ? 2.4 : 1);
    ctrlTail.uAil.value = 0.01 * Math.sin(ctl.t * 0.47) - 0.06 * smooth01(ctl.flap);
    const ge = smooth01(ctl.gear);
    for (const q of gear) {
      q.g.visible = ctl.gear > 0.002;
      if (q.nose) q.inner.rotation.z = (1 - ge) * (Math.PI / 2);
      else q.inner.rotation.x = (1 - ge) * q.side * (Math.PI / 2) * 0.98;
    }
    for (const sp of landingLights) { sp.visible = ctl.lights > 0.01; sp.material.opacity = ctl.lights * (0.85 + 0.15 * Math.sin(ctl.t * 31)); }
  }
  // engines running: the fan turns (the eye sees it slowed by the frame rate, as on video) and
  // the spinner's spiral shows it at a glance; slower at approach power
  const spin = (dt) => {
    const rate = ctl.spool != null ? ctl.spool : ctl.phase === 'approach' ? 6.2 : 9.5;
    for (const r of rotors) r.rotation.y -= dt * rate;
    updateControls(dt);
  };

  // ---------------- Empennage ----------------
  const htp = liftingSurface(IS_NARROW ? {
    span: 6.0, rootChord: 3.9, tipChord: 1.4, sweep: (30 * Math.PI) / 180, dihedral: (6 * Math.PI) / 180,
    rootT: 0.1, tipT: 0.09, nSpan: 18, nChord: 18,
  } : IS_DD ? {
    span: 15.2, rootChord: 9.6, tipChord: 3.2, sweep: (34 * Math.PI) / 180, dihedral: (7 * Math.PI) / 180,
    rootT: 0.1, tipT: 0.09, nSpan: 18, nChord: 18,
  } : {
    span: 9.8, rootChord: 6.4, tipChord: 2.2, sweep: (34 * Math.PI) / 180, dihedral: (7 * Math.PI) / 180,
    rootT: 0.1, tipT: 0.09, nSpan: 18, nChord: 18,
  });
  const [hx, hy, hz] = IS_DD ? [-27.6, 0.9, 1.1] : IS_NARROW ? [-15.4, 0.55, 0.5] : [-26.0, 0.95, 0.85];
  const htpR = add(htp.geometry, tailplaneMat, { name: 'htpR' });
  htpR.position.set(hx, hy, hz);
  const htpL = add(htp.geometry, tailplaneMat, { name: 'htpL' });
  htpL.position.set(hx, hy, -hz);
  htpL.scale.z = -1;

  const vtp = liftingSurface(IS_NARROW ? {
    span: 6.1, rootChord: 5.6, tipChord: 2.0, sweep: (36 * Math.PI) / 180,
    rootT: 0.1, tipT: 0.09, nSpan: 20, nChord: 20, planarUV: 11.5, splitFaces: true,
  } : IS_DD ? {
    span: 13.4, rootChord: 12.4, tipChord: 4.3, sweep: (40 * Math.PI) / 180,
    rootT: 0.1, tipT: 0.09, nSpan: 20, nChord: 20, planarUV: 23.5, splitFaces: true,
  } : {
    span: 9.6, rootChord: 8.6, tipChord: 3.1, sweep: (40 * Math.PI) / 180,
    rootT: 0.1, tipT: 0.09, nSpan: 20, nChord: 20, planarUV: 17, splitFaces: true,
  });
  vtp.geometry.rotateX(-Math.PI / 2);
  const tailTex = makeTailTexture(brandColors, hi ? 2048 : 1024);
  tailTex.anisotropy = aniso;
  const tailMat = new THREE.MeshPhysicalMaterial({ map: tailTex, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1, side: THREE.DoubleSide });
  const vt = add(vtp.geometry, tailMat, { name: 'vtp' });
  if (IS_DD) vt.position.set(-25.2, 3.0, 0); else if (IS_NARROW) vt.position.set(-14.2, 1.45, 0); else vt.position.set(-24.8, 2.15, 0);

  // ---------------- Roof control ----------------
  // t = 1: solid painted roof, t = 0: glass
  function setRoof(t) {
    roofMat.opacity = t;
    roofMat.depthWrite = t > 0.98;
    roofSolid.visible = t > 0.001;
    roofSolid.castShadow = t > 0.98;
    glassMat.uniforms.uOpacity.value = 1 - t;
    roofGlass.visible = t < 0.999;
    ceilMat.opacity = t;
    ceilMat.depthWrite = t > 0.98;
    ceiling.visible = t > 0.001;
    binMat.opacity = t;
    binMat.depthWrite = t > 0.98;
    bins.visible = t > 0.001;
    for (const f of roofFaders) { f.mat.opacity = t; f.mat.depthWrite = t > 0.98; f.mesh.visible = t > 0.001; }
    roofT = t;
    applyDeck();
  }
  // double-decker: 'upper' shows the upper deck under the glass roof; 'main' also turns the band
  // between the decks to glass and lifts the upper deck away so you look down into the main deck
  let deckMode = 'upper', roofT = 1;
  const deckListeners = [];
  function applyDeck() {
    if (!IS_DD) return;
    const tb = deckMode === 'main' ? roofT : 1;
    bandMat.opacity = tb;
    bandMat.depthWrite = tb > 0.98;
    for (const m of bands) { m.visible = tb > 0.001; m.castShadow = tb > 0.98; }
    for (const m of bandGlass) m.visible = tb < 0.999;
    const showUpper = deckMode === 'upper' || roofT > 0.5;
    for (const m of upperParts) if (!showUpper) m.visible = false; else if (!roofFaders.some((f) => f.mesh === m)) m.visible = true;
    for (const m of slabParts) m.visible = showUpper;
    for (const f of deckListeners) f(showUpper);
  }
  function setDeck(mode) { deckMode = mode; applyDeck(); }
  setRoof(1);

  // ---------------- Night details ----------------
  // cabin windows glowing warm from inside, a floodlight on the fin, and the real lighting
  // pattern: red nav light on the left wingtip, green on the right, white at the tail, a red
  // anti-collision beacon on top and underneath, and white strobes flashing at the wingtips
  const windowGlow = makeWindowGlowTexture();
  paint.emissiveMap = windowGlow;
  paint.emissive = new THREE.Color('#ffd7a1');
  paint.emissiveIntensity = 0;
  paint.needsUpdate = true;
  if (bandMat) { bandMat.emissiveMap = windowGlow; bandMat.emissive = paint.emissive; bandMat.emissiveIntensity = 0; bandMat.needsUpdate = true; }
  tailMat.emissiveMap = tailTex;
  tailMat.emissive = new THREE.Color('#ffffff');
  tailMat.emissiveIntensity = 0;
  tailMat.needsUpdate = true;
  const lights = (() => {
    // find the real extremities of the airframe: wingtips, tail cone, top and bottom of the hull
    group.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    let zMax = null, zMin = null, xMin = null;
    group.traverse((o) => {
      if (!o.isMesh || !o.geometry.attributes.position) return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 3) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        if (!zMax || v.z > zMax.z) zMax = v.clone();
        if (!zMin || v.z < zMin.z) zMin = v.clone();
        if (Math.abs(v.z) < 0.3 && v.y < 3 && (!xMin || v.x < xMin.x)) xMin = v.clone();
      }
    });
    const c = makeCanvas2(64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.Group();
    g.name = 'navLights';
    const make = (color, pos, size) => {
      const m = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
      const s = new THREE.Sprite(m);
      s.position.copy(pos);
      s.scale.setScalar(size);
      s.userData.size = size;
      s.renderOrder = 6;
      g.add(s);
      return s;
    };
    const R = FUS.R;
    const navL = make('#ff3b30', zMin.clone().add(new THREE.Vector3(0.1, 0, 0.15)), 2.2);
    const navR = make('#34ff6e', zMax.clone().add(new THREE.Vector3(0.1, 0, -0.15)), 2.2);
    const tail = make('#ffffff', xMin.clone().add(new THREE.Vector3(-0.15, 0, 0)), 1.8);
    const beaconTop = make('#ff2a1a', new THREE.Vector3(2.0, R + 0.08, 0), 2.6);
    const beaconBot = make('#ff2a1a', new THREE.Vector3(3.0, -R - 0.08, 0), 2.6);
    const strobeL = make('#ffffff', zMin.clone().add(new THREE.Vector3(-0.3, 0, 0.2)), 4.5);
    const strobeR = make('#ffffff', zMax.clone().add(new THREE.Vector3(-0.3, 0, -0.2)), 4.5);
    group.add(g);
    let level = 0;
    return {
      setLevel(k) { level = k; },
      update(t) {
        const steady = 0.55 + 0.45 * level;
        for (const s of [navL, navR, tail]) s.material.opacity = steady;
        // beacon: about one flash a second; strobes: a quick double flash every 1.3 s
        const b = Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.1)), 18);
        for (const s of [beaconTop, beaconBot]) { s.material.opacity = (0.15 + 0.85 * b) * steady; s.scale.setScalar(s.userData.size * (0.7 + 0.5 * b)); }
        const ph = (t % 1.3) / 1.3;
        const st = (ph < 0.05 ? 1 : 0) + (ph > 0.12 && ph < 0.16 ? 1 : 0);
        for (const s of [strobeL, strobeR]) { s.material.opacity = st * (0.5 + 0.5 * level); s.visible = st > 0; }
      },
    };
  })();
  function makeCanvas2(n) {
    const c = document.createElement('canvas'); c.width = c.height = n;
    const g2 = c.getContext('2d');
    const grd = g2.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.18, 'rgba(255,255,255,0.85)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = grd; g2.fillRect(0, 0, n, n);
    return c;
  }
  // match the plane to the time of day: glass roof colours, window glow, fin light, nav lights
  function setSky(p) {
    glassMat.uniforms.uSky.value.set(p.glass.zenith);
    glassMat.uniforms.uHorizon.value.set(p.glass.horizon);
    glassMat.uniforms.uSunDir.value.copy(p.sunDir);
    glassMat.uniforms.uGlint.value = p.glint ?? 1;            // the moon's glint is much softer than the sun's
    paint.emissiveIntensity = (p.windowGlow || 0) * 1.6;
    if (bandMat) bandMat.emissiveIntensity = paint.emissiveIntensity;
    tailMat.emissiveIntensity = (p.stars ? 0.22 : 0);
    lights.setLevel(p.nav ?? 0.35);
  }
  setSky(preset);

  // brand artwork (async; the first frame waits for it via `ready`)
  const loadImg = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  const fontReady = document.fonts && document.fonts.load ? document.fonts.load('750 40px InterVar').catch(() => null) : Promise.resolve();
  const ready = Promise.all([loadImg('assets/brand/safar-wordmark.png'), fontReady]).then(([mark]) => {
    decorateLivery(livery, mark, IS_DD ? { colors: brandColors, xFront: 25.6, length: 13.3, yTop: 2.25, yBot: -0.75 } : IS_NARROW ? { colors: brandColors, xFront: 25.8, length: 9.0, yTop: 1.15, yBot: -0.85 } : { colors: brandColors });
  });

  return {
    group, setRoof, fadeWithRoof, setSky, updateLights: (t) => lights.update(t), spin, exhausts, roofSolid, roofGlass, paint, floorMat, ready,
    setDeck, get deck() { return deckMode; }, onDeck: (f) => deckListeners.push(f), cockpitView,
    setPhase: (p) => { ctl.phase = p; }, get phase() { return ctl.phase; },
    setTargets: (t) => { ctl.manual = t ? { flap: 0, slat: 0, gear: 0, lights: 0, ...t } : null; },
    setSpool: (r) => { ctl.spool = r; },
    snapControls: (t) => { Object.assign(ctl, t); },
    gearBottom: IS_DD ? 6.8 : IS_NARROW ? 4.1 : 5.42, mainGearX: IS_DD ? 0.4 : IS_NARROW ? 1.6 : 2.0,
  };
}
