import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG, CLASS_ORDER, money, priceText } from './config.js';
import { FUS } from './geo.js';
import { buildAircraft } from './aircraft.js';
import { buildCabin } from './cabin.js';
import { buildSky, PRESETS } from './sky.js';
import { createUI } from './ui.js';

const gsap = window.gsap;
const V3 = THREE.Vector3;
const WORLD_UP = new V3(0, 1, 0);
const F = FUS.FLOOR_Y;

// ---------------------------------------------------------------- environment
const params = new URLSearchParams(location.search);
const todKey = PRESETS[params.get('tod')] ? params.get('tod') : CONFIG.timeOfDay;
const preset = PRESETS[todKey] || PRESETS.day;
const coarse = matchMedia('(pointer: coarse)').matches;
const isMobile = coarse || Math.min(innerWidth, innerHeight) < 640;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (params.has('nolag')) gsap.ticker.lagSmoothing(0); // testing in throttled/background tabs
const Q = {
  dpr: Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2),
  shadow: isMobile ? 1024 : 2048,
  bloom: !isMobile && params.get('bloom') !== '0',
  samples: isMobile ? 2 : 4,
};

const ui = createUI();
const canvas = document.getElementById('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
} catch (e) {
  document.getElementById('loader').querySelector('.loader-title').textContent = 'This device can’t run WebGL';
  throw e;
}
renderer.setPixelRatio(Q.dpr);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = preset.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
// A long lens for the views of the whole aircraft; in a seat the lens widens to roughly what
// your eyes take in, and the frame is shifted up so the view sits above the boarding pass.
const BASE_FOV = 30;
const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.5, 40000);
const lens = { fov: BASE_FOV, shift: 0 };

// ---------------------------------------------------------------- lights
const sun = new THREE.DirectionalLight(preset.sunColor, preset.sunIntensity);
sun.castShadow = true;
sun.shadow.mapSize.set(Q.shadow, Q.shadow);
sun.shadow.bias = -0.00025;
sun.shadow.normalBias = 0.035;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 340;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(preset.hemiSky, preset.hemiGround, preset.hemiIntensity);
scene.add(hemi);
// cabin lighting: when the camera is inside with the roof closed, the skin blocks the sun (it only
// gets in through the windows), so a soft cabin fill (warm-white ceiling light, cool bounce off
// the carpet) takes over
const cabinFill = new THREE.HemisphereLight('#fff0dc', '#9aa3ae', 0);
scene.add(cabinFill);
// daylight coming in through the windows on each side and crossing the cabin: it lights the
// seat sides and the far wall, while the wall around each window stays darker (as on board)
const daylight = [-1, 1].map((side) => {
  const l = new THREE.DirectionalLight('#e9f2ff', 0);
  l.position.set(2.5, 3.2, side * 10);
  scene.add(l, l.target);
  return l;
});
let gtao = null;   // ambient occlusion, created with the post chain below
let aoAllowed = params.get('ao') !== '0';   // switched off for good if a device can't keep up in the seat view
// 0 = outside / open cutaway, 1 = camera inside the closed cabin: warm overhead cabin light,
// a darker bounce from the carpet, window daylight, contact shadows in every corner, and far
// less of the outdoor sky light and reflections
function setInside(k) {
  cabinFill.intensity = 1.25 * k;
  for (const l of daylight) l.intensity = 0.95 * k;
  hemi.intensity = THREE.MathUtils.lerp(preset.hemiIntensity, 0.08, k);
  scene.environmentIntensity = THREE.MathUtils.lerp(preset.envIntensity, 0.24, k);
  if (gtao) { gtao.enabled = aoAllowed && k > 0.02; gtao.blendIntensity = k; }
}
const shadowFocus = { x: 2, y: 0, z: 0, r: 40 };
function applyShadowFocus() {
  sun.target.position.set(shadowFocus.x, shadowFocus.y, shadowFocus.z);
  sun.position.copy(sun.target.position).addScaledVector(preset.sunDir, 160);
  const c = sun.shadow.camera;
  c.left = -shadowFocus.r; c.right = shadowFocus.r; c.top = shadowFocus.r; c.bottom = -shadowFocus.r;
  c.updateProjectionMatrix();
}
applyShadowFocus();
function focusShadow(x, z, r, duration = 1.4) {
  gsap.to(shadowFocus, { x, z, r, duration, ease: 'power2.inOut', onUpdate: applyShadowFocus });
}

// ---------------------------------------------------------------- world
ui.setLoader(0.15);
const sky = buildSky({ scene, renderer, preset, isMobile });
scene.environment = sky.env;
sky.setSize(innerWidth, innerHeight);
scene.environmentIntensity = preset.envIntensity;
const ac = buildAircraft({ aniso: Math.min(8, renderer.capabilities.getMaxAnisotropy()), sunDir: preset.sunDir, preset, hi: !isMobile && renderer.capabilities.maxTextureSize >= 8192, glow: Q.bloom ? 3.0 : 1.35 });
const airframe = new THREE.Group();
airframe.name = 'airframe';
airframe.add(ac.group);
scene.add(airframe);
ui.setLoader(0.45);
const cabin = buildCabin({ glow: Q.bloom ? 3.0 : 1.35, lowPoly: isMobile, fade: ac.fadeWithRoof });
airframe.add(cabin.group);
const flight = { amp: 1, t: 0 };   // 1 = floating in turbulence-free cruise, 0 = locked (seat picking, fly-in)
function updateFlight(dt) {
  flight.t += dt;
  const a = flight.amp;
  airframe.position.y = (Math.sin(flight.t * 0.55) * 0.32 + Math.sin(flight.t * 1.27) * 0.06) * a;
  airframe.rotation.x = (Math.sin(flight.t * 0.31) * 0.0045 + Math.sin(flight.t * 0.83) * 0.0012) * a;  // bank
  airframe.rotation.z = Math.sin(flight.t * 0.42 + 1.3) * 0.0022 * a;                                    // pitch
}
const lockFlight = (lock, duration = 1.2) => gsap.to(flight, { amp: lock ? 0 : 1, duration, ease: 'power2.inOut' });
ui.setLoader(0.6);

