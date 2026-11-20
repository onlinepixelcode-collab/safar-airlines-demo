import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG, CLASS_ORDER, money, priceText } from './config.js';
import { FUS, IS_DD, IS_NARROW, PLANE } from './geo.js';
import { buildAircraft } from './aircraft.js';
import { buildCabin, DECK_OF, floorOf } from './cabin.js';
import { buildSky, PRESETS, TIME_ORDER } from './sky.js';
import { createUI } from './ui.js';
import { createRain, createLightning, createContrails, createCloudBank } from './weather.js';
import { createCabinAudio } from './audio.js';
import { createCompare, createRoutePicker, sheet } from './features.js';
import { i18n } from './i18n.js';
import { TOD_ICON } from './icons.js';
import { createIFE } from './ife.js';
import { buildAirport } from './airport.js';
import { ROUTE } from './config.js';

const gsap = window.gsap;
const V3 = THREE.Vector3;
const WORLD_UP = new V3(0, 1, 0);
const F = FUS.FLOOR_Y;

// ---------------------------------------------------------------- environment
const params = new URLSearchParams(location.search);
// time of day: ?tod= in the link wins, then the visitor's last choice, then the config default
const savedTod = (() => { try { return localStorage.getItem('safar-tod'); } catch (e) { return null; } })();
let todKey = [params.get('tod'), savedTod, CONFIG.timeOfDay, 'day'].find((k) => k && PRESETS[k]);
let preset = PRESETS[todKey];
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
let insideK = 0;
function setInside(k) {
  insideK = k;
  // at night the cabin glows a little even from outside (the cutaway stays readable), and the
  // light through the windows is moonlight, not daylight
  // night flight: the cabin dims to warm mood lighting under the blue coves, as airlines do
  // after the meal service; by day it is bright and neutral
  const night = !!preset.night;
  cabinFill.color.set(night ? '#ffc38a' : '#fff0dc');
  cabinFill.groundColor.set(night ? '#45467e' : '#9aa3ae');
  cabinFill.intensity = (night ? 0.6 : 1.25) * k + (preset.cabinGlow || 0) * (1 - k);
  for (const l of daylight) l.intensity = 0.95 * k * (preset.windowLight ?? 1);
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
// double-decker: which deck is on show (the upper deck lifts away to show the main deck), and
// only that deck's cabins can be picked on the map
ac.onDeck((showUpper) => { cabin.upperGroup.visible = showUpper; });
ac.setDeck(ac.deck);
const deckZones = () => (IS_DD ? cabin.zoneMeshes.filter((z) => z.userData.deck === ac.deck) : cabin.zoneMeshes);
const deckFloor = () => (IS_DD && ac.deck === 'upper' ? FUS.UPPER_Y : FUS.FLOOR_Y);
function showDeck(deck) {
  if (!IS_DD) return;
  if (ac.deck !== deck) ac.setDeck(deck);
  if (typeof updateDeckUI === 'function') updateDeckUI();
}
// weather: rain streaks and lightning (only in the Rain sky)
const rain = createRain({ isMobile });
scene.add(rain.object);
const lightning = createLightning();
rain.setLevel(preset.rain || 0);
lightning.setOn(!!preset.lightning);
// contrails behind the engines, and the odd bank of cloud the aircraft flies through
// (var: the time-of-day code can run before this point)
var contrails = createContrails(ac.exhausts); scene.add(contrails.object);
var cloudBank = createCloudBank({ isMobile }); scene.add(cloudBank.object);
// the seat-screen pages (moving map, flight info, destination) on every screen in the cabin
var ife = createIFE();
cabin.screenMat.userData.live = true;
cabin.screenMat.emissiveMap = ife.texture;
cabin.screenMat.needsUpdate = true;
function lightWeather() {
  if (!contrails || !cloudBank) return;
  const c = preset.clouds;
  const sunC = new THREE.Color(...c.sun).multiplyScalar(c.power * 0.34);
  const amb = new THREE.Color(...c.ambTop).multiplyScalar(0.9);
  const low = typeof J !== 'undefined' && J.airport;            // taking off or landing: no contrails, no cloud banks
  contrails.setLight(sunC, amb, preset.rain || ac.phase === 'approach' || low ? 0 : preset.night ? 0.3 : 0.82);
  cloudBank.setLight(sunC, amb, low || reduce ? 0 : preset.night ? 0.55 : 0.78, !!preset.rain);
}
lightWeather();
airframe.add(cabin.group);
const flight = { amp: 1, t: 0 };   // 1 = floating in turbulence-free cruise, 0 = locked (seat picking, fly-in)
function updateFlight(dt) {
  flight.t += dt;
  const a = flight.amp;
  airframe.position.y = (Math.sin(flight.t * 0.55) * 0.32 + Math.sin(flight.t * 1.27) * 0.06) * a;
  airframe.rotation.x = (Math.sin(flight.t * 0.31) * 0.0045 + Math.sin(flight.t * 0.83) * 0.0012) * a;  // bank
  airframe.rotation.z = Math.sin(flight.t * 0.42 + 1.3) * 0.0022 * a;                                    // pitch
  if (typeof J !== 'undefined' && J.on && J.pitch) {
    // takeoff and landing: the nose rotates up about the main wheels, not the middle of the plane
    const px = ac.mainGearX, py = -ac.gearBottom, c = Math.cos(J.pitch), sn = Math.sin(J.pitch);
    airframe.rotation.z += J.pitch;
    airframe.position.x = px - (px * c - py * sn);
    airframe.position.y += py - (px * sn + py * c);
  } else airframe.position.x = 0;
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
      if (o.isSprite) { o.visible = false; return; }
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
// On a phone held upright the cabins fill the screen between the top bar and the text at the
// bottom (the wingtips run off the sides), so seats are big enough to pick without zooming.
const overviewPose = () => (isPortrait()
  ? fitPose(OVERVIEW_DIR_PORTRAIT, { mx: 0.96, ...clearBand(), up: NOSE_UP, pts: cabinOutline() })
  : IS_DD ? framePose(2.0, 0, 92, 47, 0.2, deckFloor() + 0.75) : IS_NARROW ? framePose(1.0, 0, 47, 25, 0.2, FUS.FLOOR_Y + 0.75) : framePose(1.5, 0, 80, 40, 0.2, -0.5));
// the free band between the top bar and the headline (in normalised screen units), so the
// aircraft never sits under the text, whatever the phone's size
function clearBand() {
  const H = innerHeight, toNdc = (px) => 1 - (2 * px) / H;
  const bar = document.querySelector('.topbar'), head = document.querySelector('.headline');
  const top = bar ? toNdc(bar.getBoundingClientRect().bottom + 10) : 0.8;
  const bottom = head ? toNdc(head.getBoundingClientRect().top - 12) : -0.4;
  if (!(top > bottom + 0.4)) return { my: 0.62, lift: 0.17 };
  return { my: (top - bottom) / 2, lift: (top + bottom) / 2 };
}
const OVERVIEW_DIR_PORTRAIT = new V3(-0.16, 1, 0.1).normalize();
const NOSE_UP = new V3(1, 0, 0);
function classPose(cls) {
  const z = cabin.classes[cls].zone;
  const L = z.x1 - z.x0;
  const w = IS_DD ? 2.0 : IS_NARROW ? -2.6 : 0, ty = floorOf(cls);
  return isPortrait() ? framePose(z.cx, 0, L * 1.3 + 3, 7.4 + w, 0.24, ty) : framePose(z.cx, 0, L * 1.32 + 3.2, 7.6 + w, 0.3, ty);
}
// Opening shot: a big side profile of the aircraft with the SAFAR titles, like the livery artwork.
function heroPose() {
  const portrait = isPortrait();
  const tanV = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));
  const tanH = tanV * camera.aspect;
  if (!portrait) {
    const len = (IS_DD ? 77.5 : IS_NARROW ? 41 : 71) * 1.04;
    const dist = Math.max(len / (2 * tanH), (IS_DD ? 31 : IS_NARROW ? 15 : 26) / (2 * tanV));
    const ty = IS_DD ? 0.9 : IS_NARROW ? 0.35 : 0.6;
    const target = new V3(0.6, ty, 0);
    return { pos: new V3(0.6 + dist * 0.03, ty + dist * 0.045, dist), target, up: WORLD_UP.clone() };
  }
  // a phone held upright is too narrow for the side profile, so the whole aircraft is framed
  // from a three-quarter angle (the SAFAR titles still face the camera), fitted to the screen
  return fitPose(HERO_DIR_PORTRAIT, { mx: 0.94, my: 0.8 });
}
const HERO_DIR_PORTRAIT = new V3(0.95, 0.4, 1).normalize();

