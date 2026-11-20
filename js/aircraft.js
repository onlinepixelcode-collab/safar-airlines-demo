import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FUS, fusProfile, U, WING, WIN, WINDOWS, linspace, mulberry32 } from './geo.js';
import { makeLiveryTexture, makeInnerWallTextures, makeCarpetTexture, makeFacetCarpetTexture, makeFanTexture, decorateLivery, makeTailTexture, decorateTail, makeEngineTexture, decorateEngine, makeShellWindowMask, makeCeilingTexture } from './textures.js';
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

  const pos = [], col = [], uvs = [];
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
  col.push(colTop.r, colTop.g, colTop.b);
  if (planarUV) uvs.push(-(cx / M) / planarUV, splitFaces ? (0.5 * (cz / M)) / planarUV : (cz / M) / planarUV);
  for (let j = 0; j < M - 1; j++) idx.push(last + j, centre, last + j + 1);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (planarUV) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geometry: g, chordAt };
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
      uniform float uOpacity; uniform vec3 uSky; uniform vec3 uHorizon; uniform vec3 uSunDir;
      varying vec3 vN; varying vec3 vW;
      void main() {
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 v = normalize(cameraPosition - vW);
        float f = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 3.0);
        vec3 r = reflect(-v, n);
        vec3 env = mix(uHorizon, uSky, clamp(r.y * 0.6 + 0.4, 0.0, 1.0));
        float spec = pow(max(dot(r, uSunDir), 0.0), 260.0) * 3.0;
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
  const wingMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.0, clearcoat: 0.2, clearcoatRoughness: 0.3, envMapIntensity: 0.8, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9ced5, metalness: 1.0, roughness: 0.22 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x6d737c, metalness: 0.8, roughness: 0.42 });

  const add = (geo, mat, { cast = true, receive = true, name } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = receive;
    if (name) m.name = name;
    group.add(m);
    return m;
  };

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

  const roofGeo = surface(cabXs, roofTh, 0, uvOuter);
  // the skin is a single open surface: cast shadows from both faces, otherwise the sun-facing
  // side never blocks the sun and the closed cabin is lit straight through the roof
  paint.shadowSide = THREE.DoubleSide;
  const roofMat = paint.clone();
  roofMat.side = THREE.FrontSide;
  roofMat.transparent = true;
  roofMat.opacity = 1;
  const roofSolid = add(roofGeo, roofMat, { name: 'roof' });
  // cabin ceiling seen from inside when the roof closes over the camera (instead of the livery's back face)
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 0.75, emissive: 0xfff2e2, emissiveIntensity: 0.22, transparent: true, opacity: 1 });
  const ceiling = new THREE.Mesh(surface(cabXs, roofTh, FUS.WALL, uvOuter, true), ceilMat);
  ceiling.name = 'ceiling';
  group.add(ceiling);
  // overhead bins over Economy, Premium and Business (part of the closed cabin, so they fade with the roof)
  const binMat = new THREE.MeshStandardMaterial({ color: 0xf5f7f9, roughness: 0.42, transparent: true, opacity: 1 });
  const bins = (() => {
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
  const roofFaders = [];
  const fadeWithRoof = (mesh, mat) => { mat.transparent = true; roofFaders.push({ mesh, mat }); };
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

  const glassMat = makeGlassMaterial(preset.glass.zenith, preset.glass.horizon, sunDir);
  const roofGlass = new THREE.Mesh(roofGeo, glassMat);
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
  const floorMat = new THREE.MeshPhysicalMaterial({ map: carpet, roughness: 0.96, metalness: 0, sheen: 0.5, sheenRoughness: 0.8, sheenColor: new THREE.Color('#d6e6f5') });
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

  // belly / wing-body fairing
  {
    const g = new THREE.SphereGeometry(1, 48, 24);
    const m = add(g, paintPlain, { name: 'fairing' });
    m.scale.set(12.5, 1.05, 2.75);
    m.position.set(2.6, -2.35, 0);
  }

  // ---------------- Wings ----------------
  const wing = liftingSurface({
    span: WING.span, rootChord: WING.rootChord, kinkChord: WING.kinkChord, kinkAt: WING.kinkAt,
    tipChord: WING.tipChord, sweep: WING.sweep, dihedral: WING.dihedral,
    rootT: 0.13, tipT: 0.095, camber: 0.02, flex: 0.9, winglet: 1.7, rake: 1.4, nSpan: 34, nChord: 24,
  });
  const wingR = add(wing.geometry, wingMat, { name: 'wingR' });
  wingR.position.set(WING.rootX, WING.rootY, WING.rootZ);
  const wingL = add(wing.geometry, wingMat, { name: 'wingL' });
  wingL.position.set(WING.rootX, WING.rootY, -WING.rootZ);
  wingL.scale.z = -1;

  // flap-track fairings
  const ftf = new THREE.CapsuleGeometry(0.19, 2.3, 6, 12);
  ftf.rotateZ(Math.PI / 2);
  for (const s of [0.4, 0.56, 0.72]) {
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
  const makeEngine = () => {
    const eg = new THREE.Group();
    const parts = new THREE.Group();
    const cowl = new THREE.Mesh(cowlGeo, cowlMat);
    const lip = new THREE.Mesh(lathe([[1.54, 3.5], [1.46, 3.57], [1.38, 3.47], [1.33, 3.2], [1.31, 2.6]], 72), metal);
    const core = new THREE.Mesh(lathe([[0.02, -4.45], [0.32, -4.1], [0.56, -3.6], [0.8, -3.05], [0.97, -2.5], [1.04, -2.0], [1.05, -1.4]], 48), darkMetal);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(1.31, 64), fanMat);
    fan.geometry.rotateX(-Math.PI / 2);
    fan.position.y = 2.62;
    const spinner = new THREE.Mesh(lathe([[0.44, 2.62], [0.38, 2.92], [0.22, 3.18], [0.0, 3.32]], 32), new THREE.MeshStandardMaterial({ color: 0xd9dce1, metalness: 0.4, roughness: 0.3 }));
    parts.add(cowl, lip, core, fan, spinner);
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
  for (const side of [1, -1]) {
    const e = makeEngine();
    e.position.set(3.2, -3.4, side * 10.8);
    group.add(e);
  }

  // ---------------- Empennage ----------------
  const htp = liftingSurface({
    span: 9.8, rootChord: 6.4, tipChord: 2.2, sweep: (34 * Math.PI) / 180, dihedral: (7 * Math.PI) / 180,
    rootT: 0.1, tipT: 0.09, nSpan: 18, nChord: 18,
  });
  const htpR = add(htp.geometry, wingMat, { name: 'htpR' });
  htpR.position.set(-26.0, 0.95, 0.85);
  const htpL = add(htp.geometry, wingMat, { name: 'htpL' });
  htpL.position.set(-26.0, 0.95, -0.85);
  htpL.scale.z = -1;

  const vtp = liftingSurface({
    span: 9.6, rootChord: 8.6, tipChord: 3.1, sweep: (40 * Math.PI) / 180,
    rootT: 0.1, tipT: 0.09, nSpan: 20, nChord: 20, planarUV: 17, splitFaces: true,
  });
  vtp.geometry.rotateX(-Math.PI / 2);
  const tailTex = makeTailTexture(brandColors, hi ? 2048 : 1024);
  tailTex.anisotropy = aniso;
  const tailMat = new THREE.MeshPhysicalMaterial({ map: tailTex, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1, side: THREE.DoubleSide });
  const vt = add(vtp.geometry, tailMat, { name: 'vtp' });
  vt.position.set(-24.8, 2.15, 0);

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
  }
  setRoof(1);

  // brand artwork (async; the first frame waits for it via `ready`)
  const loadImg = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  const fontReady = document.fonts && document.fonts.load ? document.fonts.load('750 40px InterVar').catch(() => null) : Promise.resolve();
  const ready = Promise.all([loadImg('assets/brand/safar-wordmark.png'), fontReady]).then(([mark]) => {
    decorateLivery(livery, mark, { colors: brandColors });
  });

  return { group, setRoof, fadeWithRoof, roofSolid, roofGlass, paint, floorMat, ready };
}