// ---------------------------------------------------------------- post
const rt = new THREE.WebGLRenderTarget(innerWidth * Q.dpr, innerHeight * Q.dpr, { type: THREE.HalfFloatType, samples: Q.samples });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(Q.dpr);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
// Ambient occlusion (GTAO) for the cabin interior: soft shadow where seats meet the floor,
// under the bins, in the window reveals and between cushions. Rendered at reduced resolution
// and only switched on while the camera is inside the closed cabin.
{
  // occlusion is soft and low-detail, so a third of the render resolution is plenty on desktop
  // (phones start with fewer pixels, so they keep more of them to avoid visible grain)
  const aoScale = isMobile ? 0.6 : 0.35;
  gtao = new GTAOPass(scene, camera, 2, 2, undefined,
    { radius: 0.34, distanceExponent: 1.5, thickness: 1.4, scale: 1.3, samples: isMobile ? 10 : 12, distanceFallOff: 1, screenSpaceRadius: false },
    { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: isMobile ? 7 : 6, rings: 2, samples: isMobile ? 12 : 8 });
  const baseSize = gtao.setSize.bind(gtao);
  gtao.setSize = (w, h) => baseSize(Math.max(2, Math.round(w * aoScale)), Math.max(2, Math.round(h * aoScale)));
  // occlusion is soft and the camera barely moves in a seat: work it out every other frame and
  // reuse it in between (the blend onto the picture still happens every frame)
  {
    const fullRender = gtao.render.bind(gtao);
    let tick = 0, fresh = false;
    gtao.render = (renderer, writeBuffer, readBuffer, dt, mask) => {
      tick++;
      if (!fresh || tick % 2 === 0 || S.mode !== 'scene') { fullRender(renderer, writeBuffer, readBuffer, dt, mask); fresh = true; return; }
      gtao.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture;
      gtao.copyMaterial.blending = THREE.NoBlending;
      gtao.renderPass(renderer, gtao.copyMaterial, gtao.renderToScreen ? null : writeBuffer);
      gtao.blendMaterial.uniforms.intensity.value = gtao.blendIntensity;
      gtao.blendMaterial.uniforms.tDiffuse.value = gtao.pdRenderTarget.texture;
      gtao.renderPass(renderer, gtao.blendMaterial, gtao.renderToScreen ? null : writeBuffer);
    };
  }
  // the depth/normal pass must skip the sky, the cloud layer, see-through things (glass, glow
  // rings, soft floor shadows) and the light strips themselves (they glow, they aren't shaded)
  const baseHide = gtao.overrideVisibility.bind(gtao);
  gtao.overrideVisibility = () => {
    baseHide();
    sky.group.visible = false;
    scene.traverse((o) => {
      const m = o.material;
      if (!o.isMesh || !o.visible || !m || Array.isArray(m)) return;
      if ((m.transparent && m.opacity < 0.99) || m.isMeshBasicMaterial) o.visible = false;
    });
  };
  gtao.enabled = false;
  composer.addPass(gtao);
}
let bloom = null;
if (Q.bloom) {
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.4, 1.7);
  composer.addPass(bloom);
}
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- camera rig
const rig = { pos: new V3(), target: new V3(), up: new V3(0, 1, 0) };
const motion = { drift: 1, parallax: 1, t: 0 };
const pointer = { x: 0, y: 0, sx: 0, sy: 0, inside: false };
const tmpF = new V3(), tmpR = new V3(), tmpU = new V3();

function applyCamera(dt) {
  motion.t += dt;
  pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 2.5);
  pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 2.5);
  const d = rig.pos.distanceTo(rig.target);
  tmpF.subVectors(rig.target, rig.pos).normalize();
  tmpR.crossVectors(tmpF, rig.up).normalize();
  tmpU.crossVectors(tmpR, tmpF).normalize();
  const k = d * 0.012;
  const dx = (Math.sin(motion.t * 0.19) * motion.drift + pointer.sx * 1.4 * motion.parallax) * k;
  const dy = (Math.cos(motion.t * 0.15) * 0.7 * motion.drift + pointer.sy * 1.0 * motion.parallax) * k;
  camera.position.copy(rig.pos).addScaledVector(tmpR, dx).addScaledVector(tmpU, dy);
  camera.up.copy(rig.up);
  camera.lookAt(rig.target);
  const near = THREE.MathUtils.clamp(d * 0.02, 0.03, 2.0);
  let dirty = false;
  if (Math.abs(near - camera.near) > 1e-4) { camera.near = near; dirty = true; }
  if (Math.abs(lens.fov - camera.fov) > 1e-3) { camera.fov = lens.fov; dirty = true; }
  const sh = Math.round(lens.shift * innerHeight);
  if (sh !== (camera.view && camera.view.enabled ? camera.view.offsetY : 0)) {
    if (sh) camera.setViewOffset(innerWidth, innerHeight, 0, sh, innerWidth, innerHeight);
    else camera.clearViewOffset();
    dirty = false;
  }
  if (dirty) camera.updateProjectionMatrix();
}

const isPortrait = () => camera.aspect < 0.95;
const seatFov = () => (isPortrait() ? 66 : 54);
// how far the seat view is lifted (fraction of the screen height) to clear the ticket at the bottom
const seatShift = () => (isPortrait() ? 0.2 : 0.11);
function framePose(cx, cz, lenLong, lenShort, tilt = 0.2, ty = F) {
  const portrait = isPortrait();
  const tanV = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));
  const tanH = tanV * camera.aspect;
  const dist = Math.max(lenLong / (2 * (portrait ? tanV : tanH)), lenShort / (2 * (portrait ? tanH : tanV)));
  const up = portrait ? new V3(1, 0, 0) : new V3(0, 0, -1);
  const off = portrait ? new V3(-tilt, 1, 0.1).normalize() : new V3(-0.05, 1, tilt).normalize();
  const target = new V3(cx, ty, cz);
  // nudge the target so the subject sits between the top bar and the bottom dock
  if (portrait) target.x -= dist * 0.02; else target.z += dist * 0.012;
  return { pos: target.clone().addScaledVector(off, dist), target, up };
}
const overviewPose = () => (isPortrait() ? framePose(1.5, 0, 82, 26, 0.16, -0.5) : framePose(1.5, 0, 80, 40, 0.2, -0.5));
function classPose(cls) {
  const z = cabin.classes[cls].zone;
  const L = z.x1 - z.x0;
  return isPortrait() ? framePose(z.cx, 0, L * 1.3 + 3, 7.4, 0.24) : framePose(z.cx, 0, L * 1.32 + 3.2, 7.6, 0.3);
}
// Opening shot: a big side profile of the aircraft with the SAFAR titles, like the livery artwork.
function heroPose() {
  const portrait = isPortrait();
  const tanV = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));
  const tanH = tanV * camera.aspect;
  if (!portrait) {
    const len = 71 * 1.04;
    const dist = Math.max(len / (2 * tanH), 26 / (2 * tanV));
    const target = new V3(0.6, 0.6, 0);
    return { pos: new V3(0.6 + dist * 0.03, 0.6 + dist * 0.045, dist), target, up: WORLD_UP.clone() };
  }
  const width = 27;                     // the forward fuselage and the titles fill a phone screen
  const dist = width / (2 * tanH);
  const target = new V3(16.5, 0.4, 0);
  return { pos: new V3(16.5 - dist * 0.04, 0.4 + dist * 0.05, dist), target, up: WORLD_UP.clone() };
}
function introPose() {
  const k = isPortrait() ? 1.9 : 1.0;
  const target = new V3(2, -0.8, 0);
  return { pos: target.clone().add(new V3(44 * k, 40 * k, 58 * k)), target, up: WORLD_UP.clone() };
}
function setRig(p) { rig.pos.copy(p.pos); rig.target.copy(p.target); rig.up.copy(p.up); }