// Frame the whole aircraft: project its real outline (a sample of the hull, wing, tail and engine
// vertices) from direction `dir` and find the distance at which it just fits inside the screen
// (mx, my = how much of the screen it may use, in normalised units), then centre it.
let hullCloud = null;
function aircraftOutline() {
  if (hullCloud) return hullCloud;
  const pts = [];
  ac.group.updateMatrixWorld(true);
  ac.group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry.attributes.position) return;
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 160));
    for (let i = 0; i < pos.count; i += step) pts.push(new V3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
  });
  hullCloud = pts;
  return pts;
}
// just the fuselage over the cabins, with a little of the nose and tail: what a phone frames
let cabinCloud = null;
function cabinOutline() {
  if (cabinCloud) return cabinCloud;
  const pts = [], R = FUS.R, x0 = FUS.CABIN_X0 - 3, x1 = FUS.CABIN_X1 + 3;
  for (let i = 0; i <= 16; i++) {
    const x = x0 + (x1 - x0) * i / 16;
    for (const z of [-R, R]) pts.push(new V3(x, 0, z));
    pts.push(new V3(x, R, 0));
  }
  cabinCloud = pts;
  return pts;
}
const fitCam = new THREE.PerspectiveCamera();
function fitPose(dir, { mx = 0.9, my = 0.88, lift = 0, up: upVec = WORLD_UP, fov = BASE_FOV, pts: given = null } = {}) {
  const pts = given || aircraftOutline();
  fitCam.fov = fov; fitCam.aspect = camera.aspect; fitCam.near = 1; fitCam.far = 5000;
  fitCam.updateProjectionMatrix();
  const target = new V3(0.5, 0.4, 0);
  const p = new V3(), right = new V3(), up = new V3();
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2)), tanH = tanV * fitCam.aspect;
  const bounds = (D) => {
    fitCam.position.copy(target).addScaledVector(dir, D);
    fitCam.up.copy(upVec);
    fitCam.lookAt(target);
    fitCam.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of pts) {
      p.copy(q).project(fitCam);
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    return { x0, x1, y0, y1 };
  };
  let D = 150;
  for (let pass = 0; pass < 3; pass++) {
    let lo = 60, hi = 3000;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2, b = bounds(mid);
      // the subject is centred on `lift`, so it has to fit the band around lift, not around the
      // middle of the screen (that mistake used to shrink the phone views by about half)
      if (b.x0 >= -mx && b.x1 <= mx && b.y0 >= lift - my && b.y1 <= lift + my) hi = mid; else lo = mid;
    }
    D = hi;
    const b = bounds(D);
    right.setFromMatrixColumn(fitCam.matrixWorld, 0);
    up.setFromMatrixColumn(fitCam.matrixWorld, 1);
    target.addScaledVector(right, ((b.x0 + b.x1) / 2) * D * tanH).addScaledVector(up, ((b.y0 + b.y1) / 2 - lift) * D * tanV);
  }
  return { pos: target.clone().addScaledVector(dir, D), target, up: upVec.clone(), fov };
}
function introPose() {
  const k = isPortrait() ? 1.9 : 1.0;
  const target = new V3(2, -0.8, 0);
  return { pos: target.clone().add(new V3(44 * k, 40 * k, 58 * k)), target, up: WORLD_UP.clone() };
}
function setRig(p) { rig.pos.copy(p.pos); rig.target.copy(p.target); rig.up.copy(p.up); lens.fov = p.fov ?? BASE_FOV; }

let rigTween = null;
function moveRig(to, { duration = 2, ease = 'power2.inOut', arc = 0 } = {}) {
  if (rigTween) rigTween.kill();
  const from = { pos: rig.pos.clone(), target: rig.target.clone(), up: rig.up.clone(), fov: lens.fov };
  const toFov = to.fov ?? BASE_FOV;
  const st = { t: 0 };
  return new Promise((res) => {
    rigTween = gsap.to(st, {
      t: 1, duration: reduce ? Math.min(duration, 0.5) : duration, ease,
      onUpdate: () => {
        const t = st.t;
        lens.fov = THREE.MathUtils.lerp(from.fov, toFov, t);
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
  // travelling together: the free seats beside this one light up with it
  const focus = seat || S.selected;
  S.group = travellers > 1 && focus ? cabin.groupAround(focus, travellers) : null;
  cabin.setGroup(S.group || []);
  if (seat) {
    if (S.hoverCls) setHoverClass(null);
    ui.showSeatTag(seat, { go: coarse && S.selected === seat, group: S.group, wanted: travellers });
    tagTarget = { type: 'seat', seat };
  } else if (S.selected) {
    ui.showSeatTag(S.selected, { go: coarse || S.picked, group: S.group, wanted: travellers });
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
    tagAnchor.set(z.cx, z.centre.y + 2.4, 0);
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
    const h = raycaster.intersectObjects(deckZones(), false)[0];
    setHoverClass(h ? h.object.userData.cls : null);
  } else if (S.mode === 'class') {
    const h = raycaster.intersectObjects(cabin.pickables[S.cls], false)[0];
    const seat = cabin.seatFromHit(h);
    if (seat) { setHoverSeat(seat); return; }
    if (!coarse) setHoverSeat(null);
    const z = raycaster.intersectObjects(deckZones(), false)[0];
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
const touches = new Map();
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) { orbitDrag = null; pinchStart(); return; }
  if (S.mode === 'overview' && !S.busy) orbitDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) { pinchMove(); return; }
  if (!orbitDrag || e.pointerId !== orbitDrag.id || S.mode !== 'overview' || S.busy) return;
  const dx = e.clientX - orbitDrag.x, dy = e.clientY - orbitDrag.y;
  if (!orbit.on && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8) return;
  orbitDrag.x = e.clientX; orbitDrag.y = e.clientY;
  if (!orbit.on) beginOrbit();
  const r = 3.4 / Math.max(innerWidth, innerHeight);          // a full-width drag turns ~200°
  orbit.tYaw -= dx * r;
  orbit.tPitch = THREE.MathUtils.clamp(orbit.tPitch + dy * r, ORBIT_MIN_PITCH, ORBIT_MAX_PITCH);
  ui.body.classList.add('orbiting');
});
const endPointer = (e) => {
  touches.delete(e.pointerId);
  if (orbitDrag && e.pointerId === orbitDrag.id) orbitDrag = null;
  if (touches.size < 2) pinch = null;
  ui.body.classList.remove('orbiting');
};
canvas.addEventListener('pointerup', (e) => {
  endPointer(e);
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const dt = performance.now() - down.t;
  down = null;
  if (moved > 12 || dt > 700) return;
  onTap(e);
});
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  if (S.mode !== 'overview' || S.busy) return;
  e.preventDefault();
  if (!orbit.on) beginOrbit();
  zoomOrbit(Math.exp(e.deltaY * 0.0012));
}, { passive: false });

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
  if (travellers > 1 && seat.cls !== 'residence' && seat.cls !== 'first') {
    const grp = cabin.groupAround(seat, travellers);
    if (!grp) { ui.shakeTag(); ui.toast(`There aren't ${travellers} free seats together there. Try "Best seats together".`); return; }
    S.sceneGroup = grp;
  } else S.sceneGroup = null;
  if (seat.booked && !seat.yours) {
    ui.shakeTag();
    ui.toast(`${seat.cls === 'first' ? 'Suite' : 'Seat'} ${seat.id} is taken. The blue ones are free.`);
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
  showDeck(DECK_OF[cls]);
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
  orbit.on = false;
  if (roof.v > 0.001) roofTo(0, 0.9);
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
  overviewHint();
  focusShadow(2, 0, 40);
  deckBlur(0.0);
  orbit.on = false;
  setViewKind('map');
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

// ---------------------------------------------------------------- views of the plane
// On the cabin map you can drag to turn the plane (pinch or scroll to zoom), or jump to a set
// angle. Seen from above the roof is glass so you can pick a cabin; lower down it turns solid,
// so the livery and the SAFAR titles show.
const ORBIT_MIN_PITCH = -0.5, ORBIT_MAX_PITCH = 1.5;
const orbit = { on: false, yaw: 0, pitch: 0, dist: 100, tYaw: 0, tPitch: 0, tDist: 100, base: 100, startPitch: 1.4, target: new V3(), mapUp: new V3(0, 1, 0) };
let orbitDrag = null, pinch = null;
let viewKind = 'map';                     // 'map' | a set angle | 'free'
const VIEWS = [['map', 'Cabin map'], ['sky', 'Sun'], ['cockpit', 'Flight deck'], ['side', 'Side'], ['front', 'Front'], ['rear', 'Rear'], ['below', 'Below']];
const VIEW_DIRS = { side: [0.06, 0.13, 1], front: [1, 0.3, 0.62], rear: [-1, 0.34, 0.72], below: [0.35, -0.42, 1] };
function viewPose(kind) {
  if (kind === 'sky') return skyPose();
  // from the jump seat behind the pilots, out through the windscreen
  if (kind === 'cockpit') return { pos: ac.cockpitView.eye.clone(), target: ac.cockpitView.look.clone(), up: WORLD_UP.clone(), fov: isPortrait() ? 78 : 64 };
  if (kind === 'map' || !VIEW_DIRS[kind]) return overviewPose();
  const fit = isPortrait() ? { mx: 0.94, ...clearBand() } : { mx: 0.8, my: 0.6, lift: 0.02 };
  return fitPose(new V3(...VIEW_DIRS[kind]).normalize(), fit);
}
// Towards the sun (the moon at night): the camera turns to face wherever the time of day puts
// it, so it hangs in the sky above and beside the aircraft with the cloud deck and the curve of
// the horizon below. A slightly wider lens, like an air-to-air photo.
function skyPose() {
  const portrait = isPortrait();
  const fov = portrait ? 68 : 56;
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2)), tanH = tanV * camera.aspect;
  let fit, sx, lo, hi, hy;
  if (portrait) {
    const b = clearBand();
    fit = { mx: 0.86, my: b.my * 0.46, lift: b.lift - b.my * 0.44, fov };
    sx = 0.42; lo = b.lift + b.my * 0.3; hi = b.lift + b.my * 0.88; hy = b.lift - b.my * 0.5;
  } else {
    fit = { mx: 0.58, my: 0.38, lift: -0.26, fov };
    sx = 0.52; lo = 0.3; hi = 0.82; hy = -0.32;
  }
  // compose like a photographer: the horizon (about 1.5 degrees below level, over the curved
  // cloud deck) a third of the way up, unless the sun would leave the top of the frame or drop
  // behind the aircraft
  const s = preset.sunDir.clone().normalize();
  const elev = Math.asin(s.y), horizon = THREE.MathUtils.degToRad(-1.5);
  let pitch = horizon - Math.atan(hy * tanV);
  pitch = THREE.MathUtils.clamp(pitch, elev - Math.atan(hi * tanV), elev - Math.atan(lo * tanV));
  const sy = Math.tan(elev - pitch) / tanV;
  // find the viewing direction that puts the sun at (sx, sy) on the screen, horizon level
  const f = s.clone(), r = new V3(), u = new V3();
  for (let i = 0; i < 12; i++) {
    r.crossVectors(f, WORLD_UP).normalize();
    u.crossVectors(r, f);
    const z = s.dot(f);
    f.addScaledVector(r, s.dot(r) / z - sx * tanH).addScaledVector(u, s.dot(u) / z - sy * tanV).normalize();
  }
  return fitPose(f.negate(), fit);
}
function beginOrbit() {
  const off = new V3().subVectors(rig.pos, rig.target);
  orbit.dist = orbit.tDist = off.length();
  if (viewKind === 'map' || !orbit.base) orbit.base = orbit.dist;
  orbit.pitch = orbit.tPitch = Math.asin(THREE.MathUtils.clamp(off.y / orbit.dist, -1, 1));
  orbit.yaw = orbit.tYaw = Math.atan2(off.z, off.x);
  orbit.startPitch = Math.max(1.05, orbit.pitch);
  orbit.target.copy(rig.target);
  orbit.mapUp.copy(rig.up);
  orbit.on = true;
  if (rigTween) { rigTween.kill(); rigTween = null; }
  setViewKind('free');
}
function zoomOrbit(f) {
  orbit.tDist = THREE.MathUtils.clamp(orbit.tDist * f, orbit.base * 0.45, orbit.base * 1.8);
}
function pinchSpan() { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); }
function pinchStart() { if (S.mode === 'overview' && !S.busy) pinch = { d: pinchSpan() }; }
function pinchMove() {
  if (!pinch) return;
  const d = pinchSpan();
  if (!orbit.on) beginOrbit();
  zoomOrbit(pinch.d / Math.max(1, d));
  pinch.d = d;
}
function updateOrbit(dt) {
  if (!orbit.on || S.mode !== 'overview' || rigTween) return;
  const k = Math.min(1, dt * 9);
  orbit.yaw += (orbit.tYaw - orbit.yaw) * k;
  orbit.pitch += (orbit.tPitch - orbit.pitch) * k;
  orbit.dist += (orbit.tDist - orbit.dist) * k;
  const cp = Math.cos(orbit.pitch);
  rig.target.copy(orbit.target);
  rig.pos.set(cp * Math.cos(orbit.yaw), Math.sin(orbit.pitch), cp * Math.sin(orbit.yaw)).multiplyScalar(orbit.dist).add(orbit.target);
  // keep the map's orientation while looking down, and the horizon level once you look across
  const w = THREE.MathUtils.clamp((orbit.pitch - 0.95) / Math.max(0.05, orbit.startPitch - 0.95), 0, 1);
  rig.up.copy(WORLD_UP).lerp(orbit.mapUp, w).normalize();
}
// glass roof from above, solid paint once the camera is low enough to see the sides
function autoRoof() {
  if (S.mode !== 'overview') return;
  const d = tmpF.subVectors(camera.position, rig.target).normalize();
  const t = 1 - smooth(0.98, 1.22, Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)));
  if (Math.abs(t - roof.v) > 0.003) setRoof(t);
}
function roofTo(v, duration = 0.6) {
  return gsap.to(roof, { v, duration, ease: 'power2.inOut', onUpdate: () => setRoof(roof.v) });
}
async function setView(kind) {
  if (S.mode !== 'overview' || S.busy) return;
  orbit.on = false;
  // on the flight deck the camera rides inside the aircraft, so it stops floating while you're there
  if (kind === 'cockpit') lockFlight(true, 0.8);
  else if (viewKind === 'cockpit') lockFlight(false, 1.2);
  setViewKind(kind);
  S.busy = true;
  setHoverClass(null);
  await moveRig(viewPose(kind), { duration: reduce ? 0.4 : 1.6, ease: 'power3.inOut' });
  S.busy = false;
  pickPending = true;
}
function setViewKind(kind) {
  viewKind = kind;
  for (const b of CTL.viewBtns) b.setAttribute('aria-pressed', b.dataset.view === kind ? 'true' : 'false');
}
function overviewHint() {
  ui.hint(coarse ? 'Tap a cabin · drag to turn the plane' : 'Hover a cabin for prices · drag to turn the plane');
}