let rigTween = null;
function moveRig(to, { duration = 2, ease = 'power2.inOut', arc = 0 } = {}) {
  if (rigTween) rigTween.kill();
  const from = { pos: rig.pos.clone(), target: rig.target.clone(), up: rig.up.clone() };
  const st = { t: 0 };
  return new Promise((res) => {
    rigTween = gsap.to(st, {
      t: 1, duration: reduce ? Math.min(duration, 0.5) : duration, ease,
      onUpdate: () => {
        const t = st.t;
        rig.pos.lerpVectors(from.pos, to.pos, t);
        if (arc) rig.pos.y += Math.sin(Math.PI * t) * arc;
        rig.target.lerpVectors(from.target, to.target, t);
        rig.up.lerpVectors(from.up, to.up, t).normalize();
      },
      onComplete: () => { rigTween = null; res(); },
    });
  });
}

// ---------------------------------------------------------------- looking around from a seat
// Sitting in a seat you see the live cabin: turn your head by dragging (or with the arrow keys),
// and on a desktop the view also follows the mouse a little, like a slight turn of the head.
const look = { on: false, eye: new V3(), fwd: new V3(1, 0, 0), dist: 3, yaw: 0, pitch: 0, ty: 0, tp: 0, drag: null };
const LOOK_YAW = 1.9, LOOK_UP = 0.5, LOOK_DOWN = -0.7;
const lookDir = new V3(), lookRight = new V3();
function startLook(eye, target) {
  look.eye.copy(eye);
  look.fwd.subVectors(target, eye);
  look.dist = Math.max(1, look.fwd.length());
  look.fwd.normalize();
  look.yaw = look.pitch = look.ty = look.tp = 0;
  look.drag = null;
  look.on = true;
}
function stopLook() { look.on = false; look.drag = null; ui.body.classList.remove('looking'); }
function updateLook(dt) {
  if (!look.on) return;
  const k = Math.min(1, dt * (look.drag ? 14 : 5));
  look.yaw += (look.ty - look.yaw) * k;
  look.pitch += (look.tp - look.pitch) * k;
  const follow = coarse || look.drag ? 0 : 1;
  const yaw = look.yaw - pointer.sx * 0.22 * follow;
  const pitch = THREE.MathUtils.clamp(look.pitch + pointer.sy * 0.08 * follow, LOOK_DOWN, LOOK_UP);
  lookDir.copy(look.fwd).applyAxisAngle(WORLD_UP, yaw);
  lookRight.crossVectors(lookDir, WORLD_UP).normalize();
  lookDir.applyAxisAngle(lookRight, pitch);
  rig.pos.copy(look.eye);
  rig.target.copy(look.eye).addScaledVector(lookDir, look.dist);
  rig.up.copy(WORLD_UP);
}
function nudgeLook(dyaw, dpitch) {
  look.ty = THREE.MathUtils.clamp(look.ty + dyaw, -LOOK_YAW, LOOK_YAW);
  look.tp = THREE.MathUtils.clamp(look.tp + dpitch, LOOK_DOWN, LOOK_UP);
}

// ---------------------------------------------------------------- state
const S = {
  mode: 'loading',      // loading | intro | overview | class | flying | scene
  cls: null,
  hoverCls: null,
  hoverSeat: null,
  selected: null,
  busy: false,
  scene: null,          // { cls, seat, room }
};
let renderOn = true;
const roof = { v: 1 };
const setRoof = (v) => { roof.v = v; ac.setRoof(v); };
const deckBlur = () => {};   // the old photo deck used a mip-bias blur; the volumetric clouds don't need it

function setMode(mode) {
  S.mode = mode;
  ui.body.classList.toggle('mode-class', mode === 'class' || (mode === 'flying'));
}
function chrome(on) { ui.body.classList.toggle('ui-on', on); }

// highlight helpers
const hlTweens = {};
function tweenHL(cls, v, duration = 0.35) {
  const c = cabin.classes[cls];
  if (hlTweens[cls]) hlTweens[cls].kill();
  hlTweens[cls] = gsap.to(c, { hl: v, duration, ease: 'power2.out', onUpdate: () => cabin.setClassHighlight(cls, c.hl) });
}
const ringState = { cls: null, o: 0 };
let ringTween = null;
function ring(cls, opacity) {
  if (ringTween) ringTween.kill();
  if (cls) ringState.cls = cls;
  ringTween = gsap.to(ringState, { o: opacity, duration: 0.3, ease: 'power2.out', onUpdate: () => cabin.showClassRing(ringState.cls, ringState.o) });
}

const tagAnchor = new V3();
let tagTarget = null; // { type: 'class'|'seat', cls, seat }

function setHoverClass(cls, { fromPill = false } = {}) {
  if (S.hoverCls === cls) return;
  const prev = S.hoverCls;
  S.hoverCls = cls;
  const inClass = S.mode === 'class';
  if (prev && prev !== S.cls) tweenHL(prev, 0);
  if (cls && cls !== S.cls) tweenHL(cls, inClass ? 0.45 : 1);
  if (cls) {
    ring(cls, inClass ? 0.45 : 0.9);
    ui.showClassTag(cls, cabin.freeCount(cls));
    tagTarget = { type: 'class', cls };
  } else {
    ring(null, 0);
    if (!S.hoverSeat && !S.selected) { ui.hideTag(); tagTarget = null; }
  }
  ui.pillHover(fromPill ? cls : cls);
  ui.body.classList.toggle('can-click', !!cls || !!S.hoverSeat);
}

function setHoverSeat(seat, { sticky = false } = {}) {
  if (S.hoverSeat === seat && !sticky) return;
  S.hoverSeat = seat;
  cabin.setHoverSeat(seat || S.selected || null);
  if (seat) {
    if (S.hoverCls) setHoverClass(null);
    ui.showSeatTag(seat, { go: coarse && S.selected === seat });
    tagTarget = { type: 'seat', seat };
  } else if (S.selected) {
    ui.showSeatTag(S.selected, { go: coarse });
    tagTarget = { type: 'seat', seat: S.selected };
  } else if (!S.hoverCls) {
    ui.hideTag();
    tagTarget = null;
  }
  ui.body.classList.toggle('can-click', !!seat || !!S.hoverCls);
}

function updateTag() {
  if (!tagTarget || S.busy || (S.mode !== 'overview' && S.mode !== 'class')) return;
  if (tagTarget.type === 'class') {
    const z = cabin.classes[tagTarget.cls].zone;
    tagAnchor.set(z.cx, F + 2.4, 0);
  } else {
    const s = tagTarget.seat;
    const c = s.ringCentre || s.pos;
    tagAnchor.set(c.x, F + (s.cls === 'residence' || s.cls === 'first' ? 1.9 : 1.45), c.z);
  }
  tagAnchor.project(camera);
  const x = (tagAnchor.x * 0.5 + 0.5) * innerWidth;
  const y = (-tagAnchor.y * 0.5 + 0.5) * innerHeight;
  ui.placeTag(x, y);
}

// ---------------------------------------------------------------- picking
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let pickPending = false;
function setNdc(e) {
  ndc.x = (e.clientX / innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / innerHeight) * 2 + 1;
}
function pick() {
  raycaster.setFromCamera(ndc, camera);
  if (S.mode === 'overview') {
    const h = raycaster.intersectObjects(cabin.zoneMeshes, false)[0];
    setHoverClass(h ? h.object.userData.cls : null);
  } else if (S.mode === 'class') {
    const h = raycaster.intersectObjects(cabin.pickables[S.cls], false)[0];
    const seat = cabin.seatFromHit(h);
    if (seat) { setHoverSeat(seat); return; }
    if (!coarse) setHoverSeat(null);
    const z = raycaster.intersectObjects(cabin.zoneMeshes, false)[0];
    const other = z && z.object.userData.cls !== S.cls ? z.object.userData.cls : null;
    if (!seat && other) setHoverClass(other); else if (!seat) setHoverClass(null);
  }
}

canvas.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -((e.clientY / innerHeight) * 2 - 1);
  if (e.pointerType === 'mouse') { setNdc(e); pickPending = true; }
});
canvas.addEventListener('pointerleave', () => {
  pointer.x = pointer.y = 0;
  if (S.mode === 'overview') setHoverClass(null);
  if (S.mode === 'class' && !coarse) { setHoverSeat(null); setHoverClass(null); }
});
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const dt = performance.now() - down.t;
  down = null;
  if (moved > 12 || dt > 700) return;
  onTap(e);
});

function onTap(e) {
  if (S.mode === 'intro') { skipIntro(); return; }
  if (S.busy) return;
  setNdc(e);
  pick();
  if (S.mode === 'overview') {
    if (S.hoverCls) enterClass(S.hoverCls);
    return;
  }
  if (S.mode === 'class') {
    const seat = S.hoverSeat;
    if (seat) {
      if (coarse && S.selected !== seat) {
        S.selected = seat;
        setHoverSeat(seat, { sticky: true });
        return;
      }
      activateSeat(seat);
      return;
    }
    if (S.hoverCls && S.hoverCls !== S.cls) { enterClass(S.hoverCls); return; }
    if (coarse && S.selected) { S.selected = null; setHoverSeat(null); }
  }
}
ui.tagGo.addEventListener('click', () => { if (S.selected) activateSeat(S.selected); });

function activateSeat(seat) {
  if (seat.booked && !seat.yours) {
    ui.shakeTag();
    ui.toast(`${seat.cls === 'first' ? 'Suite' : 'Seat'} ${seat.id} is taken. The orange ones are free.`);
    return;
  }
  flyToSeat(seat, seat.cls === 'residence' ? 'living' : null);
}

// ---------------------------------------------------------------- navigation
function classHint(cls) {
  ui.hint(cls === 'residence'
    ? `${coarse ? 'Tap' : 'Click'} ${CONFIG.classes.residence.name} to step inside`
    : (coarse ? 'Tap a seat to preview, tap again to fly in' : 'Hover a seat · click to fly in'));
}
async function enterClass(cls) {
  if (S.busy) return;
  S.busy = true;
  const prevCls = S.cls;
  setHoverClass(null);
  S.selected = null;
  setHoverSeat(null);
  ui.hideTag();
  tagTarget = null;
  if (prevCls && prevCls !== cls) tweenHL(prevCls, 0);
  S.cls = cls;
  setMode('class');
  lockFlight(true);
  ui.setActivePill(cls);
  ui.els.btnAll.hidden = false;
  ui.els.legend.hidden = cls === 'residence';
  classHint(cls);
  tweenHL(cls, 0.62, 0.6);
  ring(cls, 0.35);
  const z = cabin.classes[cls].zone;
  focusShadow(z.cx, 0, Math.max(9, (z.x1 - z.x0) * 0.75));
  deckBlur(1.1);
  await moveRig(classPose(cls), { duration: prevCls ? 1.3 : 1.7, ease: 'power3.inOut', arc: prevCls ? 3 : 0 });
  ring(cls, 0);
  S.busy = false;
  pickPending = true;
}

async function leaveClass() {
  if (S.busy || S.mode !== 'class') return;
  S.busy = true;
  const cls = S.cls;
  S.selected = null;
  setHoverSeat(null);
  setHoverClass(null);
  ui.hideTag();
  tweenHL(cls, 0, 0.5);
  S.cls = null;
  ui.setActivePill(null);
  ui.els.btnAll.hidden = true;
  ui.els.legend.hidden = true;
  setMode('overview');
  lockFlight(false, 1.6);
  ui.hint(coarse ? 'Tap a cabin to see its seats' : 'Hover a cabin to see prices');
  focusShadow(2, 0, 40);
  deckBlur(0.0);
  await moveRig(overviewPose(), { duration: 1.6, ease: 'power3.inOut' });
  S.busy = false;
}

ui.els.btnAll.addEventListener('click', leaveClass);
ui.buildPills({
  onPick: (cls) => {
    if (S.mode === 'overview' || S.mode === 'class') { if (S.cls !== cls) enterClass(cls); }
  },
  onHover: (cls) => {
    if (S.mode === 'overview') setHoverClass(cls, { fromPill: true });
  },
});

// ---------------------------------------------------------------- seats
function pickUpgradeSeat(cls, fromSeat) {
  const c = cabin.classes[cls];
  const conf = CONFIG.classes[cls];
  if (cls === 'residence') return c.seats[0];
  const featured = cabin.byId.get(conf.featured);
  if (featured && (!featured.booked || featured.yours)) return featured;
  const side = fromSeat ? fromSeat.side : -1;
  return c.seats.find((s) => !s.booked && s.window && s.side === side) || c.seats.find((s) => !s.booked) || c.seats[0];
}