// ---------------------------------------------------------------- time of day
// Sunrise, day, afternoon, sunset or night, switched live: sun or moon, sky, clouds, the light
// on the aircraft and in the cabin, reflections (re-captured from the new sky), and at night
// the glowing windows, fin light and navigation lights.
let todBusy = false;
function applyPreset() {
  renderer.toneMappingExposure = preset.exposure;
  sun.color.set(preset.sunColor);
  sun.intensity = preset.sunIntensity;
  hemi.color.set(preset.hemiSky);
  hemi.groundColor.set(preset.hemiGround);
  applyShadowFocus();
  sky.setPreset(preset);
  ac.setSky(preset);
  const old = scene.environment;
  scene.environment = sky.captureEnvironment();
  if (old && old !== sky.env) old.dispose();
  setInside(insideK);
  rain.setLevel(preset.rain || 0);
  lightning.setOn(!!preset.lightning);
  if (!preset.lightning) sky.setFlash(0);
  lightWeather();
}
async function setTimeOfDay(key) {
  if (!PRESETS[key] || key === todKey || todBusy) return;
  todBusy = true;
  const fade = CTL.todFade;
  fade.style.background = key === 'night' ? '#050a16' : key === 'rain' ? '#9aa3ad' : '#eef3f8';
  await new Promise((res) => gsap.to(fade, { opacity: 1, duration: reduce ? 0.1 : 0.32, ease: 'power2.in', onComplete: res }));
  todKey = key;
  preset = PRESETS[key];
  applyPreset();
  try { localStorage.setItem('safar-tod', key); } catch (e) { /* private mode */ }
  updateTimeUI();
  // on the plane views, turn to the sun or moon so the new sky is seen
  if (S.mode === 'overview' && !S.busy) setView('sky');
  await new Promise((res) => setTimeout(res, 80));
  gsap.to(fade, { opacity: 0, duration: reduce ? 0.2 : 0.8, ease: 'power2.out', onComplete: () => { todBusy = false; } });
}
function updateTimeUI() {
  const name = (TIME_ORDER.find(([k]) => k === todKey) || [, 'Day'])[1];
  CTL.todLabel.textContent = name;
  CTL.btnTime.dataset.tod = todKey;
  const ti = CTL.btnTime.querySelector('[data-tod-icon]');
  if (ti && TOD_ICON[todKey]) ti.innerHTML = TOD_ICON[todKey];
  for (const b of CTL.todBtns) b.setAttribute('aria-pressed', b.dataset.tod === todKey ? 'true' : 'false');
  const sb = CTL.viewBtns.find((b) => b.dataset.view === 'sky');
  if (sb) {
    sb.querySelector('span').textContent = todKey === 'night' ? 'Moon' : todKey === 'rain' ? 'Sky' : 'Sun';
    sb.querySelector('i').classList.toggle('is-moon', todKey === 'night');
  }
}

// controls: a Time and a View button (top right) opening a small panel
const CTL = {
  ctl: document.getElementById('sceneCtl'), panel: document.getElementById('ctlPanel'),
  btnTime: document.getElementById('btnTime'), btnView: document.getElementById('btnView'),
  todLabel: document.querySelector('[data-tod-label]'), todFade: document.getElementById('todFade'),
  todBtns: [], viewBtns: [],
};
{
  const todRow = document.getElementById('todRow'), viewRow = document.getElementById('viewRow');
  for (const [key, name] of TIME_ORDER) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ctl-opt'; b.dataset.tod = key;
    b.innerHTML = `<i class="tod-swatch tod-${key}" aria-hidden="true"></i><span>${name}</span>`;
    b.addEventListener('click', () => setTimeOfDay(key));
    todRow.appendChild(b); CTL.todBtns.push(b);
  }
  for (const [key, name] of VIEWS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ctl-opt ctl-view'; b.dataset.view = key;
    b.innerHTML = `<i class="view-ico view-${key}" aria-hidden="true"></i><span>${name}</span>`;
    b.addEventListener('click', () => { setView(key); });
    viewRow.appendChild(b); CTL.viewBtns.push(b);
  }
  const open = (sec) => {
    const same = !CTL.panel.hidden && CTL.panel.dataset.sec === sec;
    CTL.panel.hidden = same;
    CTL.panel.dataset.sec = sec;
    CTL.btnTime.setAttribute('aria-expanded', String(!same && sec === 'time'));
    document.getElementById('btnPlane').setAttribute('aria-expanded', String(!same && sec === 'plane'));
    CTL.btnView.setAttribute('aria-expanded', String(!same && sec === 'view'));
  };
  CTL.btnTime.addEventListener('click', (e) => { e.stopPropagation(); open('time'); });
  document.getElementById('btnPlane').addEventListener('click', (e) => { e.stopPropagation(); open('plane'); });
  CTL.btnView.addEventListener('click', (e) => { e.stopPropagation(); open('view'); });
  CTL.panel.addEventListener('click', (e) => e.stopPropagation());
  addEventListener('pointerdown', (e) => { if (!CTL.panel.hidden && !CTL.ctl.contains(e.target)) { CTL.panel.hidden = true; CTL.btnTime.setAttribute('aria-expanded', 'false'); CTL.btnView.setAttribute('aria-expanded', 'false'); } });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !CTL.panel.hidden) { CTL.panel.hidden = true; } });
  updateTimeUI();
  setViewKind('map');
}