// ---------------------------------------------------------------- fly in
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a, b, t) => { const x = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

async function flyToSeat(seat, room) {
  if (S.busy) return;
  S.busy = true;
  setMode('flying');
  ui.hideTag();
  tagTarget = null;
  chrome(false);
  const { eye, look } = cabin.eyeFor(seat, room, { portrait: isPortrait() });
  const P0 = rig.pos.clone(), T0 = rig.target.clone(), U0 = rig.up.clone();
  const F0 = lens.fov, F1 = seatFov(), H1 = seatShift();
  const above = seat.pos.clone().add(new V3(-3.2, 6.5, -seat.side * 1.6));
  const curve = new THREE.CatmullRomCurve3([P0, above, eye], false, 'centripetal', 0.5);
  const mid = seat.pos.clone().add(new V3(0.5, 0.7, 0));
  focusShadow(seat.pos.x, seat.pos.z, 7, 1.6);
  // the "available" glow is a map overlay: fade it before the camera drops into the cabin
  gsap.delayedCall(reduce ? 0 : 0.8, () => tweenHL(seat.cls, 0, reduce ? 0.3 : 0.8));
  deckBlur(2.6, 2);
  gsap.to(motion, { drift: 0, parallax: 0, duration: 0.6 });
  const st = { t: 0 };
  let opened = false;
  const dur = reduce ? 0.8 : 2.7;
  await new Promise((res) => {
    gsap.to(st, {
      t: 1, duration: dur, ease: 'power2.inOut',
      onUpdate: () => {
        const t = st.t;
        curve.getPoint(t, rig.pos);
        if (t < 0.55) rig.target.lerpVectors(T0, mid, easeIO(t / 0.55));
        else rig.target.lerpVectors(mid, look, easeIO((t - 0.55) / 0.45));
        rig.up.lerpVectors(U0, WORLD_UP, smooth(0.2, 0.8, t)).normalize();
        setRoof(smooth(0.66, 0.93, t));
        setInside(smooth(0.6, 0.9, t));
        lens.fov = THREE.MathUtils.lerp(F0, F1, smooth(0.5, 1.0, t));
        lens.shift = H1 * smooth(0.6, 1.0, t);
        const blur = Math.sin(Math.PI * smooth(0.45, 0.95, t)) * (isMobile ? 0 : 4);
        canvas.style.filter = blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : '';
        if (t > 0.82 && !opened) {
          opened = true;
          openScene({ cls: seat.cls, seat, room, fromFly: true });
        }
      },
      onComplete: res,
    });
  });
  canvas.style.filter = '';
  startLook(eye, look);
  gsap.to(motion, { drift: 0.3, duration: 1.5 });
}

// Fly from the seat you're in to a seat in another cabin: up out of the seat while the roof
// turns to glass, over the cabins, and down into the new seat as the roof closes again.
function flyBetweenSeats(eye, target, { duration = 3.1 } = {}) {
  const P0 = rig.pos.clone(), T0 = rig.target.clone();
  const dx = eye.x - P0.x;
  const top = new V3((P0.x + eye.x) / 2 - 1.2, F + 6.2 + Math.abs(dx) * 0.16, (P0.z + eye.z) * 0.25);
  const curve = new THREE.CatmullRomCurve3([P0, top, eye], false, 'centripetal', 0.5);
  const overLook = new V3(eye.x + 1.0, F + 0.6, eye.z * 0.5);
  const F0 = lens.fov, F1 = seatFov(), Fm = 40, H0 = lens.shift, H1 = seatShift();
  focusShadow((P0.x + eye.x) / 2, 0, Math.abs(dx) / 2 + 8, duration * 0.4);
  gsap.delayedCall(duration * 0.55, () => focusShadow(eye.x, eye.z, 7, duration * 0.45));
  gsap.to(motion, { drift: 0, duration: 0.4 });
  const st = { t: 0 };
  return new Promise((res) => gsap.to(st, {
    t: 1, duration: reduce ? 0.8 : duration, ease: 'power2.inOut',
    onUpdate: () => {
      const t = st.t;
      curve.getPoint(t, rig.pos);
      if (t < 0.5) rig.target.lerpVectors(T0, overLook, easeIO(t / 0.5));
      else rig.target.lerpVectors(overLook, target, easeIO((t - 0.5) / 0.5));
      rig.up.copy(WORLD_UP);
      const open = smooth(0.03, 0.3, t) * (1 - smooth(0.7, 0.95, t));
      setRoof(1 - open);
      setInside(1 - smooth(0.0, 0.26, t) + smooth(0.68, 0.94, t));
      lens.fov = t < 0.5 ? THREE.MathUtils.lerp(F0, Fm, smooth(0, 0.5, t)) : THREE.MathUtils.lerp(Fm, F1, smooth(0.5, 1, t));
      lens.shift = t < 0.5 ? H0 * (1 - smooth(0, 0.35, t)) : H1 * smooth(0.65, 1, t);
    },
    onComplete: () => { gsap.to(motion, { drift: 0.3, duration: 1.2 }); res(); },
  }));
}

// Walk between the rooms of The Residence: out through the door, along the corridor, in
// through the next door, the way you would on board.
function walkRooms(seat, fromRoom, toRoom, eye, target) {
  const a = seat.rooms[fromRoom] || seat.rooms.living, b = seat.rooms[toRoom];
  const h = F + 1.55, zin = seat.doorZ + 0.5, zout = seat.corridorZ;
  const pts = [rig.pos.clone(), new V3(a.door, h, zin), new V3(a.door, h, zout + 0.05),
    new V3(b.door, h, zout + 0.05), new V3(b.door, h, zin), eye.clone()];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const len = curve.getLength();
  const T0 = rig.target.clone();
  const ahead = new V3(), walk = new V3(), dir = new V3();
  focusShadow((a.door + b.door) / 2, 0.3, 6, 0.8);
  const st = { u: 0 };
  return new Promise((res) => gsap.to(st, {
    u: 1, duration: reduce ? 0.6 : THREE.MathUtils.clamp(len / 2.1, 2.2, 4.2), ease: 'power1.inOut',
    onUpdate: () => {
      const u = st.u;
      curve.getPointAt(u, rig.pos);
      curve.getPointAt(Math.min(1, u + 0.1), ahead);
      dir.subVectors(ahead, rig.pos);
      dir.y = 0;
      if (dir.lengthSq() < 1e-6) dir.subVectors(target, rig.pos);
      dir.normalize();
      walk.copy(rig.pos).addScaledVector(dir, 2.5);
      walk.y = rig.pos.y - 0.25;
      rig.target.copy(T0).lerp(walk, smooth(0, 0.15, u)).lerp(target, smooth(0.72, 0.98, u));
      rig.up.copy(WORLD_UP);
    },
    onComplete: res,
  }));
}

// ---------------------------------------------------------------- scenes
const E = ui.els;
let sceneTl = null;

function configureSceneUI(cls, seat, { room } = {}) {
  const conf = CONFIG.classes[cls];
  const isRes = cls === 'residence';
  ui.fillPass(cls, seat);
  E.btnBook.classList.remove('is-done');
  E.btnBook.disabled = false;
  const word = cls === 'first' ? 'Suite' : 'seat';
  E.btnBook.textContent = seat.yours ? '✓ Booked' : isRes ? `Book ${conf.name}` : `Book ${word} ${seat.id}`;
  if (seat.yours) E.btnBook.classList.add('is-done');
  if (conf.upsell) {
    E.upsellLabel.textContent = conf.upsell.label;
    E.upsellLabel.hidden = false;
    E.btnUpsell.innerHTML = `${conf.upsell.cta} <span aria-hidden="true">→</span>`;
    E.btnUpsell.dataset.to = conf.upsell.to;
  } else {
    E.upsellLabel.hidden = true;
    E.btnUpsell.innerHTML = `Back to the plane`;
    E.btnUpsell.dataset.to = '';
  }
  ui.sceneEl.classList.toggle('residence-rooms', isRes);
  E.roomNav.hidden = !isRes;
  E.roomBar.hidden = !isRes;
  E.sceneUi.classList.toggle('show-pass', !isRes);
  ui.pass.hidden = isRes;
  E.actions.hidden = isRes;
  if (isRes) setRoomUI(room || 'living');
}

function setRoomUI(roomId) {
  const conf = CONFIG.classes.residence;
  const i = Math.max(0, conf.rooms.findIndex((r) => r.id === roomId));
  const r = conf.rooms[i];
  E.roomName.textContent = r.name;
  E.roomTabs.innerHTML = '';
  conf.rooms.forEach((x) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'room-tab';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', x.id === r.id ? 'true' : 'false');
    b.textContent = x.name;
    b.addEventListener('click', () => goRoom(x.id));
    E.roomTabs.appendChild(b);
  });
  E.roomBarLabel.textContent = r.label;
  const next = conf.rooms[i + 1];
  E.btnRoomNext.innerHTML = next ? `Next: ${next.name} <span aria-hidden="true">→</span>` : `Reserve ${conf.name} <span aria-hidden="true">→</span>`;
  E.btnRoomNext.dataset.next = next ? next.id : '';
}