// ---------------------------------------------------------------- choose the aircraft
// The twin-engine widebody or the four-engine double-decker. The choice is remembered, and the
// page reloads into the other aircraft (behind a fade) so each one is built at full quality.
const PLANES = [
  { key: 'twin', name: 'Widebody', sub: 'Two engines · one deck · Economy 3-3-3',
    svg: '<svg viewBox="0 0 76 40" aria-hidden="true"><path d="M4 21c0-1.6 1.6-3 3.6-3H64c4.4 0 8 1.4 8 3s-3.6 3-8 3H7.6C5.6 24 4 22.6 4 21z" fill="currentColor"/><path d="M6 18L3.2 9h4l5.4 9zM30 24l9 10h4.4l-5-10zM30 18l8-8h4.2l-4 8z" fill="currentColor"/><rect x="33" y="26" width="7" height="3.4" rx="1.7" fill="currentColor" opacity=".8"/></svg>' },
  { key: 'narrow', name: 'Single-aisle', sub: 'Two engines · one aisle · Economy 3-3',
    svg: '<svg viewBox="0 0 76 40" aria-hidden="true"><path d="M10 21c0-1.2 1.2-2.2 2.7-2.2H58c3.4 0 6 1 6 2.2s-2.6 2.2-6 2.2H12.7C11.2 23.2 10 22.2 10 21z" fill="currentColor"/><path d="M12 18.8L9.8 12h3.4l4.4 6.8zM33 23.2l7 8h3.4l-4.2-8zM33 18.8l6-6h3.2l-3 6z" fill="currentColor"/><rect x="35" y="24.5" width="5" height="2.6" rx="1.3" fill="currentColor" opacity=".8"/></svg>' },
  { key: 'dd', name: 'Double-decker', sub: 'Four engines · two decks · Economy 3-4-3',
    svg: '<svg viewBox="0 0 76 40" aria-hidden="true"><path d="M3 21.5c0-2.4 2-4.6 5-4.6H63c5 0 10 2 10 4.6S68 26 63 26H8c-3 0-5-2.1-5-4.5z" fill="currentColor"/><path d="M5.4 17L2 6.5h4.6L13 17zM27 26l10 11h4.8l-5.6-11zM27 17l9-9h4.6l-4.4 9z" fill="currentColor"/><rect x="29" y="27.5" width="6" height="3" rx="1.5" fill="currentColor" opacity=".8"/><rect x="38" y="31" width="6" height="3" rx="1.5" fill="currentColor" opacity=".8"/><path d="M12 19.2h46M12 23.4h50" stroke="#fff" stroke-width="1" stroke-dasharray="1.4 1.6" opacity=".7"/></svg>' },
];
{
  const row = document.getElementById('planeRow');
  for (const p of PLANES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'plane-opt'; b.dataset.plane = p.key;
    b.setAttribute('aria-pressed', p.key === PLANE ? 'true' : 'false');
    b.innerHTML = `${p.svg}<span><b>${p.name}</b><small>${p.sub}</small></span>`;
    b.addEventListener('click', () => switchPlane(p.key));
    row.appendChild(b);
  }
  document.querySelector('[data-plane-label]').textContent = PLANES.find((p) => p.key === PLANE).name;
}
// cruise or approach: flaps, slats, landing gear and landing lights
{
  const row = document.getElementById('phaseRow');
  const opts = [['cruise', 'Cruise', 'Clean wing, gear up'], ['approach', 'Approach', 'Slats, flaps and gear down, landing lights on']];
  for (const [key, name, sub] of opts) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'phase-opt'; b.dataset.phase = key;
    b.setAttribute('aria-pressed', key === 'cruise' ? 'true' : 'false');
    b.innerHTML = `<b>${name}</b><small>${sub}</small>`;
    b.addEventListener('click', () => setPhase(key));
    row.appendChild(b);
  }
  const jb = document.createElement('button');
  jb.type = 'button'; jb.className = 'phase-opt phase-journey';
  jb.innerHTML = `<b>Fly the whole route</b><small>Takeoff at night, cruise into the sunrise, land in daylight</small>`;
  jb.addEventListener('click', () => { CTL.panel.hidden = true; startJourney(); });
  row.appendChild(jb);
}
function setPhase(key) {
  if (ac.phase === key) return;
  ac.setPhase(key);
  for (const b of document.querySelectorAll('.phase-opt')) b.setAttribute('aria-pressed', b.dataset.phase === key ? 'true' : 'false');
  lightWeather();
  CTL.panel.hidden = true;
  // watch it happen from underneath: the slats, flaps and gear coming out
  if (key === 'approach' && S.mode === 'overview' && !S.busy) setView('below');
}
function switchPlane(key) {
  if (key === PLANE) { CTL.panel.hidden = true; return; }
  try { localStorage.setItem('safar-plane', key); } catch (e) { /* private mode */ }
  const url = new URL(location.href);
  url.searchParams.set('plane', key);
  const fade = CTL.todFade;
  fade.style.background = '#eef3f8';
  gsap.to(fade, { opacity: 1, duration: reduce ? 0.1 : 0.4, ease: 'power2.in', onComplete: () => location.replace(url.toString()) });
}
// compare the cabins side by side, and jump to one
const compare = createCompare({
  plane: PLANE,
  current: () => (S.scene ? S.scene.cls : S.cls),
  onPick: (cls) => {
    if (S.mode === 'scene') { if (S.scene && S.scene.cls !== cls) upgradeTo(cls); }
    else if (S.mode === 'overview' || S.mode === 'class') enterClass(cls);
  },
});
document.getElementById('btnCompare').addEventListener('click', (e) => { e.stopPropagation(); compare.show(); });
// route and date: a new route reloads into it, a new date updates in place
createRoutePicker({
  onRoute: (key) => {
    try { localStorage.setItem('safar-route', key); localStorage.removeItem('safar-date'); } catch (e) { /* private mode */ }
    const url = new URL(location.href);
    url.searchParams.set('route', key);
    for (const k of ['seat', 'n', 'date']) url.searchParams.delete(k);
    const fade = CTL.todFade;
    fade.style.background = '#eef3f8';
    gsap.to(fade, { opacity: 1, duration: reduce ? 0.1 : 0.4, ease: 'power2.in', onComplete: () => location.replace(url.toString()) });
  },
  onDate: (d) => {
    try { localStorage.setItem('safar-date', d); } catch (e) { /* private mode */ }
    CONFIG.flight.fullDate = d;
    CONFIG.flight.date = d.replace(/ \d{4}$/, '');
    document.querySelectorAll('[data-date]').forEach((e) => { e.textContent = CONFIG.flight.date; });
    ui.toast(`Flying ${CONFIG.flight.fullDate}`);
  },
});

// double-decker: switch between the upper and the main deck on the cabin map
const deckEl = document.getElementById('deckSwitch');
function updateDeckUI() {
  if (!IS_DD) return;
  for (const b of deckEl.querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.deck === ac.deck ? 'true' : 'false');
}
if (IS_DD) {
  deckEl.hidden = false;
  updateDeckUI();
  for (const b of deckEl.querySelectorAll('button')) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (S.busy || S.mode !== 'overview') return;
      showDeck(b.dataset.deck);
      setHoverClass(null);
      if (viewKind === 'map' && !orbit.on) moveRig(overviewPose(), { duration: reduce ? 0.3 : 0.9, ease: 'power2.inOut' });
    });
  }
}

// ---------------------------------------------------------------- language
// English only for now (Arabic is switched off in js/i18n.js)
i18n.init();

// ---------------------------------------------------------------- keyboard and screen readers
// In a cabin the arrow keys move between seats (left and right along the rows, up and down
// across them), Enter flies into the seat and Escape steps back; every move is read out. The
// seat list offers the same seats as plain buttons.
const srLive = document.getElementById('srLive');
const say = (t) => { srLive.textContent = ''; setTimeout(() => { srLive.textContent = i18n.t(t); }, 30); };
function seatSpeech(seat) {
  const conf = CONFIG.classes[seat.cls];
  if (seat.cls === 'residence') return `${conf.name}, ${seat.booked ? 'taken' : 'available'}, ${CONFIG.flight.currency} ${fmtMoney(conf.price)}`;
  const where = seat.window ? 'window' : seat.aisle ? 'aisle' : 'middle';
  return `${seat.cls === 'first' ? 'Suite' : 'Seat'} ${seat.id}, ${where}, ${seat.yours ? 'yours' : seat.booked ? 'taken' : 'available'}, ${CONFIG.flight.currency} ${fmtMoney(conf.price)}`;
}
function moveFocus(dRow, dCol) {
  const list = cabin.classes[S.cls].seats;
  let cur = S.selected || list.find((q) => !q.booked) || list[0];
  if (S.selected) {
    if (dRow) {
      const rows = [...new Set(list.map((q) => q.row))].sort((a, b) => a - b);
      const r = rows[Math.max(0, Math.min(rows.length - 1, rows.indexOf(cur.row) + dRow))];
      const inRow = list.filter((q) => q.row === r);
      cur = inRow.reduce((b, q) => (Math.abs(q.pos.z - cur.pos.z) < Math.abs(b.pos.z - cur.pos.z) ? q : b), inRow[0]);
    } else if (dCol) {
      const inRow = list.filter((q) => q.row === cur.row).sort((a, b) => a.pos.z - b.pos.z);
      cur = inRow[Math.max(0, Math.min(inRow.length - 1, inRow.indexOf(cur) + dCol))];
    }
  }
  S.selected = cur; S.picked = true;
  setHoverSeat(null, { sticky: true });
  say(seatSpeech(cur));
}
addEventListener('keydown', (e) => {
  if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (document.querySelector('.sheet-back:not([hidden])')) return;
  if (S.mode === 'class' && !S.busy) {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); moveFocus(k === 'ArrowRight' ? -1 : 1, 0); }
    else if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); moveFocus(0, k === 'ArrowDown' ? 1 : -1); }
    else if ((k === 'Enter' || k === ' ') && S.selected && document.activeElement === document.body) { e.preventDefault(); activateSeat(S.selected); }
    else if (k === 'Escape') leaveClass();
  } else if (S.mode === 'scene' && e.key === 'Escape' && !S.busy) backToPlane();
});
// the seat list: every free seat in this cabin as a button
const seatListSheet = sheet('seatList', 'Seat list');
const btnSeatList = document.getElementById('btnSeatList');
btnSeatList.addEventListener('click', (e) => {
  e.stopPropagation();
  if (S.mode !== 'class') return;
  const list = cabin.classes[S.cls].seats;
  const rows = new Map();
  for (const q of list) { if (!rows.has(q.row)) rows.set(q.row, []); rows.get(q.row).push(q); }
  seatListSheet.body.innerHTML = '';
  for (const [r, arr] of [...rows].sort((a, b) => a[0] - b[0])) {
    const free = arr.filter((q) => !q.booked || q.yours).sort((a, b) => a.pos.z - b.pos.z);
    if (!free.length) continue;
    const row = document.createElement('div'); row.className = 'seatlist-row';
    row.innerHTML = `<b>${S.cls === 'residence' ? '' : `Row ${r}`}</b>`;
    for (const q of free) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = q.cls === 'residence' ? CONFIG.classes.residence.name : q.id;
      b.setAttribute('aria-label', seatSpeech(q));
      b.addEventListener('click', () => { seatListSheet.hide(); activateSeat(q); });
      row.appendChild(b);
    }
    seatListSheet.body.appendChild(row);
  }
  seatListSheet.show();
});
setInterval(() => { btnSeatList.hidden = S.mode !== 'class'; }, 400);
// reduced motion: no sudden white-outs from passing cloud, no camera sway
if (reduce) { motion.drift = 0; motion.parallax = 0; }