function animateSceneUIIn(delay = 0) {
  const items = [E.roomNav, ui.pass, E.actions, E.roomBar].filter((el) => !el.hidden);
  gsap.fromTo(items, { y: 34, opacity: 0, filter: 'blur(6px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.9, delay, ease: 'power3.out', stagger: 0.1 });
  gsap.fromTo(E.btnSceneBack, { opacity: 0 }, { opacity: 1, duration: 0.6, delay: delay + 0.3 });
}
function animateSceneUIOut(duration = 0.45) {
  const items = [E.roomNav, ui.pass, E.actions, E.roomBar].filter((el) => !el.hidden);
  return new Promise((res) => gsap.to(items, { y: 22, opacity: 0, filter: 'blur(4px)', duration, ease: 'power2.in', stagger: 0.04, onComplete: res }));
}

// "Drag to look around": shown once you're seated, gone after the first look
let lookHintTimer = 0;
function showLookHint() {
  clearTimeout(lookHintTimer);
  E.lookHint.textContent = coarse ? 'Drag to look around' : 'Drag to look around · or use the arrow keys';
  E.lookHint.classList.add('show');
  lookHintTimer = setTimeout(hideLookHint, 4200);
}
function hideLookHint() { clearTimeout(lookHintTimer); E.lookHint.classList.remove('show'); }

function openScene({ cls, seat, room, fromFly }) {
  S.scene = { cls, seat, room: room || null };
  configureSceneUI(cls, seat, { room });
  ui.sceneEl.classList.add('on');
  ui.sceneEl.setAttribute('aria-hidden', 'false');
  ui.body.classList.add('in-scene');
  gsap.set([E.roomNav, ui.pass, E.actions, E.roomBar, E.btnSceneBack], { opacity: 0 });
  gsap.to(ui.sceneEl, { opacity: 1, duration: fromFly ? 0.8 : 0.5, ease: 'power2.out' });
  animateSceneUIIn(fromFly ? 0.45 : 0.2);
  setTimeout(() => {
    if (S.scene) { setMode('scene'); S.busy = false; showLookHint(); }
  }, 1100);
}

async function upgradeTo(cls) {
  if (S.busy || !S.scene) return;
  S.busy = true;
  const from = S.scene.seat;
  const seat = pickUpgradeSeat(cls, from);
  const conf = CONFIG.classes[cls];
  const order = CLASS_ORDER.indexOf(cls) + 1;
  stopLook();
  hideLookHint();
  await animateSceneUIOut();
  setMode('flying');
  const gold = cls === 'first' || cls === 'residence';
  const room = cls === 'residence' ? 'living' : null;
  const { eye, look: target } = cabin.eyeFor(seat, room, { portrait: isPortrait() });
  const card = ui.titleCard({
    kicker: `Class ${String(order).padStart(2, '0')} / ${String(CLASS_ORDER.length).padStart(2, '0')}`,
    title: conf.name,
    sub: cls === 'residence' ? `${conf.tagline} · ${priceText(conf.price)}` : '',
    gold,
    hold: 1.0,
  });
  await flyBetweenSeats(eye, target);
  startLook(eye, target);
  S.scene = { cls, seat, room };
  configureSceneUI(cls, seat, { room });
  gsap.set([E.roomNav, ui.pass, E.actions, E.roomBar], { opacity: 0 });
  await card;
  animateSceneUIIn(0.05);
  setMode('scene');
  setTimeout(() => { S.busy = false; }, 600);
}

async function goRoom(roomId) {
  if (S.busy || !S.scene || S.scene.cls !== 'residence') return;
  if (S.scene.room === roomId && E.sceneUi.classList.contains('show-pass') === false) return;
  S.busy = true;
  const seat = S.scene.seat;
  const fromRoom = S.scene.room || 'living';
  stopLook();
  hideLookHint();
  await animateSceneUIOut(0.35);
  E.sceneUi.classList.remove('show-pass');
  ui.pass.hidden = true; E.actions.hidden = true; E.roomBar.hidden = false;
  S.scene.room = roomId;
  setRoomUI(roomId);
  const { eye, look: target } = cabin.eyeFor(seat, roomId);
  if (fromRoom !== roomId) {
    setMode('flying');
    await walkRooms(seat, fromRoom, roomId, eye, target);
    setMode('scene');
  }
  startLook(eye, target);
  animateSceneUIIn(0.1);
  setTimeout(() => { S.busy = false; }, 400);
}

async function showResidencePass() {
  if (S.busy) return;
  S.busy = true;
  await animateSceneUIOut(0.35);
  E.roomBar.hidden = true;
  ui.pass.hidden = false;
  E.actions.hidden = false;
  E.sceneUi.classList.add('show-pass');
  animateSceneUIIn(0.05);
  setTimeout(() => { S.busy = false; }, 400);
}

E.btnRoomNext.addEventListener('click', () => {
  const next = E.btnRoomNext.dataset.next;
  if (next) goRoom(next); else showResidencePass();
});
E.btnUpsell.addEventListener('click', () => {
  const to = E.btnUpsell.dataset.to;
  if (to) upgradeTo(to); else backToPlane();
});
E.btnBook.addEventListener('click', async () => {
  if (!S.scene || E.btnBook.classList.contains('is-done') || E.btnBook.disabled) return;
  const { cls, seat } = S.scene;
  const conf = CONFIG.classes[cls];
  E.btnBook.disabled = true;
  E.btnBook.innerHTML = '<span class="spin" aria-hidden="true"></span> Holding your seat';
  await new Promise((r) => setTimeout(r, 900));
  cabin.markYours(seat);
  ui.fillPass(cls, seat);
  E.btnBook.disabled = false;
  E.btnBook.classList.add('is-done');
  E.btnBook.textContent = '✓ Booked';
  const label = cls === 'residence' ? conf.name : `${conf.seatWord} ${seat.id}`;
  ui.toast(`${label} is yours. Boarding ${conf.boards} at gate ${conf.gate}.`, 4200);
});
E.btnSceneBack.addEventListener('click', () => backToPlane());

async function backToPlane() {
  if (!S.scene || (S.busy && S.mode !== 'scene')) return;
  S.busy = true;
  const { seat } = S.scene;
  const cls = seat.cls;
  // the camera is already in the seat: stand up, out through the roof and back to the cabin map
  stopLook();
  hideLookHint();
  S.cls = cls;
  cabin.classes[cls].hl = 0;
  for (const k of CLASS_ORDER) if (k !== cls) cabin.setClassHighlight(k, 0);
  const z = cabin.classes[cls].zone;
  await animateSceneUIOut(0.35);
  gsap.to(ui.sceneEl, {
    opacity: 0, duration: 0.6, ease: 'power2.inOut',
    onComplete: () => {
      ui.sceneEl.classList.remove('on', 'residence-rooms');
      ui.sceneEl.setAttribute('aria-hidden', 'true');
    },
  });
  ui.body.classList.remove('in-scene');
  S.scene = null;
  setMode('flying');
  const to = classPose(cls);
  const P0 = rig.pos.clone(), T0 = rig.target.clone();
  const above = new V3(P0.x - 3.0, F + 6.0, P0.z * 0.4 - seat.side * 1.0);
  const curve = new THREE.CatmullRomCurve3([P0, above, to.pos], false, 'centripetal', 0.5);
  const F0 = lens.fov, H0 = lens.shift;
  gsap.to(motion, { drift: 0, duration: 0.3 });
  focusShadow(z.cx, 0, Math.max(9, (z.x1 - z.x0) * 0.75), 1.8);
  deckBlur(1.1, 1.8);
  const st = { t: 0 };
  await new Promise((res) => gsap.to(st, {
    t: 1, duration: reduce ? 0.6 : 2.3, ease: 'power2.inOut',
    onUpdate: () => {
      const t = st.t;
      curve.getPoint(t, rig.pos);
      rig.target.lerpVectors(T0, to.target, easeIO(t));
      rig.up.lerpVectors(WORLD_UP, to.up, smooth(0.15, 0.75, t)).normalize();
      setRoof(1 - smooth(0.05, 0.4, t));
      setInside(1 - smooth(0.0, 0.35, t));
      lens.fov = THREE.MathUtils.lerp(F0, BASE_FOV, smooth(0.0, 0.55, t));
      lens.shift = H0 * (1 - smooth(0.0, 0.4, t));
    },
    onComplete: res,
  }));
  lens.fov = BASE_FOV; lens.shift = 0;
  gsap.to(motion, { drift: 1, parallax: 1, duration: 1.2 });
  setMode('class');
  tweenHL(cls, 0.62, 0.6);
  ui.setActivePill(cls);
  ui.els.btnAll.hidden = false;
  ui.els.legend.hidden = cls === 'residence';
  classHint(cls);
  chrome(true);
  S.busy = false;
  if (seat.yours) {
    S.selected = null;
    setHoverSeat(seat);
    setTimeout(() => { if (S.hoverSeat === seat) setHoverSeat(null); }, 2200);
  }
}

const ARROWS = { ArrowLeft: [0.22, 0], ArrowRight: [-0.22, 0], ArrowUp: [0, 0.12], ArrowDown: [0, -0.12] };
addEventListener('keydown', (e) => {
  if (ARROWS[e.key] && look.on && S.mode === 'scene') {
    e.preventDefault();
    nudgeLook(...ARROWS[e.key]);
    hideLookHint();
    return;
  }
  if (e.key !== 'Escape') return;
  if (S.mode === 'scene') backToPlane();
  else if (S.mode === 'class') leaveClass();
});

// drag anywhere on the view (not on the ticket or the buttons) to turn your head
ui.sceneEl.addEventListener('pointerdown', (e) => {
  if (!look.on || S.mode !== 'scene' || look.drag) return;
  if (e.target.closest('button, a, .pass, .actions, .room-bar, .room-nav')) return;
  look.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  try { ui.sceneEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  ui.body.classList.add('looking');
  hideLookHint();
});
ui.sceneEl.addEventListener('pointermove', (e) => {
  if (!look.drag || e.pointerId !== look.drag.id) return;
  const rad = THREE.MathUtils.degToRad(lens.fov) / innerHeight;   // drag the view 1:1 under your finger
  nudgeLook((e.clientX - look.drag.x) * rad, (e.clientY - look.drag.y) * rad);
  look.drag.x = e.clientX; look.drag.y = e.clientY;
});
const endLookDrag = (e) => {
  if (!look.drag || e.pointerId !== look.drag.id) return;
  look.drag = null;
  ui.body.classList.remove('looking');
};
ui.sceneEl.addEventListener('pointerup', endLookDrag);
ui.sceneEl.addEventListener('pointercancel', endLookDrag);
// the head-follow uses the same smoothed pointer as the aircraft views
addEventListener('pointermove', (e) => {
  if (S.mode !== 'scene' || e.pointerType !== 'mouse') return;
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -((e.clientY / innerHeight) * 2 - 1);
});

// ---------------------------------------------------------------- intro
let introTweens = [];
async function intro() {
  setMode('intro');
  if (params.has('skip')) { ui.hideLoader(); setRig(overviewPose()); setRoof(0); finishIntro(); return; }   // testing
  const hero = heroPose();
  setRig(hero);
  setRoof(1);
  flight.amp = 1;
  ui.hideLoader();
  // 1. hold on the side profile, easing in slowly
  const push = { k: 0 };
  // ease in towards the SAFAR titles so the logo grows on screen
  const logoX = isPortrait() ? 18 : 9;
  const heroEnd = {
    pos: hero.pos.clone().lerp(hero.target, isPortrait() ? 0.12 : 0.2).add(new V3(logoX - hero.target.x, 0.2, 0)),
    target: new V3(logoX, hero.target.y, 0),
    up: hero.up.clone(),
  };
  const holdDur = reduce ? 0.4 : 3.4;
  await new Promise((res) => {
    const tw = gsap.to(push, {
      k: 1, duration: holdDur, ease: 'sine.inOut',
      onUpdate: () => {
        rig.pos.lerpVectors(hero.pos, heroEnd.pos, push.k);
        rig.target.lerpVectors(hero.target, heroEnd.target, push.k);
      },
      onComplete: res,
    });
    introTweens.push(tw);
  });
  // 2. rise up and over into the top-down cutaway while the roof turns to glass
  const to = overviewPose();
  const P0 = rig.pos.clone(), T0 = rig.target.clone(), U0 = rig.up.clone();
  const portrait = isPortrait();
  const mid = portrait
    ? new V3(6, to.pos.y * 0.5, P0.z * 0.55)
    : new V3(P0.x * 0.5 + 8, to.pos.y * 0.6, P0.z * 0.62);
  const curve = new THREE.CatmullRomCurve3([P0, mid, to.pos], false, 'centripetal', 0.5);
  const st = { t: 0 };
  const moveDur = reduce ? 0.6 : 5.6;
  await new Promise((res) => {
    const tw = gsap.to(st, {
      t: 1, duration: moveDur, ease: 'power2.inOut',
      onUpdate: () => {
        const t = st.t;
        curve.getPoint(t, rig.pos);
        rig.target.lerpVectors(T0, to.target, smooth(0.0, 0.85, t));
        rig.up.lerpVectors(U0, to.up, smooth(0.25, 0.95, t)).normalize();
        setRoof(1 - smooth(0.55, 0.92, t));
      },
      onComplete: res,
    });
    introTweens.push(tw);
  });
  setRoof(0);
  finishIntro();
}
function skipIntro() {
  for (const t of introTweens) if (t) t.progress(1);
}
let introDone = false;
function finishIntro() {
  if (introDone) return;
  introDone = true;
  setMode('overview');
  chrome(true);
  ui.hint(coarse ? 'Tap a cabin to see its seats' : 'Hover a cabin to see prices');
  pickPending = true;
}

// ---------------------------------------------------------------- resize
function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  sky.setSize(innerWidth, innerHeight);
  if (bloom) bloom.setSize(innerWidth / 2, innerHeight / 2);
  if (camera.view && camera.view.enabled) camera.clearViewOffset();   // re-applied at the new size next frame
  if (look.on && S.mode === 'scene') { lens.fov = seatFov(); lens.shift = seatShift(); }
  if (!S.busy && !rigTween) {
    if (S.mode === 'overview') setRig(overviewPose());
    else if (S.mode === 'class') setRig(classPose(S.cls));
  }
}
addEventListener('resize', onResize);

// ---------------------------------------------------------------- adaptive quality
const perf = { frames: 0, time: 0, rounds: 0 };
function adapt(dt) {
  if (perf.rounds >= 6 || (S.mode !== 'overview' && S.mode !== 'class' && S.mode !== 'intro')) return;
  if (dt > 0.2 || document.hidden) return; // throttled/background frames tell us nothing
  perf.frames++; perf.time += dt;
  if (perf.time < 2.0) return;
  const avg = perf.time / perf.frames;
  perf.frames = 0; perf.time = 0;
  if (avg <= 1 / 50) { perf.rounds = 6; return; }      // smooth: stop checking
  perf.rounds++;
  if (sky.quality < 4) { sky.setQuality(sky.quality + 1); return; }
  const dpr = Math.max(1, renderer.getPixelRatio() * 0.8);
  renderer.setPixelRatio(dpr);
  composer.setPixelRatio(dpr);
  composer.setSize(innerWidth, innerHeight);
  if (bloom && avg > 1 / 30) bloom.enabled = false;
}

// in a seat: if frames are slow on this device, drop the ambient occlusion (the costliest extra)
const seatPerf = { frames: 0, time: 0, checks: 0 };
function guardSeat(dt) {
  if (!aoAllowed || S.mode !== 'scene' || seatPerf.checks >= 3) return;
  if (dt > 0.2 || document.hidden) return;
  seatPerf.frames++; seatPerf.time += dt;
  if (seatPerf.time < 2.0) return;
  const avg = seatPerf.time / seatPerf.frames;
  seatPerf.frames = 0; seatPerf.time = 0; seatPerf.checks++;
  if (avg > 1 / 32) { aoAllowed = false; gtao.enabled = false; }
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function tick(now) {
  const raw = (now - last) / 1000;
  const dt = Math.min(0.05, raw);
  last = now;
  sky.update(dt);
  updateFlight(dt);
  if (pickPending && !S.busy && (S.mode === 'overview' || S.mode === 'class')) { pickPending = false; pick(); }
  if (renderOn) {
    updateLook(dt);
    applyCamera(dt);
    updateTag();
    sky.renderClouds(camera);
    composer.render(dt);
    adapt(raw);
    guardSeat(raw);
  }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- boot
(async function boot() {
  setRig(introPose());
  applyCamera(0);
  await Promise.all([sky.ready, ac.ready]);
  scene.environment = sky.captureEnvironment();   // paint and glass now reflect the actual clouds and ocean
  ui.setLoader(0.85);
  try { renderer.compile(scene, camera); } catch (e) { /* older drivers */ }
  composer.render(0);
  ui.setLoader(1);
  requestAnimationFrame(tick);
  intro();
})();

// debugging handle
window.__flight = { THREE, scene, camera, cabin, ac, S, rig, renderer, composer, gtao, sky, airframe, flight, cabinFill, setInside, enterClass, flyToSeat, focusShadow, look, lens, nudgeLook, upgradeTo, goRoom, backToPlane };