// ---------------------------------------------------------------- journey: takeoff, cruise, landing
// Fly the whole route: a night takeoff from a lit runway with the city around it, the climb, the
// cruise across Africa with the moving map and the sky turning from night to sunrise, then an
// approach and landing in daylight. The aircraft stays where it is; the airport moves under it.
var J = { on: false, stage: '', t: 0, x: 0, y: 0, v: 0, vs: 0, pitch: 0, airport: null, prevTod: 'day', camX: 0, p: 0 };
const jEl = { box: document.getElementById('journey'), stage: document.getElementById('jStage'), where: document.getElementById('jWhere'), fill: document.getElementById('jFill'), plane: document.getElementById('jPlane') };
document.getElementById('jFrom').textContent = CONFIG.flight.from.code;
document.getElementById('jTo').textContent = CONFIG.flight.to.code;
const REGIONS = [['Qatar', 50.7, 24.4, 51.7, 26.2], ['the UAE', 51.5, 22.6, 56.5, 26.1], ['Eritrea', 36.4, 12.4, 43.2, 18], ['Malawi', 32.7, -17, 36, -9.4], ['Uganda', 29.5, -1.5, 35, 4.2],
  ['Zimbabwe', 25, -22.5, 33, -15.6], ['Botswana', 20, -27, 29, -18], ['South Africa', 16, -35, 33, -22], ['Mozambique', 30, -27, 41, -10.5], ['Zambia', 22, -18, 33.7, -8.2], ['Tanzania', 29.3, -11.7, 40.5, -1],
  ['Kenya', 34, -4.7, 41.9, 5], ['South Sudan', 24, 3.5, 36, 12.2], ['Ethiopia', 33, 3.4, 48, 14.9], ['Somalia', 41, -1.7, 51.5, 12], ['Yemen', 42.5, 12, 54, 19], ['Egypt', 24.7, 22, 36.9, 31.7],
  ['Sudan', 21.8, 8.7, 38.6, 22], ['Oman', 52, 16.6, 60, 26.5], ['Saudi Arabia', 34.5, 16, 55.7, 32.2], ['Türkiye', 26, 36, 45, 42.2], ['the Mediterranean', 10, 31, 36, 40], ['Libya', 9.3, 19.5, 25.2, 33.2],
  ['Chad', 13.4, 7.4, 24, 23.5], ['DR Congo', 12, -13.5, 31, 5], ['Angola', 11.6, -18, 24.1, -4.4], ['Namibia', 11.7, -29, 25.3, -16.9]];
function regionAt(lon, lat) {
  // the Red Sea is a narrow diagonal strip: measure the distance to its axis
  const ax = 32.6, ay = 29.9, bx = 43.3, by = 12.6, t = Math.max(0, Math.min(1, ((lon - ax) * (bx - ax) + (lat - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  if (Math.hypot(lon - (ax + t * (bx - ax)), lat - (ay + t * (by - ay))) < 1.3) return 'the Red Sea';
  const r = REGIONS.find(([, x0, y0, x1, y1]) => lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1);
  return r ? r[0] : 'Africa';
}
function routeAt(t) {
  const A = ROUTE.from.ll, B = ROUTE.to.ll, bow = Math.sin(Math.PI * t) * 2.2;
  return [A[0] + (B[0] - A[0]) * t + bow * 0.6, A[1] + (B[1] - A[1]) * t + bow * 0.15];
}
function applyTodNow(key) { if (!PRESETS[key] || key === todKey) return; todKey = key; preset = PRESETS[key]; applyPreset(); updateTimeUI(); }
const jFade = (v, d = 0.6) => new Promise((res) => { const f = CTL.todFade; f.style.background = '#05080d'; gsap.to(f, { opacity: v, duration: reduce ? 0.1 : d, ease: 'power2.inOut', onComplete: res }); });
function enterAirport({ desert, night }) {
  J.airport = buildAirport({ desert, isMobile, numA: CONFIG.flight.from.code === 'JNB' ? '03L' : '16', numB: CONFIG.flight.to.code === 'JED' ? '34R' : '34' });
  J.airport.setNight(night);
  scene.add(J.airport.group);
  sky.clouds.composite.visible = false;
  scene.fog = new THREE.Fog(night ? 0x0a121e : 0xd4dbe2, 2500, 19000);
  lightWeather();
}
function leaveAirport() {
  if (J.airport) { scene.remove(J.airport.group); J.airport.dispose(); J.airport = null; }
  sky.clouds.composite.visible = true;
  scene.fog = null;
  lightWeather();
}
function setJourneyStage(stage) {
  J.stage = stage; J.t = 0;
  jEl.stage.textContent = { takeoff: `Takeoff from ${CONFIG.flight.from.city}`, cruise: `Cruising to ${CONFIG.flight.to.city}`, landing: `Landing in ${CONFIG.flight.to.city}`, arrived: `Welcome to ${CONFIG.flight.to.city}` }[stage];
}
async function startJourney() {
  if (J.on || S.busy || S.mode !== 'overview') return;
  J.on = true; S.busy = true; J.prevTod = todKey;
  setMode('journey');
  chrome(false);
  ui.body.classList.add('journeying');
  setHoverClass(null); ui.hideTag();
  orbit.on = false;
  if (rigTween) { rigTween.kill(); rigTween = null; }
  lockFlight(true, 0.4);
  jEl.box.hidden = false;
  await jFade(1);
  ac.setPhase('cruise');
  applyTodNow('night');
  enterAirport({ desert: false, night: true });
  J.x = -J.airport.runwayHalf + 380; J.y = 0; J.v = 0; J.vs = 0; J.pitch = 0; J.p = 0;
  ac.setTargets({ flap: 0.45, slat: 1, gear: 1, lights: 1 });
  ac.snapControls({ flap: 0.45, slat: 1, gear: 1, lights: 1 });
  ac.setSpool(3);
  roofTo(1, 0.01);
  setJourneyStage('takeoff');
  J.camX = J.x + 340;
  await jFade(0, 1.0);
}
async function journeyCruise() {
  await jFade(1);
  leaveAirport();
  J.pitch = 0; J.y = 0;
  ac.setTargets(null); ac.setSpool(null); ac.snapControls({ flap: 0, slat: 0, gear: 0, lights: 0 });
  setJourneyStage('cruise');
  J.p = 0.04;
  setRig(viewPose('side'));
  await jFade(0, 1.0);
}
async function journeyLanding() {
  await jFade(1);
  applyTodNow('day');
  enterAirport({ desert: true, night: false });
  const td = -J.airport.runwayHalf + 360;            // touchdown point
  J.x = td - 2300; J.v = 72; J.y = 2300 * Math.tan(THREE.MathUtils.degToRad(3)); J.vs = -J.v * Math.tan(THREE.MathUtils.degToRad(3)); J.pitch = THREE.MathUtils.degToRad(3);
  J.td = td;
  ac.setTargets({ flap: 1, slat: 1, gear: 1, lights: 1 });
  ac.snapControls({ flap: 1, slat: 1, gear: 1, lights: 1 });
  ac.setSpool(5.5);
  setJourneyStage('landing');
  J.camX = td + 230;
  await jFade(0, 1.0);
}
async function endJourney() {
  if (!J.on) return;
  await jFade(1);
  leaveAirport();
  J.on = false; J.pitch = 0; J.stage = '';
  ac.setTargets(null); ac.setSpool(null); ac.snapControls({ flap: 0, slat: 0, gear: 0, lights: 0 });
  applyTodNow(J.prevTod);
  jEl.box.hidden = true;
  ui.body.classList.remove('journeying');
  lockFlight(false, 1);
  setMode('overview');
  setViewKind('map');
  setRig(overviewPose());
  roofTo(0, 0.01);
  chrome(true);
  S.busy = false;
  await jFade(0, 0.8);
}
document.getElementById('jExit').addEventListener('click', (e) => { e.stopPropagation(); endJourney(); });
document.getElementById('jSkip').addEventListener('click', (e) => {
  e.stopPropagation();
  if (J.stage === 'takeoff') journeyCruise();
  else if (J.stage === 'cruise') journeyLanding();
  else endJourney();
});
const jTmp = new THREE.Vector3();
function updateJourney(dt) {
  if (!J.on || !J.stage) return;
  J.t += dt;
  const deg = THREE.MathUtils.degToRad;
  if (J.stage === 'takeoff') {
    if (J.t > 2.5) { J.v = Math.min(84, J.v + 4.4 * dt); ac.setSpool(Math.min(11, 3 + J.t * 1.2)); }
    J.x += J.v * dt;
    if (J.v > 70 && J.pitch < deg(8)) J.pitch = Math.min(deg(8), J.pitch + deg(3.4) * dt);
    if (J.pitch > deg(5.5)) { J.vs = Math.min(10, J.vs + 4 * dt); J.y += J.vs * dt; }
    if (J.y > 25 && !J.gearUp) { J.gearUp = true; ac.setTargets({ flap: 0.45, slat: 1, gear: 0, lights: 1 }); }
    if (J.y > 260) ac.setTargets({ flap: 0, slat: 0, gear: 0, lights: 1 });
    // camera: beside the runway as the aircraft thunders past, then following the climb
    if (J.x < J.camX + 60) { rig.pos.set(J.camX - J.x, 4.5 - ac.gearBottom - J.y, -78); rig.target.set(0, -1, 0); }
    else { jTmp.set(-70, 14, -46); rig.pos.lerp(jTmp, Math.min(1, dt * 0.8)); rig.target.set(0, 0, 0); }
    rig.up.set(0, 1, 0);
    jEl.where.textContent = J.y > 2 ? `Climbing · ${Math.round(J.y * 3.28)} ft` : `${Math.round(J.v * 3.6)} km/h`;
    if (J.y > 420 && !J.leaving) { J.leaving = true; journeyCruise().then(() => { J.leaving = false; J.gearUp = false; }); }
  } else if (J.stage === 'cruise') {
    J.p = Math.min(1, J.p + dt / 55);
    ife.setProgress(0.03 + 0.94 * J.p);
    const [lon, lat] = routeAt(J.p);
    const left = ROUTE.mins * (1 - J.p);
    jEl.where.textContent = `Over ${regionAt(lon, lat)} · ${Math.floor(left / 60)}h ${String(Math.round(left % 60)).padStart(2, '0')}m to go`;
    if (J.p > 0.72 && todKey === 'night') { applyTodNow('sunrise'); moveRig(viewPose('sky'), { duration: 3, ease: 'power2.inOut' }); }
    if (J.p > 0.93 && todKey === 'sunrise') applyTodNow('day');
    if (!rigTween) { const a = J.t * 0.05; const d = rig.pos.length(); rig.pos.set(Math.sin(a) * d * 0.25, rig.pos.y, Math.sqrt(Math.max(1, d * d - rig.pos.y * rig.pos.y))); }
    if (J.p >= 1 && !J.leaving) { J.leaving = true; journeyLanding().then(() => { J.leaving = false; }); }
  } else if (J.stage === 'landing') {
    J.x += J.v * dt;
    if (J.y > 0) {
      if (J.y < 14) { J.vs = Math.min(-0.7, J.vs + 2.2 * dt); J.pitch = Math.min(deg(5.5), J.pitch + deg(1.2) * dt); }
      J.y = Math.max(0, J.y + J.vs * dt);
      if (J.y === 0) { J.touch = J.t; ac.setSpool(3); }
    } else {
      J.pitch = Math.max(0, J.pitch - deg(2.2) * dt);
      J.v = Math.max(0, J.v - (J.v > 20 ? 3.4 : 1.8) * dt);
      if (J.v < 0.5 && !J.leaving) {
        J.leaving = true;
        setJourneyStage('arrived');
        jEl.where.textContent = `Local time ${CONFIG.flight.to.time}`;
        document.getElementById('jSkip').textContent = 'Done';
        setTimeout(() => { J.leaving = false; }, 400);
      }
    }
    if (J.x < J.camX + 70) { rig.pos.set(J.camX - J.x, 3.5 - ac.gearBottom - J.y, -70); rig.target.set(0, -1, 0); }
    else { jTmp.set(-60, 6, -38); rig.pos.lerp(jTmp, Math.min(1, dt * 0.6)); rig.target.set(0, -1, 0); }
    rig.up.set(0, 1, 0);
    if (J.stage === 'landing') jEl.where.textContent = J.y > 0.5 ? `${Math.round(J.y * 3.28)} ft · ${Math.round(J.v * 3.6)} km/h` : `${Math.round(J.v * 3.6)} km/h`;
  }
  if (J.airport) J.airport.group.position.set(-J.x, -ac.gearBottom - J.y, 0);
  const prog = J.stage === 'takeoff' ? 0.02 : J.stage === 'cruise' ? 0.03 + 0.94 * J.p : 1;
  jEl.fill.style.width = `${prog * 100}%`;
  jEl.plane.style.left = `${prog * 100}%`;
}

// ---------------------------------------------------------------- save this view as an image
// Renders the current frame at the screen's full resolution, adds a small Safar caption, and
// hands it over: on phones through the share sheet (so it can go straight to Photos), elsewhere
// as a PNG download.
async function saveImage() {
  const btn = document.getElementById('btnShot');
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    composer.render(0);
    const src = renderer.domElement;
    const W = src.width, H = src.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    // caption, bottom left
    const k = Math.max(1, Math.min(W, H) / 900);
    const pad = 28 * k;
    const grad = g.createLinearGradient(0, H - 150 * k, 0, H);
    grad.addColorStop(0, 'rgba(6,18,34,0)'); grad.addColorStop(1, 'rgba(6,18,34,0.42)');
    g.fillStyle = grad; g.fillRect(0, H - 150 * k, W, 150 * k);
    g.fillStyle = '#ffffff';
    g.font = `700 ${Math.round(22 * k)}px Inter, system-ui, sans-serif`;
    g.letterSpacing = `${3 * k}px`;
    g.fillText('SAFAR AIRLINES', pad, H - pad - 26 * k);
    g.letterSpacing = '0px';
    g.font = `500 ${Math.round(15 * k)}px Inter, system-ui, sans-serif`;
    g.fillStyle = 'rgba(255,255,255,0.86)';
    const name = (TIME_ORDER.find(([key]) => key === todKey) || [, ''])[1];
    g.fillText(`${CONFIG.flight.from.code} → ${CONFIG.flight.to.code}  ·  ${name}  ·  ${CONFIG.brand?.tagline || 'Dreams to Destinations'}`, pad, H - pad);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    if (!blob) throw new Error('no image');
    const file = new File([blob], `safar-airlines-${todKey}.png`, { type: 'image/png' });
    if (coarse && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Safar Airlines' }); } catch (e) { /* closed */ }
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      ui.toast('Image saved');
    }
  } catch (e) {
    ui.toast('Sorry, the image could not be saved');
  } finally {
    btn.disabled = false;
  }
}
document.getElementById('btnShot').addEventListener('click', (e) => { e.stopPropagation(); saveImage(); });

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
  // a group: the pass shows all the seats and the total
  const multi = travellers > 1 && cls !== 'residence' && cls !== 'first';
  S.sceneGroup = multi ? (S.sceneGroup && S.sceneGroup.includes(seat) ? S.sceneGroup : cabin.groupAround(seat, travellers)) : null;
  if (S.sceneGroup) {
    const lbl = ui.groupLabel(S.sceneGroup);
    for (const k of ['seat', 'seatBig']) document.querySelectorAll(`[data-p="${k}"]`).forEach((e) => { e.textContent = lbl; });
    document.querySelectorAll('[data-p="seatWord"], [data-p="seatWord2"]').forEach((e) => { e.textContent = 'Seats'; });
    document.querySelectorAll('[data-p="price"]').forEach((e) => { e.textContent = fmtMoney(conf.price * S.sceneGroup.length); });
  }
  E.btnBook.classList.remove('is-done');
  E.btnBook.disabled = false;
  const word = cls === 'first' ? 'Suite' : 'seat';
  E.btnBook.textContent = seat.yours ? '✓ Held for you' : isRes ? `Book ${conf.name}` : S.sceneGroup ? `Book ${S.sceneGroup.length} seats` : `Book ${word} ${seat.id}`;
  if (seat.yours) E.btnBook.classList.add('is-done');
  hideHandoff();
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

const audio = createCabinAudio();
addEventListener('pointerdown', () => audio.unlock(), { once: true, capture: true });
{
  const b = document.getElementById('btnSound');
  b.setAttribute('aria-pressed', audio.muted ? 'false' : 'true');
  b.addEventListener('click', (e) => { e.stopPropagation(); const m = audio.toggle(); b.setAttribute('aria-pressed', m ? 'false' : 'true'); if (m && 'speechSynthesis' in window) speechSynthesis.cancel(); });
}
// the welcome announcement the first time you sit down: the same recording that plays on
// safartravelagency.com, after the chime and through the cabin speakers. If it can't load, the
// browser's own voice reads a captain's welcome instead.
let announced = false;
function announce() {
  if (announced || audio.muted) return;
  announced = true;
  audio.announce().then((played) => { if (!played && S.scene && !audio.muted) speakWelcome(); });
}
function speakWelcome() {
  if (!('speechSynthesis' in window)) return;
  const F = CONFIG.flight, h = Math.floor(ROUTE.mins / 60), m = ROUTE.mins % 60;
  const num = F.number.replace(/\D/g, '').split('').join(' ');
  const voices = speechSynthesis.getVoices();
  const en = voices.find((v) => /^en-(GB|ZA)/.test(v.lang)) || voices.find((v) => v.lang.startsWith('en'));
  const say = (text, voice, lang, rate) => { const u = new SpeechSynthesisUtterance(text); if (voice) u.voice = voice; u.lang = lang; u.rate = rate; u.pitch = 0.92; u.volume = 0.9; return u; };
  const lines = [say(`Ladies and gentlemen, this is your captain speaking. Welcome aboard Safar Airlines flight ${num}, from ${F.from.city} to ${F.to.city}. Our flight time today is ${h} hours${m ? ` and ${m} minutes` : ''}, and we are cruising at thirty seven thousand feet. Sit back, relax, and enjoy your flight.`, en, 'en-GB', 0.95)];
  audio.duck(true);
  lines[lines.length - 1].onend = () => audio.duck(false);
  for (const l of lines) speechSynthesis.speak(l);
}
if ('speechSynthesis' in window) speechSynthesis.getVoices();
function openScene({ cls, seat, room, fromFly }) {
  S.scene = { cls, seat, room: room || null };
  audio.enter(cls, { ding: !!fromFly });
  if (fromFly) setTimeout(() => { if (S.scene) announce(); }, 2700);
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
  showDeck(DECK_OF[cls]);
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
// ---------------------------------------------------------------- travelling together
// 1 to 6 travellers: picking a seat takes the free seats beside it too (within the block between
// the aisles if possible), and "Best seats together" finds the best block in the cabin
let travellers = 1;
const travN = document.getElementById('travN');
const btnTogether = document.getElementById('btnTogether');
function updateTogether() {
  btnTogether.hidden = !(travellers > 1 && S.mode === 'class' && S.cls && cabin.classes[S.cls].fabric);
  for (const b of document.querySelectorAll('#travellers button')) b.disabled = (+b.dataset.d < 0 && travellers <= 1) || (+b.dataset.d > 0 && travellers >= 6);
}
function setTravellers(n) {
  travellers = Math.max(1, Math.min(6, n));
  travN.textContent = travellers;
  updateTogether();
  setHoverSeat(S.hoverSeat, { sticky: true });
}
for (const b of document.querySelectorAll('#travellers button')) b.addEventListener('click', (e) => { e.stopPropagation(); setTravellers(travellers + +b.dataset.d); });
btnTogether.addEventListener('click', (e) => {
  e.stopPropagation();
  if (S.mode !== 'class' || S.busy) return;
  const grp = cabin.findTogether(S.cls, travellers);
  if (!grp) { ui.toast(`Sorry, there aren't ${travellers} free seats together in ${CONFIG.classes[S.cls].name}.`); return; }
  S.selected = grp[0];
  S.picked = true;
  setHoverSeat(null, { sticky: true });
  ui.toast(`Seats ${ui.groupLabel(grp)} are free together. Tap the tag to see the view.`);
});
setInterval(updateTogether, 500);

// ---------------------------------------------------------------- book: hand over to Safar
// "Book" holds the seat, then offers to finish with the Safar team on WhatsApp (or by email),
// with the flight, aircraft, cabin, seat, price and a link to this exact seat view filled in.
const handoffEl = document.getElementById('handoff');
const fmtMoney = (n) => n.toLocaleString('en-US');
function seatShareUrl(seat) {
  const base = (CONFIG.site && CONFIG.site.url) || (location.origin + location.pathname);
  const u = new URL(base, location.href);
  u.search = '';
  u.searchParams.set('plane', PLANE);
  u.searchParams.set('seat', seat.id);
  if (S.sceneGroup && S.sceneGroup.length > 1) u.searchParams.set('n', S.sceneGroup.length);
  if (todKey !== (CONFIG.timeOfDay || 'day')) u.searchParams.set('tod', todKey);
  return u.toString();
}
function seatLabel(seat) {
  const conf = CONFIG.classes[seat.cls];
  if (seat.cls === 'residence') return conf.name;
  const where = seat.window ? 'window' : seat.aisle ? 'aisle' : 'middle';
  return `${conf.seatWord} ${seat.id} (${where})`;
}
function bookingMessage(seat) {
  const F = CONFIG.flight, conf = CONFIG.classes[seat.cls];
  const plane = IS_DD ? 'Double-decker' : IS_NARROW ? 'Single-aisle' : 'Widebody';
  const grp = S.sceneGroup && S.sceneGroup.includes(seat) ? S.sceneGroup : null;
  if (i18n.lang === 'ar') {
    const where = seat.window ? 'نافذة' : seat.aisle ? 'ممر' : 'وسط';
    return [
      `السلام عليكم فريق سفر! أرغب في حجز ${grp ? `هذه المقاعد (${grp.length})` : 'هذا المقعد'}:`, '',
      `الرحلة ${F.number} · ${F.from.code} → ${F.to.code}`,
      `التاريخ: ${F.date}`,
      `الطائرة: ${i18n.t(plane)}`,
      `المقصورة: ${i18n.t(conf.name)}`,
      grp ? `المقاعد: ${grp.map((q) => q.id).join('، ')} (${grp.length} مسافرين)` : `المقعد: ${seat.cls === 'residence' ? i18n.t(conf.name) : `${seat.id} (${where})`}`,
      `السعر المعروض: ${F.currency} ${fmtMoney(conf.price * (grp ? grp.length : 1))}`, '',
      `رابط المقعد: ${seatShareUrl(seat)}`, '',
      'أرجو إرسال التوفر والخطوات التالية. شكراً.',
    ].join('\n');
  }
  return [
    `Hi Safar team! I would like to book ${grp ? `these ${grp.length} seats` : 'this seat'}:`, '',
    `Flight ${F.number} · ${F.from.code} → ${F.to.code}`,
    `Date: ${F.date}`,
    `Aircraft: ${plane}`,
    `Cabin: ${conf.name}`,
    grp ? `Seats: ${grp.map((q) => q.id).join(', ')} (${grp.length} travellers)` : `Seat: ${seatLabel(seat)}`,
    grp ? `Price shown: ${F.currency} ${fmtMoney(conf.price * grp.length)} (${grp.length} × ${fmtMoney(conf.price)})` : `Price shown: ${F.currency} ${fmtMoney(conf.price)}`, '',
    `Seat view: ${seatShareUrl(seat)}`, '',
    'Please send me availability and the next steps.',
  ].join('\n');
}
function showHandoff(seat) {
  const conf = CONFIG.classes[seat.cls];
  document.getElementById('handoffTitle').textContent = S.sceneGroup && S.sceneGroup.length > 1
    ? `Seats ${ui.groupLabel(S.sceneGroup)} are held for you`
    : `${seat.cls === 'residence' ? conf.name : `${conf.seatWord} ${seat.id}`} is held for you`;
  const msg = bookingMessage(seat);
  document.getElementById('btnWhatsApp').href = `https://wa.me/${CONFIG.contact.whatsapp}?text=${encodeURIComponent(msg)}`;
  document.getElementById('btnEmail').href = `mailto:${CONFIG.contact.email}?subject=${encodeURIComponent(`Booking: ${seatLabel(seat)}, flight ${CONFIG.flight.number}`)}&body=${encodeURIComponent(msg)}`;
  handoffEl.hidden = false;
  gsap.fromTo(handoffEl, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: reduce ? 0.1 : 0.45, ease: 'power3.out' });
}
const hideHandoff = () => { handoffEl.hidden = true; };
// share a link that opens straight into this seat (the phone's share sheet, or copy to clipboard)
async function shareSeat() {
  if (!S.scene) return;
  const { seat } = S.scene;
  const url = seatShareUrl(seat);
  const text = `${seatLabel(seat)}, ${CONFIG.classes[seat.cls].name}, Safar flight ${CONFIG.flight.number} ${CONFIG.flight.from.code} → ${CONFIG.flight.to.code}`;
  if (coarse && navigator.share) {
    try { await navigator.share({ title: 'Safar Airlines', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); ui.toast('Link to this seat copied'); }
  catch (e) { window.prompt('Copy this link to the seat:', url); }
}
document.getElementById('btnShare').addEventListener('click', (e) => { e.stopPropagation(); shareSeat(); });
document.getElementById('btnShareSeat').addEventListener('click', (e) => { e.stopPropagation(); shareSeat(); });

E.btnBook.addEventListener('click', async () => {
  if (S.scene && E.btnBook.classList.contains('is-done')) { showHandoff(S.scene.seat); return; }
  if (!S.scene || E.btnBook.classList.contains('is-done') || E.btnBook.disabled) return;
  const { cls, seat } = S.scene;
  const conf = CONFIG.classes[cls];
  E.btnBook.disabled = true;
  E.btnBook.innerHTML = '<span class="spin" aria-hidden="true"></span> Holding your seat';
  await new Promise((r) => setTimeout(r, 900));
  if (S.sceneGroup && S.sceneGroup.length > 1) cabin.markYoursGroup(S.sceneGroup); else cabin.markYours(seat);
  ui.fillPass(cls, seat);
  E.btnBook.disabled = false;
  E.btnBook.classList.add('is-done');
  E.btnBook.textContent = '✓ Held for you';
  showHandoff(seat);
});
E.btnSceneBack.addEventListener('click', () => backToPlane());

async function backToPlane() {
  if (!S.scene || (S.busy && S.mode !== 'scene')) return;
  S.busy = true;
  const { seat } = S.scene;
  const cls = seat.cls;
  // the camera is already in the seat: stand up, out through the roof and back to the cabin map
  stopLook();
  audio.leave();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
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
  // ease in towards the SAFAR titles so the logo grows on screen; on a phone the whole aircraft
  // stays in frame, the camera just drifts a little closer and round towards the titles
  let heroEnd;
  if (isPortrait()) {
    const end = fitPose(new V3(0.6, 0.28, 1).normalize(), { mx: 0.96, my: 0.84 });
    heroEnd = { pos: end.pos, target: end.target, up: hero.up.clone() };
  } else {
    const logoX = 9;
    heroEnd = {
      pos: hero.pos.clone().lerp(hero.target, 0.2).add(new V3(logoX - hero.target.x, 0.2, 0)),
      target: new V3(logoX, hero.target.y, 0),
      up: hero.up.clone(),
    };
  }
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
  overviewHint();
  pickPending = true;
  // a shared link (?seat=40A) opens straight into that seat
  const id = params.get('seat');
  const seat = id && cabin.byId.get(id.toUpperCase());
  if (seat && +params.get('n') > 1) setTravellers(+params.get('n'));
  if (seat) setTimeout(() => openSharedSeat(seat), 500);
}
async function openSharedSeat(seat) {
  if (S.busy) { setTimeout(() => openSharedSeat(seat), 300); return; }
  if (seat.cls !== 'residence') { await enterClass(seat.cls); }
  setHoverSeat(null);
  flyToSeat(seat, seat.cls === 'residence' ? 'living' : undefined);
}

// On phones and tablets the seat key (Available / Taken / Yours) sits just above the buttons at
// the bottom. That row can wrap onto two lines (more travellers adds "Best seats together"), so
// the key follows the row's real height instead of a fixed position.
{
  const legend = ui.els.legend, dock = document.querySelector('.dock');
  const placeLegend = () => {
    if (innerWidth > 860 || !dock) { legend.style.bottom = ''; return; }
    legend.style.bottom = `${Math.round(innerHeight - dock.getBoundingClientRect().top + 10)}px`;
  };
  if (dock && 'ResizeObserver' in window) new ResizeObserver(placeLegend).observe(dock);
  addEventListener('resize', placeLegend);
  placeLegend();
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
    if (S.mode === 'overview' && !orbit.on) setRig(viewPose(viewKind));
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

// ---------------------------------------------------------------- VR headset
// On a headset browser (Quest, Pico, Vision Pro, PC VR) a VR button appears. You start where
// you were: in your seat if you had chosen one, otherwise beside the wing. The trigger (or a
// pinch) moves you between your seat, beside the wing and the flight deck. You ride with the
// aircraft, so the cabin stays steady around you and only the sky moves, as it does on board.
// The headset draws straight to its own screens: no ambient occlusion or bloom, and the cloud
// deck is captured once into a cube so each eye sees it in the right place.
const vr = { on: false, session: null, rig: null, shell: null, label: null, spots: [], idx: 0, saved: null, hideAt: 0 };
const btnVR = document.getElementById('btnVR');
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => { if (ok) btnVR.hidden = false; }).catch(() => {});
}
btnVR.addEventListener('click', (e) => { e.stopPropagation(); vr.session ? vr.session.end() : enterVR(); });

function vrSetup() {
  if (vr.rig) return;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');      // seated: your eyes start exactly at the seat
  vr.rig = new THREE.Group();
  vr.rig.name = 'vrRig';
  for (let i = 0; i < 2; i++) {
    renderer.xr.getController(i).addEventListener('select', () => vrGo(vr.idx + 1));
  }
  // the cloud deck as seen from the aircraft, drawn at infinity for each eye
  vr.shell = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.ShaderMaterial({
    uniforms: { tCube: { value: null } },
    vertexShader: /* glsl */`varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 0.0);
        gl_Position = vec4(p.xy, p.w * 0.999999, p.w);
      }`,
    fragmentShader: /* glsl */`uniform samplerCube tCube; varying vec3 vDir;
      void main() {
        gl_FragColor = textureCube(tCube, normalize(vDir));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, premultipliedAlpha: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  vr.shell.frustumCulled = false;
  vr.shell.renderOrder = -50;
  vr.shell.visible = false;
  scene.add(vr.shell);
  // a small card that names the view for a few seconds
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 256;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  vr.label = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.16), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
  vr.label.renderOrder = 999;
  vr.label.position.set(0, -0.32, -1.05);
  vr.label.rotation.x = -0.28;
  vr.label.userData.canvas = cv;
  vr.rig.add(vr.label);
}

// Custom sky and weather shaders leave tone mapping to the post-processing chain, which the
// headset skips, so they get the same tone mapping in-shader. (It does nothing when they draw
// into the post-processing buffers, so the normal view is unchanged.)
function vrToneMapShaders() {
  scene.traverse((o) => {
    const list = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of list) {
      if (!m.isShaderMaterial || m.isRawShaderMaterial || m.userData.vrToned) continue;
      m.userData.vrToned = true;
      const fs = m.fragmentShader;
      const end = fs.lastIndexOf('}');
      if (end < 0 || /colorspace_fragment/.test(fs)) continue;
      m.fragmentShader = fs.slice(0, end) + '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n' + fs.slice(end);
      m.needsUpdate = true;
    }
  });
}

function vrSpots() {
  const spots = [];
  const local = (v) => ac.group.worldToLocal(v.clone());
  if (S.mode === 'scene' && S.scene) {
    const seat = S.scene.seat;
    const name = seat ? (seat.cls === 'residence' ? CONFIG.classes.residence.name : `${i18n.t(CONFIG.classes[seat.cls].seatWord)} ${seat.id}`) : i18n.t('Your seat');
    spots.push({ name, pos: local(rig.pos), look: local(rig.target), inside: 1 });
  }
  // beside the wing, a little ahead of it, the whole aircraft in view
  const box = new THREE.Box3().setFromObject(ac.group);
  const c = local(box.getCenter(new V3())), len = box.max.x - box.min.x;
  const dir = new V3(...VIEW_DIRS.side).normalize();
  spots.push({ name: i18n.t('Beside the wing'), pos: c.clone().addScaledVector(dir, len * 0.62), look: c, inside: 0 });
  spots.push({ name: i18n.t('Flight deck'), pos: ac.cockpitView.eye.clone(), look: ac.cockpitView.look.clone(), inside: 1 });
  return spots;
}

function vrLabel(text) {
  const cv = vr.label.userData.canvas, g = cv.getContext('2d');
  const rtl = i18n.lang === 'ar';
  g.clearRect(0, 0, cv.width, cv.height);
  g.fillStyle = 'rgba(10, 16, 24, 0.72)';
  g.beginPath(); g.roundRect(8, 8, cv.width - 16, cv.height - 16, 110); g.fill();
  g.direction = rtl ? 'rtl' : 'ltr';
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = `600 76px ${rtl ? '"Noto Kufi Arabic", ' : ''}Inter, system-ui, sans-serif`;
  g.fillText(text, cv.width / 2, 118);
  g.fillStyle = 'rgba(255, 255, 255, 0.7)';
  g.font = `500 44px ${rtl ? '"Noto Kufi Arabic", ' : ''}Inter, system-ui, sans-serif`;
  g.fillText(i18n.t('Trigger for the next view'), cv.width / 2, 196);
  vr.label.material.map.needsUpdate = true;
  vr.label.material.opacity = 1;
  vr.label.visible = true;
  vr.hideAt = performance.now() + 4500;
}

function vrGo(i) {
  if (!vr.spots.length) return;
  vr.idx = ((i % vr.spots.length) + vr.spots.length) % vr.spots.length;
  const s = vr.spots[vr.idx];
  vr.rig.position.copy(s.pos);
  const d = s.look.clone().sub(s.pos);
  vr.rig.rotation.set(0, Math.atan2(-d.x, -d.z), 0);   // the view you had becomes straight ahead
  setInside(s.inside);
  setRoof(1);
  vrLabel(s.name);
}

async function enterVR() {
  if (vr.session || !navigator.xr) return;
  vrSetup();
  let session;
  try {
    session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
  } catch (e) {
    ui.toast(i18n.t('VR could not start on this device'));
    return;
  }
  // capture the cloud deck before the headset takes over the renderer
  const lowPower = /Quest|Oculus|Pico|Mobile/i.test(navigator.userAgent);
  const cube = sky.clouds.captureEnv(lowPower ? 512 : 1024, { env: false, steps: 72, light: 4 });
  if (vr.shell.material.uniforms.tCube.value) vr.shell.material.uniforms.tCube.value.dispose?.();
  vr.cubeRT?.dispose();
  vr.cubeRT = cube;
  vr.shell.material.uniforms.tCube.value = cube ? cube.texture : null;
  vrToneMapShaders();
  vr.saved = { inside: insideK, roof: roof.v, near: camera.near, mode: S.mode };
  vr.spots = vrSpots();
  vr.session = session;
  vr.on = true;
  session.addEventListener('end', vrEnd);
  ac.group.add(vr.rig);
  vr.rig.add(camera);
  camera.near = 0.08;
  camera.updateProjectionMatrix();
  sky.clouds.composite.visible = false;
  vr.shell.visible = !!cube;
  ui.hideTag();
  vrGo(0);
  btnVR.setAttribute('aria-pressed', 'true');
  await renderer.xr.setSession(session);
  last = performance.now();
  renderer.setAnimationLoop(vrTick);
}

function vrEnd() {
  renderer.setAnimationLoop(null);
  vr.on = false;
  vr.session = null;
  vr.rig.remove(camera);
  ac.group.remove(vr.rig);
  camera.near = vr.saved.near;
  camera.updateProjectionMatrix();
  sky.clouds.composite.visible = true;
  vr.shell.visible = false;
  setInside(vr.saved.inside);
  setRoof(vr.saved.roof);
  sky.clouds.resetHistory();
  btnVR.setAttribute('aria-pressed', 'false');
  onResize();
  last = performance.now();
  requestAnimationFrame(tick);
}

function vrTick(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  simulate(dt);
  if (vr.label.visible && now > vr.hideAt) {
    vr.label.material.opacity -= dt * 1.5;
    if (vr.label.material.opacity <= 0) vr.label.visible = false;
  }
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function tick(now) {
  if (vr.on) return;                     // the headset runs its own loop while it is on
  const raw = (now - last) / 1000;
  const dt = Math.min(0.05, raw);
  last = now;
  simulate(dt);
  if (renderOn) {
    updateOrbit(dt);
    updateLook(dt);
    applyCamera(dt);
    autoRoof();
    updateTag();
    sky.renderClouds(camera);
    composer.render(dt);
    adapt(raw);
    guardSeat(raw);
  }
  requestAnimationFrame(tick);
}
function simulate(dt) {
  sky.update(dt);
  updateFlight(dt);
  if (pickPending && !S.busy && (S.mode === 'overview' || S.mode === 'class')) { pickPending = false; pick(); }
  ac.updateLights(flight.t);
  ac.spin(dt);
  {
    const w = sky.clouds.uniforms.uWind.value, target = ac.phase === 'approach' ? 80 : 235;
    w.x += (target - w.x) * Math.min(1, dt * 0.6);
  }
  contrails.update(dt, ac.group);
  ife.update(dt, S.mode === 'scene' || S.mode === 'class' || S.mode === 'flying');
  updateJourney(dt);
  cloudBank.update(dt, camera, { allowMist: S.mode !== 'scene' && S.mode !== 'flying' });
  rain.update(dt);
  if (preset.lightning) {
    // a flash lights the clouds from inside and briefly brightens everything
    const f = lightning.update(dt);
    const cu = sky.clouds.uniforms, c = preset.clouds;
    cu.uAmbTop.value.set(...c.ambTop).multiplyScalar(1 + 5 * f);
    cu.uAmbBottom.value.set(...c.ambBottom).multiplyScalar(1 + 7 * f);
    hemi.intensity = THREE.MathUtils.lerp(preset.hemiIntensity, 0.08, insideK) + f * 1.4;
    sky.setFlash(f);
    if (f > 0.05) sky.clouds.resetHistory();
  }
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
window.__flight = { THREE, scene, camera, cabin, ac, S, rig, startJourney, updateJourney, get J() { return J; }, ife, fitPose, heroPose, setTimeOfDay, setView, renderer, composer, gtao, sky, airframe, flight, cabinFill, setInside, enterClass, flyToSeat, focusShadow, look, lens, nudgeLook, upgradeTo, goRoom, backToPlane, vr, vrSetup, vrSpots, vrGo, vrToneMapShaders, simulate, audio, overviewPose, fitPose, cabinOutline };
