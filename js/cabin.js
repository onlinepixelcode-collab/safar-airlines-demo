import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FUS, fusProfile, WIN, WINDOWS, WIN_ROWS, IS_DD, IS_NARROW, DOORS, UPPER_DOORS, mulberry32, hashStr } from './geo.js';
import { CONFIG, CLASS_ORDER } from './config.js';
import { makeFacetPanelTexture, makeBulkheadLogoTexture, makeRunnerTexture, makeBlobTexture, makeScreenTexture, makePsuTexture, makeRowLabelTexture, makeSeatFabricTexture, makeQuiltTexture, makeLouvreTexture } from './textures.js';

// floor height of the deck being built (the double-decker has two)
let F = FUS.FLOOR_Y;
// which deck each cabin is on: everything on the twin; on the double-decker Economy and Premium
// fill the main deck and The Residence, First and Business are upstairs
export const DECK_OF = IS_DD
  ? { economy: 'main', premium: 'main', business: 'upper', first: 'upper', residence: 'upper' }
  : { economy: 'main', premium: 'main', business: 'main', first: 'main', residence: 'main' };
export const floorOf = (cls) => (DECK_OF[cls] === 'upper' ? FUS.UPPER_Y : FUS.FLOOR_Y);
const rowOf = (cls) => WIN_ROWS.find((r) => r.deck === DECK_OF[cls]) || WIN_ROWS[0];
const ORANGE = new THREE.Color(CONFIG.brand.colors.primary);  // available seats light up in brand blue
const HOVER = new THREE.Color(CONFIG.brand.colors.hover || '#a6ecff');
const YOURS = new THREE.Color('#33b36b');

// ---------- geometry helpers ----------
let SEG_MAX = 2;
function part(w, h, d, x, y, z, { rz = 0, ry = 0, rx = 0, round = 0.03, seg = 2 } = {}) {
  seg = Math.min(seg, SEG_MAX);
  const g = round > 0 ? new RoundedBoxGeometry(w, h, d, seg, Math.min(round, w / 2.1, h / 2.1, d / 2.1)) : new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
function merge(list) {
  const clean = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    return n;
  });
  const m = mergeGeometries(clean, false);
  m.computeBoundingSphere();
  return m;
}

// ---------- seat designs (origin on the floor, facing +X) ----------
// A seatback panel shaped like the real thing: a rounded-top "tombstone" outline, extruded to
// its thickness. Built upright in back-local space (x = thickness, towards the seat front;
// y = height from the recline pivot; z = width) so the whole back can be reclined together.
function backPanel(w, h, rTop, rBot, depth, { x = 0, y0 = 0, bevel = 0.008, seg = 6 } = {}) {
  const hw = w / 2;
  rTop = Math.min(rTop, hw * 0.98, h / 2); rBot = Math.min(rBot, hw * 0.98, h / 2);
  const s = new THREE.Shape();
  s.moveTo(-hw + rBot, 0);
  s.lineTo(hw - rBot, 0); s.quadraticCurveTo(hw, 0, hw, rBot);
  s.lineTo(hw, h - rTop); s.quadraticCurveTo(hw, h, hw - rTop, h);
  s.lineTo(-hw + rTop, h); s.quadraticCurveTo(-hw, h, -hw, h - rTop);
  s.lineTo(-hw, rBot); s.quadraticCurveTo(-hw, 0, -hw + rBot, 0);
  // thin flat details (screen surround, tray, pocket) don't need a rounded bevel
  if (bevel <= 0.003) { bevel = 0; seg = Math.min(seg, 3); }
  const d = Math.max(0.002, depth - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: SEG_MAX > 1 ? 2 : 1, curveSegments: Math.max(2, Math.min(seg, SEG_MAX * 3)) });
  g.translate(0, y0, -d / 2);
  g.rotateY(Math.PI / 2);          // shape width -> z, extrusion -> x (thickness)
  g.translate(x, 0, 0);
  return g;
}
// recline a set of back-local geometries about the pivot (px, py) and return them
function recline(list, rec, px, py) {
  for (const g of list) { g.rotateZ(rec); g.translate(px, py, 0); }
  return list;
}
const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };

// Economy: navy Safar-weave fabric, white leather headrest cover, white moulded shell with the
// screen in a dark surround, a control strip, the tray table with its latch and a seat pocket.
function economySeat() {
  const rec = 0.16, px = -0.2, py = 0.5;
  const fabric = [part(0.46, 0.11, 0.43, 0.03, 0.45, 0, { round: 0.045 })];   // cushion
  const shell = [], accent = [], trim = [], screen = [];
  // back, built upright then reclined
  const bFab = [backPanel(0.41, 0.62, 0.1, 0.02, 0.08, { x: 0, y0: 0, bevel: 0.018 })];
  const bAcc = [backPanel(0.34, 0.17, 0.07, 0.03, 0.03, { x: 0.045, y0: 0.44, bevel: 0.01 })];
  const bShell = [backPanel(0.45, 0.74, 0.13, 0.03, 0.04, { x: -0.06, y0: -0.06, bevel: 0.01 })];
  const bTrim = [
    backPanel(0.29, 0.215, 0.025, 0.025, 0.012, { x: -0.084, y0: 0.37, bevel: 0.002 }),   // screen surround
    box(0.006, 0.026, 0.13, -0.084, 0.335, 0),                                             // control strip
    box(0.006, 0.022, 0.08, -0.089, 0.205, 0),                                             // tray latch
    backPanel(0.4, 0.1, 0.02, 0.02, 0.012, { x: -0.084, y0: -0.035, bevel: 0.002 }),       // seat pocket
  ];
  const bTray = [backPanel(0.36, 0.19, 0.025, 0.025, 0.01, { x: -0.082, y0: 0.05, bevel: 0.002 })];
  const bScreen = [box(0.004, 0.172, 0.262, -0.0915, 0.4775, 0)];
  recline([...bFab, ...bAcc, ...bShell, ...bTrim, ...bTray, ...bScreen], rec, px, py);
  fabric.push(...bFab); accent.push(...bAcc); shell.push(...bShell, ...bTray); trim.push(...bTrim); screen.push(...bScreen);
  // armrests and frame
  for (const z of [0.235, -0.235]) {
    trim.push(part(0.4, 0.045, 0.05, 0.0, 0.66, z, { round: 0.02, seg: 1 }));
    shell.push(part(0.07, 0.2, 0.04, 0.17, 0.55, z, { round: 0.015, seg: 1 }));
  }
  shell.push(part(0.38, 0.06, 0.4, 0.0, 0.37, 0, { round: 0 }));
  for (const sx of [0.13, -0.13]) for (const sz of [0.15, -0.15]) shell.push(part(0.05, 0.34, 0.05, sx, 0.17, sz, { round: 0 }));
  return { fabric: merge(fabric), shell: merge(shell), trim: merge(trim), accent: merge(accent), screen: merge(screen), footprint: [0.62, 0.48] };
}

// Premium: wider, deeper recline, a leg rest, a bigger screen and wider armrests.
function premiumSeat() {
  const rec = 0.2, px = -0.24, py = 0.52;
  const fabric = [part(0.52, 0.13, 0.48, 0.04, 0.46, 0, { round: 0.05 }),
    part(0.3, 0.06, 0.4, 0.38, 0.33, 0, { rz: -0.9, round: 0.025 })];         // cushion, leg rest
  const shell = [], accent = [], trim = [], screen = [];
  const bFab = [backPanel(0.46, 0.7, 0.12, 0.03, 0.1, { x: 0, y0: 0, bevel: 0.022 })];
  const bAcc = [backPanel(0.38, 0.19, 0.08, 0.03, 0.032, { x: 0.055, y0: 0.5, bevel: 0.012 })];
  const bShell = [backPanel(0.52, 0.82, 0.15, 0.04, 0.045, { x: -0.072, y0: -0.07, bevel: 0.012 })];
  const bTrim = [
    backPanel(0.36, 0.26, 0.03, 0.03, 0.012, { x: -0.1, y0: 0.42, bevel: 0.002 }),
    box(0.006, 0.03, 0.16, -0.1, 0.38, 0),
    box(0.006, 0.024, 0.09, -0.105, 0.235, 0),                                              // tray latch
    backPanel(0.44, 0.11, 0.02, 0.02, 0.012, { x: -0.1, y0: -0.04, bevel: 0.002 }),
  ];
  const bTray = [backPanel(0.4, 0.2, 0.03, 0.03, 0.01, { x: -0.098, y0: 0.07, bevel: 0.002 })];
  const bScreen = [box(0.004, 0.215, 0.33, -0.1075, 0.55, 0)];
  recline([...bFab, ...bAcc, ...bShell, ...bTrim, ...bTray, ...bScreen], rec, px, py);
  fabric.push(...bFab); accent.push(...bAcc); shell.push(...bShell, ...bTray); trim.push(...bTrim); screen.push(...bScreen);
  for (const z of [0.27, -0.27]) {
    trim.push(part(0.5, 0.07, 0.08, 0.0, 0.68, z, { round: 0.03, seg: 1 }));
    shell.push(part(0.1, 0.22, 0.07, 0.2, 0.56, z, { round: 0.02, seg: 1 }));
  }
  shell.push(part(0.44, 0.07, 0.44, 0.0, 0.37, 0, { round: 0 }));
  for (const sx of [0.15, -0.15]) for (const sz of [0.17, -0.17]) shell.push(part(0.06, 0.34, 0.06, sx, 0.17, sz, { round: 0 }));
  return { fabric: merge(fabric), shell: merge(shell), trim: merge(trim), accent: merge(accent), screen: merge(screen), footprint: [0.78, 0.56] };
}

// Business (1-2-1): a navy wraparound shell with a curved hood around your head and satin
// silver edges, quilted white leather, a sky-blue pillow, a console with a faceted sky-blue
// top, a lit minibar niche and a tablet remote, and a big screen over the ottoman.
function sidePanel(x0, x1, hLow, hHigh, hoodLen, thick, z) {
  // side wall in the x-y plane, tall (hood) at the back, stepping down to the console height
  const s = new THREE.Shape();
  const xh = x0 + hoodLen;
  s.moveTo(x0, 0);
  s.lineTo(x1, 0);
  s.lineTo(x1, hLow - 0.03); s.quadraticCurveTo(x1, hLow, x1 - 0.03, hLow);
  s.lineTo(xh + 0.12, hLow);
  s.quadraticCurveTo(xh, hLow, xh, hLow + 0.12);
  s.lineTo(xh, hHigh - 0.18); s.quadraticCurveTo(xh, hHigh, xh - 0.2, hHigh);
  s.lineTo(x0 + 0.05, hHigh); s.quadraticCurveTo(x0, hHigh, x0, hHigh - 0.05);
  s.lineTo(x0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: Math.max(2, SEG_MAX * 3) });
  g.translate(0, 0, z - thick / 2);
  return g;
}
function businessPod() {
  const fabric = [], shell = [], trim = [], accent = [], screen = [], metal = [], glow = [], deck = [];
  const zc = -0.08;
  // seat: cushion and a reclined, shaped back in quilted leather with a white headrest cover
  fabric.push(part(0.62, 0.13, 0.54, -0.27, 0.48, zc, { round: 0.05 }));
  const bFab = [backPanel(0.54, 0.76, 0.15, 0.04, 0.13, { bevel: 0.03 })];
  const bAcc = [backPanel(0.4, 0.2, 0.08, 0.04, 0.035, { x: 0.075, y0: 0.56, bevel: 0.012 })];
  recline([...bFab, ...bAcc], 0.22, -0.56, 0.52);
  for (const g of [...bFab, ...bAcc]) g.translate(0, 0, zc);
  fabric.push(...bFab); accent.push(...bAcc);
  accent.push(part(0.4, 0.07, 0.48, 0.55, 0.47, -0.06, { round: 0.03 }));               // ottoman pad
  accent.push(part(0.13, 0.3, 0.42, -0.36, 0.7, zc, { rz: 0.22, round: 0.06 }));        // sky-blue lumbar pillow
  // wraparound shell: tall rounded back, hooded side walls, ottoman and front partition
  shell.push(backPanel(0.94, 1.2, 0.3, 0.03, 0.07, { x: -0.8, y0: 0, bevel: 0.01 }));
  shell.push(sidePanel(-0.8, 0.8, 0.9, 1.2, 0.55, 0.06, 0.44));                         // console side
  shell.push(sidePanel(-0.8, 0.2, 0.9, 1.2, 0.55, 0.06, -0.44));                        // open side
  shell.push(part(0.42, 0.44, 0.52, 0.55, 0.22, -0.06, { round: 0.04 }));               // ottoman
  shell.push(part(0.05, 0.9, 0.62, 0.79, 0.45, -0.04, { round: 0.015, seg: 1 }));        // front partition
  // console with a faceted sky-blue top, a lit minibar niche and a tablet remote
  shell.push(part(0.88, 0.66, 0.2, -0.26, 0.33, 0.31, { round: 0.025 }));
  deck.push(part(0.9, 0.025, 0.22, -0.26, 0.672, 0.31, { round: 0.01, seg: 1 }));
  shell.push(part(0.34, 0.3, 0.06, -0.47, 0.83, 0.38, { round: 0.015, seg: 1 }));       // niche back
  shell.push(part(0.34, 0.025, 0.18, -0.47, 0.985, 0.31, { round: 0.008, seg: 1 }));    // niche roof
  for (const nx of [-0.635, -0.305]) shell.push(part(0.02, 0.3, 0.18, nx, 0.83, 0.31, { round: 0, seg: 1 }));
  glow.push(box(0.3, 0.26, 0.004, -0.47, 0.83, 0.348));                                  // warm light inside the niche
  metal.push(part(0.3, 0.008, 0.14, -0.47, 0.8, 0.31, { round: 0, seg: 1 }));            // niche shelf
  screen.push(part(0.15, 0.008, 0.1, -0.02, 0.69, 0.3, { round: 0 }));                   // tablet remote
  // satin silver edges
  metal.push(part(1.0, 0.012, 0.066, 0.3, 0.905, 0.44, { round: 0.005, seg: 1 }));
  metal.push(part(0.4, 0.012, 0.066, 0.0, 0.905, -0.44, { round: 0.005, seg: 1 }));
  for (const z of [0.44, -0.44]) metal.push(part(0.012, 0.3, 0.066, -0.25, 1.04, z, { round: 0.005, seg: 1 }));
  metal.push(part(0.9, 0.01, 0.012, -0.26, 0.686, 0.42, { round: 0, seg: 1 }));
  // the big screen on the partition, in a dark surround
  trim.push(part(0.03, 0.44, 0.7, 0.775, 1.12, -0.04, { round: 0 }));
  screen.push(part(0.012, 0.4, 0.66, 0.755, 1.12, -0.04, { round: 0 }));
  shell.push(part(0.04, 0.52, 0.78, 0.8, 1.12, -0.04, { round: 0.015, seg: 1 }));        // screen housing
  return { fabric: merge(fabric), shell: merge(shell), trim: merge(trim), accent: merge(accent), screen: merge(screen),
    metal: merge(metal), glow: merge(glow), deck: merge(deck), footprint: [1.65, 0.95] };
}

function firstSuite(doorSide, windowSide = false) {
  // doorSide: +1 => opening on +Z, -1 => opening on -Z
  // A private room like the real First suites: full-height walls and a louvred sliding door,
  // a quilted leather back wall, two reading lamps, curtains at the windows and a big screen.
  // windowSide: the wall along the cabin windows is a low console, so the windows are inside.
  const walls = [], leather = [], trim = [], quilt = [], door = [], lamp = [], curtain = [], metal = [];
  const L = 2.45, Wd = 1.24, H = 2.0;
  walls.push(part(0.07, H, Wd, -L / 2, H / 2, 0, { round: 0.03 }));
  walls.push(part(0.07, H, Wd, L / 2, H / 2, 0, { round: 0.03 }));
  const zOpen = doorSide * Wd / 2, zClosed = -doorSide * Wd / 2, inward = -doorSide;  // towards the closed side
  if (windowSide) {
    const ch = 0.7;
    walls.push(part(L, ch, 0.06, 0, ch / 2, zClosed, { round: 0.025 }));
    trim.push(part(L - 0.12, 0.035, 0.24, 0, ch + 0.012, zClosed + doorSide * 0.09, { round: 0.012, seg: 1 }));  // console top
    // curtains drawn back at both ends of the window run
    for (const cx of [-L / 2 + 0.2, L / 2 - 0.2]) {
      for (let k = 0; k < 4; k++) curtain.push(part(0.055, 1.2, 0.03, cx + (k - 1.5) * 0.045, 1.33, zClosed + doorSide * (0.07 + (k % 2) * 0.03), { round: 0.012, seg: 1 }));
      metal.push(part(0.24, 0.012, 0.012, cx, 1.95, zClosed + doorSide * 0.085, { round: 0, seg: 1 }));
    }
  } else {
    walls.push(part(L, H, 0.06, 0, H / 2, zClosed, { round: 0.025 }));
  }
  walls.push(part(0.85, H, 0.06, -L / 2 + 0.43, H / 2, zOpen, { round: 0.025 }));
  walls.push(part(0.75, H, 0.06, L / 2 - 0.38, H / 2, zOpen, { round: 0.025 }));
  // sliding door, slid most of the way open along the aisle side of the front wall
  door.push(part(0.82, 1.92, 0.035, L / 2 - 0.52, 0.98, zOpen + doorSide * 0.05, { round: 0.01, seg: 1 }));
  metal.push(part(1.6, 0.02, 0.04, L / 2 - 0.62, 1.975, zOpen + doorSide * 0.05, { round: 0, seg: 1 }));   // door track
  // quilted leather back wall with two reading lamps
  quilt.push(part(0.03, 1.15, Wd - 0.16, -L / 2 + 0.05, 1.28, 0, { round: 0.012, seg: 1 }));
  for (const lz of [-0.36, 0.36]) {
    metal.push(part(0.07, 0.07, 0.07, -L / 2 + 0.085, 1.78, lz, { round: 0.03 }));
    lamp.push(box(0.004, 0.045, 0.045, -L / 2 + 0.122, 1.765, lz));
  }
  metal.push(part(0.012, 0.012, Wd - 0.16, -L / 2 + 0.07, 1.87, 0, { round: 0, seg: 1 }));               // trim rail
  // seat + ottoman
  leather.push(part(0.72, 0.15, 0.66, -0.55, 0.47, 0, { round: 0.06 }));
  leather.push(part(0.17, 0.86, 0.68, -0.95, 0.93, 0, { rz: 0.2, round: 0.06 }));
  leather.push(part(0.62, 0.22, 0.13, -0.55, 0.62, 0.38, { round: 0.05 }));
  leather.push(part(0.62, 0.22, 0.13, -0.55, 0.62, -0.38, { round: 0.05 }));
  leather.push(part(0.52, 0.42, 0.56, 0.62, 0.21, 0, { round: 0.06 }));
  leather.push(part(0.13, 0.24, 0.48, -1.05, 1.4, 0, { rz: 0.2, round: 0.06 }));
  // side cabinet with a lit minibar shelf, the big screen, the floor
  trim.push(part(0.5, 0.64, 0.3, 0.1, 0.32, zClosed * 0.78, { round: 0.03 }));
  lamp.push(box(0.4, 0.006, 0.18, 0.1, 0.645, zClosed * 0.78 + inward * 0.0));
  trim.push(part(0.03, 0.66, 1.08, L / 2 - 0.05, 1.15, 0, { round: 0.01, seg: 1 }));
  trim.push(part(L - 0.1, 0.01, Wd - 0.08, 0, 0.006, 0, { round: 0 }));
  const screen = [part(0.012, 0.6, 1.02, L / 2 - 0.071, 1.15, 0, { round: 0 })];
  return { walls: merge(walls), leather: merge(leather), trim: merge(trim), screen: merge(screen), quilt: merge(quilt), door: merge(door),
    lamp: merge(lamp), curtain: curtain.length ? merge(curtain) : null, metal: merge(metal), footprint: [2.5, 1.3] };
}

// ---------- layout ----------
// x positions (nose is +X). Zones are where each class lives on the floor.
export const ZONES = IS_NARROW ? {
  business: { x0: 10.3, x1: 14.0 },
  economy: { x0: -12.4, x1: 9.2 },
  premium: { x0: 0, x1: 0 }, first: { x0: 0, x1: 0 }, residence: { x0: 19.0, x1: 26.0 },
} : IS_DD ? {
  residence: { x0: 19.0, x1: 26.0 },     // upper deck, at the front
  first: { x0: 12.4, x1: 17.8 },
  business: { x0: -12.5, x1: 11.0 },
  premium: { x0: 18.3, x1: 27.1 },       // main deck, at the front
  economy: { x0: -21.4, x1: 14.8 },
} : {
  residence: { x0: 19.0, x1: 26.0 },
  first: { x0: 12.4, x1: 17.8 },
  business: { x0: 2.6, x1: 11.0 },
  premium: { x0: -5.2, x1: 1.0 },
  economy: { x0: -20.8, x1: -6.6 },
};

// seat rows that keep the cross-aisles at the doors clear
function rowPositions(start, pitch, stop, doors, clear) {
  const out = [];
  for (let x = start; x > stop; x -= pitch) if (!doors.some((d) => Math.abs(d - x) < clear)) out.push(+x.toFixed(3));
  return out;
}
const NB_ROWS = IS_NARROW ? {
  economy: rowPositions(8.7, 0.79, -12.2, [0.4], 0.62),
  business: rowPositions(13.5, 0.97, 10.4, [], 1),
} : null;
const DD_ROWS = IS_DD ? {
  economy: rowPositions(14.3, 0.81, -21.2, DOORS, 1.05),
  premium: rowPositions(26.6, 0.97, 18.4, DOORS, 1.0),
  business: rowPositions(10.15, 1.68, -12.6, UPPER_DOORS, 1.1),
} : null;
const firstRow = { economy: 31, premium: 21, business: 3 };
function rowsFor(cls) {
  if (IS_NARROW && NB_ROWS[cls]) {
    const xs = NB_ROWS[cls], r0 = cls === 'economy' ? 6 : 1;
    const rows = xs.map((_, i) => r0 + i);
    const x = (r) => xs[r - r0];
    // single aisle: Economy 3-3, Business 2-2 recliners
    if (cls === 'economy') return { rows, x, cols: [['A', -1.47], ['B', -0.99], ['C', -0.51], ['D', 0.51], ['E', 0.99], ['F', 1.47]], window: 'AF', aisle: 'CD' };
    return { rows, x, cols: [['A', -1.12], ['C', -0.6], ['D', 0.6], ['F', 1.12]], window: 'AF', aisle: 'CD' };
  }
  if (IS_DD && DD_ROWS[cls]) {
    const xs = DD_ROWS[cls], r0 = firstRow[cls];
    const rows = xs.map((_, i) => r0 + i);
    const x = (r) => xs[r - r0];
    // economy 3-4-3 (ten across), premium 2-4-2, business 1-2-1 with wide aisles
    if (cls === 'economy') return { rows, x, cols: [['A', -2.86], ['B', -2.37], ['C', -1.88], ['D', -0.735], ['E', -0.245], ['F', 0.245], ['G', 0.735], ['H', 1.88], ['J', 2.37], ['K', 2.86]], window: 'AK', aisle: 'CDGH' };
    if (cls === 'premium') return { rows, x, cols: [['A', -2.6], ['C', -2.05], ['D', -0.84], ['E', -0.28], ['F', 0.28], ['G', 0.84], ['H', 2.05], ['K', 2.6]], window: 'AK', aisle: 'CDGH' };
    return { rows, x, cols: [['A', -2.5], ['E', -0.62], ['F', 0.62], ['K', 2.5]], window: 'AK', aisle: 'EF' };
  }
  switch (cls) {
    case 'economy': return { rows: range(20, 36), x: (r) => -7.0 - (r - 20) * 0.81, cols: [['A', -2.34], ['B', -1.88], ['C', -1.42], ['D', -0.46], ['E', 0], ['F', 0.46], ['H', 1.42], ['J', 1.88], ['K', 2.34]], window: 'AK', aisle: 'CDFH' };
    case 'premium': return { rows: range(11, 16), x: (r) => 0.45 - (r - 11) * 0.97, cols: [['A', -2.3], ['C', -1.78], ['D', -0.78], ['E', -0.26], ['F', 0.26], ['G', 0.78], ['H', 1.78], ['K', 2.3]], window: 'AK', aisle: 'CDGH' };
    case 'business': return { rows: range(3, 7), x: (r) => 10.15 - (r - 3) * 1.68, cols: [['A', -2.02], ['E', -0.5], ['F', 0.5], ['K', 2.02]], window: 'AK', aisle: 'EF' };
    case 'first': return { rows: [1, 2], x: (r) => (r === 1 ? 16.4 : 13.8), cols: [['A', -1.92], ['E', 0], ['K', 1.92]], window: 'AK', aisle: 'E' };
    default: return null;
  }
}
function range(a, b) { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; }

function halfWidthAt(x, y = F) {
  const { r, c } = fusProfile(x);
  const ri = r - FUS.WALL;
  return Math.sqrt(Math.max(0, ri * ri - (y - c) ** 2));
}

// rounded-rectangle outline lying flat on the floor
function ringGeometry(w, d, t, r) {
  const s = new THREE.Shape();
  const hw = w / 2, hd = d / 2;
  r = Math.min(r, hw, hd);
  s.moveTo(-hw + r, -hd); s.lineTo(hw - r, -hd); s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r); s.quadraticCurveTo(hw, hd, hw - r, hd); s.lineTo(-hw + r, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - r); s.lineTo(-hw, -hd + r); s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  const iw = hw - t, id = hd - t, ir = Math.max(0.01, r - t);
  const h = new THREE.Path();
  h.moveTo(-iw + ir, -id); h.quadraticCurveTo(-iw, -id, -iw, -id + ir); h.lineTo(-iw, id - ir);
  h.quadraticCurveTo(-iw, id, -iw + ir, id); h.lineTo(iw - ir, id); h.quadraticCurveTo(iw, id, iw, id - ir);
  h.lineTo(iw, -id + ir); h.quadraticCurveTo(iw, -id, iw - ir, -id); h.lineTo(-iw + ir, -id);
  s.holes.push(h);
  const g = new THREE.ShapeGeometry(s, 8);
  g.rotateX(-Math.PI / 2);
  return g;
}

export function buildCabin({ glow = 3.2, lowPoly = false, fade = null } = {}) {
  // overhead furnishings belong to the closed cabin: they fade out with the roof for the cutaway
  const fadeRoof = (mesh, mat) => { if (fade) fade(mesh, mat); };
  SEG_MAX = lowPoly ? 1 : 2;
  const group = new THREE.Group();
  group.name = 'cabin';
  const seats = [];
  const byId = new Map();
  const classes = {};
  const pickables = {};
  const zoneMeshes = [];
  // the double-decker's upper deck is its own group, so it can be lifted away to show the main deck
  const upperGroup = new THREE.Group();
  upperGroup.name = 'upperDeck';
  group.add(upperGroup);
  const into = (cls) => (DECK_OF[cls] === 'upper' ? upperGroup : group);

  // ---------- seats ----------
  // (the double-decker has 400 Economy seats: they are built a little lighter)
  const designs = { economy: (() => { const k = SEG_MAX; if (IS_DD) SEG_MAX = 1; const d = economySeat(); SEG_MAX = k; return d; })(), premium: premiumSeat(), business: IS_NARROW ? premiumSeat() : businessPod() };
  // Safar cabin palette: navy and white seats, sky-blue headrest covers, navy gloss pods
  const palette = {
    economy: { fabric: '#46556f', shell: '#eef1f5', trim: '#262b33', accent: '#f4f7fa' },
    premium: { fabric: '#2f3e5e', shell: '#e9edf2', trim: '#22272e', accent: '#f1f6fb' },
    business: { fabric: '#eef2f6', shell: '#f1f4f8', trim: '#141b25', accent: '#8ccaf0' },
  };
  const dummy = new THREE.Object3D();
  // every screen shows the same Safar welcome page; the logo is drawn in once the artwork loads
  const screenTex = makeScreenTexture(null);
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x050a12, roughness: 0.12, metalness: 0, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 0.95 });
  const screenImg = new Image();
  screenImg.onload = () => {
    if (screenMat.userData.live) return;          // the live seat-screen pages have taken over
    const t = makeScreenTexture(screenImg);
    screenMat.emissiveMap = t; screenMat.needsUpdate = true;
    screenTex.dispose();
  };
  screenImg.src = 'assets/brand/safar-wordmark.png';

  // Safar-weave seat fabric and diamond-quilted leather (tinted per seat by the seat colour)
  // materials for the extra Business details (silver edges, minibar light, faceted console top)
  const deckTex = makeFacetPanelTexture({ size: 512, seed: 41, strength: 0.9, cols: 4, rows: 3 });
  const extraMats = {
    metal: new THREE.MeshStandardMaterial({ color: '#dfe5eb', metalness: 1, roughness: 0.22 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.86, 0.64).multiplyScalar(glow * 0.45) }),
    deck: new THREE.MeshPhysicalMaterial({ map: deckTex, roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.08 }),
  };
  const fabricTex = makeSeatFabricTexture();
  fabricTex.repeat.set(5, 5);
  const quiltTex = makeQuiltTexture();
  quiltTex.repeat.set(2.2, 2.2);
  for (const cls of ['economy', 'premium', 'business'].filter((k) => CLASS_ORDER.includes(k))) {
    F = floorOf(cls);
    const layout = rowsFor(cls);
    const d = designs[cls];
    const list = [];
    for (const r of layout.rows) for (const [L, z] of layout.cols) list.push({ row: r, letter: L, z });
    const n = list.length;
    const leather = cls === 'business';
    const fabricMat = new THREE.MeshPhysicalMaterial({
      map: leather ? quiltTex : fabricTex,
      color: 0xffffff, roughness: leather ? 0.5 : 0.9,
      sheen: leather ? 0.25 : 0.8, sheenRoughness: 0.55, sheenColor: new THREE.Color(leather ? '#ffffff' : '#c9def4'),
      clearcoat: leather ? 0.25 : 0, clearcoatRoughness: 0.4,
    });
    const shellMat = new THREE.MeshPhysicalMaterial({ color: palette[cls].shell, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.18 });
    const fabric = new THREE.InstancedMesh(d.fabric, fabricMat, n);
    const shell = new THREE.InstancedMesh(d.shell, shellMat, n);
    let trim = null, accent = null, screen = null;
    if (d.screen) screen = new THREE.InstancedMesh(d.screen, screenMat, n);
    if (d.trim) trim = new THREE.InstancedMesh(d.trim, new THREE.MeshStandardMaterial({ color: palette[cls].trim, roughness: 0.35, metalness: cls === 'business' ? 0.1 : 0.3 }), n);
    if (d.accent) accent = new THREE.InstancedMesh(d.accent, new THREE.MeshPhysicalMaterial({ color: palette[cls].accent, roughness: 0.85, sheen: 0.7, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffffff') }), n);
    const extras = [];
    for (const k of ['metal', 'glow', 'deck']) if (d[k]) extras.push(new THREE.InstancedMesh(d[k], extraMats[k], n));
    const base = new THREE.Color(palette[cls].fabric);
    const clsSeats = [];
    list.forEach((s, i) => {
      const x = layout.x(s.row);
      dummy.position.set(x, F, s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      fabric.setMatrixAt(i, dummy.matrix);
      shell.setMatrixAt(i, dummy.matrix);
      if (trim) trim.setMatrixAt(i, dummy.matrix);
      if (accent) accent.setMatrixAt(i, dummy.matrix);
      if (screen) screen.setMatrixAt(i, dummy.matrix);
      for (const m of extras) m.setMatrixAt(i, dummy.matrix);
      fabric.setColorAt(i, base);
      const id = `${s.row}${s.letter}`;
      const seat = {
        id, cls, row: s.row, letter: s.letter, index: i,
        pos: new THREE.Vector3(x, F, s.z),
        side: s.z < 0 ? -1 : 1,
        window: layout.window.includes(s.letter),
        aisle: layout.aisle.includes(s.letter),
        footprint: d.footprint,
        booked: false, yours: false,
      };
      clsSeats.push(seat); seats.push(seat); byId.set(id, seat);
    });
    for (const m of [fabric, shell, trim, accent, screen, ...extras]) {
      if (!m) continue;
      const lit = m !== screen && !m.material.isMeshBasicMaterial;
      m.castShadow = lit; m.receiveShadow = lit;
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      m.userData.cls = cls;
      into(cls).add(m);
    }
    fabric.instanceColor.needsUpdate = true;
    classes[cls] = { id: cls, seats: clsSeats, fabric, base, hl: 0, dirty: true };
    pickables[cls] = [fabric, shell].concat(trim ? [trim] : [], accent ? [accent] : [], screen ? [screen] : [], extras);
  }

  // ---------- First suites ----------
  if (CLASS_ORDER.includes('first')) {
    F = floorOf('first');
    const layout = rowsFor('first');
    const clsSeats = [];
    const wallBase = new THREE.Color('#ffffff');
    const leatherBase = new THREE.Color('#f1f4f8');
    const suitePanel = makeFacetPanelTexture({ size: 512, seed: 21, strength: 0.68, cols: 5, rows: 5 });
    const quiltTexF = makeQuiltTexture({ cells: 7 });
    quiltTexF.repeat.set(1.6, 1.6);
    const suiteMats = {
      quilt: new THREE.MeshPhysicalMaterial({ map: quiltTexF, color: '#ffffff', roughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color('#ffffff'), clearcoat: 0.15 }),
      door: new THREE.MeshPhysicalMaterial({ map: makeLouvreTexture(), roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15 }),
      lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.88, 0.68).multiplyScalar(glow * 0.6) }),
      curtain: new THREE.MeshPhysicalMaterial({ color: '#f4f6f8', roughness: 0.95, sheen: 0.8, sheenRoughness: 0.5, sheenColor: new THREE.Color('#dfeefa') }),
      metal: new THREE.MeshStandardMaterial({ color: '#dfe5eb', metalness: 1, roughness: 0.22 }),
    };
    const meshes = [];
    for (const r of layout.rows) {
      for (const [L, z] of layout.cols) {
        const door = L === 'A' ? 1 : L === 'K' ? -1 : -1;
        const s = firstSuite(door, L !== 'E');
        const wallMat = new THREE.MeshPhysicalMaterial({ map: suitePanel, color: wallBase, roughness: 0.32, clearcoat: 0.45, clearcoatRoughness: 0.2 });
        const leatherMat = new THREE.MeshPhysicalMaterial({ color: leatherBase, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.35, sheen: 0.3, sheenColor: new THREE.Color('#ffffff') });
        const trimMat = new THREE.MeshPhysicalMaterial({ color: '#1d2c47', roughness: 0.25, clearcoat: 0.9, clearcoatRoughness: 0.08 });
        const g = new THREE.Group();
        const mw = new THREE.Mesh(s.walls, wallMat);
        const ml = new THREE.Mesh(s.leather, leatherMat);
        const mt = new THREE.Mesh(s.trim, trimMat);
        for (const m of [mw, ml, mt]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
        const ms = new THREE.Mesh(s.screen, screenMat);
        g.add(ms);
        const extrasF = [];
        for (const [key, mat] of [['quilt', suiteMats.quilt], ['door', suiteMats.door], ['lamp', suiteMats.lamp], ['curtain', suiteMats.curtain], ['metal', suiteMats.metal]]) {
          if (!s[key]) continue;
          const m = new THREE.Mesh(s[key], mat);
          const lit = !mat.isMeshBasicMaterial;
          m.castShadow = lit && key !== 'lamp'; m.receiveShadow = lit;
          g.add(m); extrasF.push(m);
        }
        const x = layout.x(r);
        g.position.set(x, F, z);
        into('first').add(g);
        const id = `${r}${L}`;
        const seat = {
          id, cls: 'first', row: r, letter: L, index: clsSeats.length,
          pos: new THREE.Vector3(x, F, z), side: z < -0.1 ? -1 : z > 0.1 ? 1 : (door > 0 ? -1 : 1),
          window: L !== 'E', aisle: L === 'E', footprint: s.footprint, booked: false, yours: false,
          meshes: { walls: mw, leather: ml }, mats: { wall: wallMat, leather: leatherMat },
        };
        mw.userData.seat = seat; ml.userData.seat = seat; mt.userData.seat = seat; ms.userData.seat = seat;
        for (const m of extrasF) m.userData.seat = seat;
        meshes.push(mw, ml, mt, ms, ...extrasF);
        clsSeats.push(seat); seats.push(seat); byId.set(id, seat);
      }
    }
    classes.first = { id: 'first', seats: clsSeats, base: leatherBase, wallBase, hl: 0, dirty: true };
    pickables.first = meshes;
  }

  // ---------- The Residence ----------
  if (CLASS_ORDER.includes('residence')) {
    F = floorOf('residence');
    const z0 = ZONES.residence.x0, z1 = ZONES.residence.x1;
    const g = new THREE.Group();
    const resPanel = makeFacetPanelTexture({ size: 512, seed: 33, strength: 0.58, cols: 6, rows: 6 });
    const wood = new THREE.MeshPhysicalMaterial({ map: resPanel, color: '#ffffff', roughness: 0.34, clearcoat: 0.45, clearcoatRoughness: 0.2 });
    const cream = new THREE.MeshPhysicalMaterial({ color: '#eef2f6', roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#ffffff'), clearcoat: 0.2 });
    const linen = new THREE.MeshPhysicalMaterial({ color: '#f7f8fa', roughness: 0.92, sheen: 0.6, sheenColor: new THREE.Color('#dfeefa') });
    const darkWood = new THREE.MeshPhysicalMaterial({ color: '#1d2c47', roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.08 });
    const rug = new THREE.MeshStandardMaterial({ color: '#a9cdea', roughness: 1 });
    const stone = new THREE.MeshPhysicalMaterial({ color: '#f1f2f4', roughness: 0.18, clearcoat: 0.6 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#dfeef2', roughness: 0.05, transparent: true, opacity: 0.28, metalness: 0 });
    const hw = halfWidthAt((z0 + z1) / 2);
    const corridor = -1.72;          // corridor runs along the port side
    const H = 1.7;
    const walls = [], creamParts = [], linenParts = [], darkParts = [], rugParts = [], stoneParts = [];
    // outer partition along corridor with door gaps
    // door into each room from the corridor: living, bedroom, shower
    const doorGaps = [[24.4, 25.2], [20.62, 21.42], [19.5, 20.1]];
    let xs = z0;
    for (const [a, b] of doorGaps.slice().sort((p, q) => p[0] - q[0])) {
      if (a > xs) walls.push(part(a - xs, H, 0.07, (xs + a) / 2, H / 2, corridor, { round: 0.02 }));
      xs = b;
    }
    if (z1 > xs) walls.push(part(z1 - xs, H, 0.07, (xs + z1) / 2, H / 2, corridor, { round: 0.02 }));
    // front and rear walls + room dividers
    const roomW = hw - corridor;
    const zc = (corridor + hw) / 2;
    for (const x of [z0 + 0.04, 23.0, 20.4, z1 - 0.04]) walls.push(part(0.07, H, roomW, x, H / 2, zc, { round: 0.02 }));
    // living room (23.0 .. 26.0)
    rugParts.push(part(2.4, 0.015, 2.8, 24.5, 0.01, zc + 0.1, { round: 0 }));
    creamParts.push(part(2.3, 0.42, 0.75, 24.55, 0.21, hw - 0.5, { round: 0.06 }));       // sofa base (long)
    creamParts.push(part(2.3, 0.5, 0.2, 24.55, 0.62, hw - 0.18, { round: 0.06 }));        // sofa back
    creamParts.push(part(0.75, 0.42, 1.6, 25.55, 0.21, hw - 1.55, { round: 0.06 }));      // sofa L part
    creamParts.push(part(0.2, 0.5, 1.6, 25.88, 0.62, hw - 1.55, { round: 0.06 }));
    creamParts.push(part(0.8, 0.42, 0.8, 23.6, 0.21, corridor + 0.75, { round: 0.08 }));  // armchair
    creamParts.push(part(0.18, 0.46, 0.8, 23.3, 0.6, corridor + 0.75, { round: 0.06 }));
    for (const cx of [24.0, 24.55, 25.1]) linenParts.push(part(0.42, 0.34, 0.14, cx, 0.62, hw - 0.36, { round: 0.06 }));
    darkParts.push(part(0.95, 0.36, 0.95, 24.35, 0.18, zc + 0.2, { round: 0.03 }));       // coffee table
    darkParts.push(part(0.04, 0.6, 1.1, 23.06, 1.05, zc + 0.1, { round: 0.01, seg: 1 })); // tv
    // bedroom (20.4 .. 23.0) — bed head against the starboard wall
    const bedX = 21.7, bedZ = hw - 1.12;
    creamParts.push(part(1.72, 0.32, 2.1, bedX, 0.16, bedZ, { round: 0.05 }));             // frame
    linenParts.push(part(1.62, 0.22, 2.0, bedX, 0.42, bedZ - 0.02, { round: 0.08 }));       // mattress
    linenParts.push(part(1.66, 0.08, 1.35, bedX, 0.55, bedZ - 0.36, { round: 0.04 }));      // duvet fold
    for (const px of [bedX - 0.42, bedX + 0.42]) linenParts.push(part(0.6, 0.14, 0.34, px, 0.6, hw - 0.36, { round: 0.07 }));
    creamParts.push(part(1.85, 0.9, 0.12, bedX, 0.75, hw - 0.1, { round: 0.05 }));          // headboard
    for (const px of [bedX - 1.03, bedX + 1.03]) darkParts.push(part(0.34, 0.48, 0.38, px, 0.24, hw - 0.3, { round: 0.03 }));  // bedside tables
    darkParts.push(part(1.2, 1.6, 0.55, 22.3, 0.8, corridor + 0.34, { round: 0.02 }));     // wardrobe (forward of the door)
    rugParts.push(part(2.4, 0.012, 1.0, 21.7, 0.008, corridor + 1.1, { round: 0 }));
    // shower room (19.0 .. 20.4): vanity on the aft wall, WC beside it, glass shower by the windows
    stoneParts.push(part(1.3, 0.06, 1.3, 19.7, 0.03, hw - 0.75, { round: 0.02 }));          // tray
    stoneParts.push(part(0.55, 0.85, 1.1, 19.34, 0.43, -0.3, { round: 0.03 }));             // vanity
    darkParts.push(part(0.56, 0.03, 1.12, 19.34, 0.865, -0.3, { round: 0.01, seg: 1 }));   // vanity top
    stoneParts.push(part(0.55, 0.42, 0.45, 19.33, 0.21, 0.62, { round: 0.12 }));            // wc
    darkParts.push(part(0.3, 0.02, 0.3, 19.7, 1.2, hw - 0.75, { round: 0 }));               // rain head
    // satin mirror: a sharp mirror would reflect the open sky (the reflection map is the sky
    // outside, not the room), so it is softened into a bright sheen
    const mirror = new THREE.Mesh(part(0.012, 0.6, 0.95, 19.092, 1.28, -0.3, { round: 0 }),
      new THREE.MeshStandardMaterial({ color: '#e3e9ee', roughness: 0.32, metalness: 0.85, envMapIntensity: 0.4 }));
    // the living-room TV shows the same Safar welcome page as the seat screens
    const tvScreen = new THREE.Mesh(part(0.006, 0.54, 1.02, 23.083, 1.05, zc + 0.1, { round: 0 }), screenMat);
    const glassPanel = new THREE.Mesh(part(0.02, 1.5, 1.2, 20.32, 0.75, hw - 0.75, { round: 0 }), glass);
    const glassPanel2 = new THREE.Mesh(part(1.25, 1.5, 0.02, 19.7, 0.75, hw - 1.42, { round: 0 }), glass);

    const mk = (parts, mat) => { const m = new THREE.Mesh(merge(parts), mat); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const mWalls = mk(walls, wood);
    const mCream = mk(creamParts, cream);
    const mLinen = mk(linenParts, linen);
    const mDark = mk(darkParts, darkWood);
    const mRug = mk(rugParts, rug); mRug.castShadow = false;
    const mStone = mk(stoneParts, stone);
    g.add(glassPanel, glassPanel2, mirror, tvScreen);
    g.position.y = F;
    into('residence').add(g);
    const seat = {
      id: 'RES', cls: 'residence', row: 0, letter: '', index: 0,
      pos: new THREE.Vector3(24.5, F, zc), side: 1, window: true, aisle: false,
      footprint: [z1 - z0 - 0.2, roomW], booked: false, yours: false,
      meshes: { walls: mWalls, cream: mCream, linen: mLinen },
      mats: { wall: wood, cream, linen },
      // where you stand in each room, what you look at first, and the room's door off the corridor
      rooms: {
        living: { eye: new THREE.Vector3(25.5, F + 1.55, -1.18), look: new THREE.Vector3(23.6, F + 0.85, 1.75), door: 24.8 },
        bedroom: { eye: new THREE.Vector3(20.95, F + 1.55, -1.12), look: new THREE.Vector3(22.0, F + 0.6, 1.75), door: 21.02 },
        shower: { eye: new THREE.Vector3(20.08, F + 1.55, -1.2), look: new THREE.Vector3(19.5, F + 0.95, 1.6), door: 19.8 },
      },
      corridorZ: -2.12,
      doorZ: corridor,
      ringCentre: new THREE.Vector3((z0 + z1) / 2, F, zc),
    };
    for (const m of [mWalls, mCream, mLinen, mDark, mStone, mRug]) m.userData.seat = seat;
    seats.push(seat); byId.set('RES', seat);
    classes.residence = { id: 'residence', seats: [seat], base: new THREE.Color('#eef2f6'), wallBase: new THREE.Color('#ffffff'), hl: 0, dirty: true };
    pickables.residence = [mWalls, mCream, mLinen, mDark, mStone, mRug];
  }

  // ---------- galleys, lavatories and bulkheads (Safar faceted panels + logo) ----------
  const blockLogoMats = [];
  {
    const panel = makeFacetPanelTexture({ size: 512, seed: 13, strength: 1.0, cols: 5, rows: 5 });
    const sideMat = new THREE.MeshPhysicalMaterial({ map: panel, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    const topMat = new THREE.MeshStandardMaterial({ color: '#f4f6f9', roughness: 0.6 });
    const steel = new THREE.MeshStandardMaterial({ color: '#c3c8cf', roughness: 0.3, metalness: 0.7 });
    F = FUS.FLOOR_Y;
    const blocks = IS_DD || IS_NARROW ? [] : [
      // [x0, x1, zFrom, zTo]
      [26.05, 27.5, -2.3, -0.5], [26.05, 27.5, 0.5, 2.3],
      [17.85, 18.95, -2.35, -0.55], [17.85, 18.95, 0.6, 2.35],
      [11.05, 12.3, -2.35, -0.6], [11.05, 12.3, 0.6, 2.35],
      [1.1, 2.5, -2.3, -1.1], [1.1, 2.5, 1.1, 2.3],
      [-6.5, -5.3, -2.3, -0.6], [-6.5, -5.3, 0.6, 2.3],
      [-22.3, -20.9, -1.9, -0.45], [-22.3, -20.9, 0.45, 1.9],
    ];
    const steelParts = [];
    for (const [a, b, z0, z1] of blocks) {
      const hwA = halfWidthAt((a + b) / 2, F + 1.0) - 0.08;
      const za = Math.max(z0, -hwA), zb = Math.min(z1, hwA);
      const logoMat = sideMat.clone();
      blockLogoMats.push(logoMat);
      // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z. The -X face looks aft at the passengers.
      const m = new THREE.Mesh(new THREE.BoxGeometry(b - a, 1.72, zb - za), [sideMat, logoMat, topMat, topMat, sideMat, sideMat]);
      m.position.set((a + b) / 2, F + 0.86, (za + zb) / 2);
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
      steelParts.push(part(0.02, 1.2, (zb - za) * 0.7, b + 0.005, F + 0.85, (za + zb) / 2, { round: 0 }));
    }
    if (steelParts.length) {
      const m2 = new THREE.Mesh(merge(steelParts), steel);
      m2.castShadow = true; m2.receiveShadow = true; group.add(m2);
    }
  }

  // ---------- aisle runners with SAFAR inlays, LED path lights ----------
  const runnerMats = [];
  {
    const aisles = IS_NARROW ? [
      [-12.3, 9.1, 0, 0.46], [10.4, 13.9, 0, 0.5],
    ] : IS_DD ? [
      // [x0, x1, z, width, deck]
      [-21.3, 14.7, -1.31, 0.5, 'main'], [-21.3, 14.7, 1.31, 0.5, 'main'],
      [18.4, 27.0, -1.445, 0.5, 'main'], [18.4, 27.0, 1.445, 0.5, 'main'],
      [-12.4, 10.95, -1.56, 0.56, 'upper'], [-12.4, 10.95, 1.56, 0.56, 'upper'],
      [12.45, 17.75, -0.96, 0.6, 'upper'], [12.45, 17.75, 0.96, 0.6, 'upper'],
      [19.05, 25.95, -2.13, 0.7, 'upper'],
    ] : [
      // [x0, x1, z, width]
      [-20.8, -6.7, -0.94, 0.44], [-20.8, -6.7, 0.94, 0.44],
      [-5.1, 0.95, -1.28, 0.44], [-5.1, 0.95, 1.28, 0.44],
      [2.7, 10.95, -1.26, 0.5], [2.7, 10.95, 1.26, 0.5],
      [12.45, 17.75, -0.96, 0.6], [12.45, 17.75, 0.96, 0.6],
      [19.05, 25.95, -2.13, 0.7],
    ];
    const runnerTex = makeRunnerTexture(null);
    const led = [], ledUp = [];
    for (const [x0, x1, z, w, deck = 'main'] of aisles) {
      F = deck === 'upper' ? FUS.UPPER_Y : FUS.FLOOR_Y;
      const len = x1 - x0;
      const tex = runnerTex.clone();
      tex.repeat.set(len / 8, 1);
      tex.needsUpdate = true;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
      runnerMats.push({ mat, len });
      const g = new THREE.PlaneGeometry(len, w);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat);
      m.position.set((x0 + x1) / 2, F + 0.004, z);
      m.receiveShadow = true;
      (deck === 'upper' ? upperGroup : group).add(m);
      for (const e of [-1, 1]) (deck === 'upper' ? ledUp : led).push(part(len, 0.008, 0.016, (x0 + x1) / 2, 0.006, z + e * (w / 2 - 0.012), { round: 0 }));
    }
    F = FUS.FLOOR_Y;
    const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.14, 0.62, 1.0).multiplyScalar(glow * 0.5) });
    const ledMesh = new THREE.Mesh(merge(led), ledMat);
    ledMesh.position.y = FUS.FLOOR_Y;
    group.add(ledMesh);
    if (ledUp.length) { const lu = new THREE.Mesh(merge(ledUp), ledMat); lu.position.y = FUS.UPPER_Y; upperGroup.add(lu); }
    // swap in the logo versions once the wordmark has loaded
    const im = new Image();
    im.onload = () => {
      const withLogo = makeRunnerTexture(im);
      for (const r of runnerMats) {
        const t = withLogo.clone();
        t.repeat.set(r.len / 8, 1);
        t.needsUpdate = true;
        r.mat.map = t; r.mat.needsUpdate = true;
      }
      const bulk = makeBulkheadLogoTexture(im, { size: 1024 });
      for (const mm of blockLogoMats) { mm.map = bulk; mm.needsUpdate = true; }
    };
    im.src = 'assets/brand/safar-wordmark.png';
  }

  // ---------- overhead: centre bins, reading-light panels and row numbers ----------
  // (twin only: the double-decker's bins are part of its airframe)
  if (!IS_DD && !IS_NARROW)
  // A real widebody has a row of bins over the middle seats too, and under every bin a panel
  // per seat row with reading lights, air nozzles and the seat-belt sign; the row number and
  // seat letters are printed on the bin edge above each row.
  {
    const RI = FUS.R - FUS.WALL;
    const onWall = (y) => Math.sqrt(RI * RI - y * y) - 0.004;
    const binMat = new THREE.MeshStandardMaterial({ color: 0xf5f7f9, roughness: 0.42 });
    const psu = makePsuTexture();
    const psuMats = [];
    const newPsuMat = (pitch) => {
      const map = psu.map.clone(), em = psu.emissive.clone();
      for (const t of [map, em]) { t.repeat.set(1 / pitch, 1); t.needsUpdate = true; }
      const m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2 });
      psuMats.push(m);
      return m;
    };
    // a flat strip along x between z0..z1 at heights y0..y1 (facing down), u = x so the texture
    // repeats once per seat row
    const strip = (x0, x1, z0, y0, z1, y1, phase) => {
      const g = new THREE.BufferGeometry();
      const p = [x0, y0, z0, x1, y0, z0, x0, y1, z1, x1, y1, z1];
      const uv = [x0 - phase, 0, x1 - phase, 0, x0 - phase, 1, x1 - phase, 1];
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(z1 > z0 ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3]);
      g.computeVertexNormals();
      return g;
    };
    const centreBins = [];
    const zones = [
      { cls: 'economy', x0: -20.6, x1: -6.75, w: 0.7, letters: ['ABC', 'HJK'] },
      { cls: 'premium', x0: -5.1, x1: 0.9, w: 0.95, letters: ['AC', 'HK'] },
      { cls: 'business', x0: 2.65, x1: 10.95, w: 0, letters: ['A', 'K'] },
    ];
    for (const zn of zones) {
      const lay = rowsFor(zn.cls);
      const pitch = Math.abs(lay.x(lay.rows[1]) - lay.x(lay.rows[0]));
      const phase = lay.x(lay.rows[0]) + 0.08 - pitch / 2;          // one panel centred over each row
      const mat = newPsuMat(pitch);
      const geos = [];
      // under the side bins (the sloped underside next to the aisle)
      const yAt = (z) => 0.5 + (2.2 - z) * (0.035 / 0.38) - 0.005;
      for (const k of [-1, 1]) geos.push(strip(zn.x0, zn.x1, k * 1.86, yAt(1.86), k * 2.16, yAt(2.16), phase));
      // centre bins with their own panels underneath
      if (zn.w > 0) {
        const w = zn.w;
        const sh = new THREE.Shape();
        const prof = [[-w - 0.1, 1.4], [-w - 0.12, 1.3], [-w - 0.09, 1.06], [-w - 0.03, 0.82], [-w + 0.03, 0.68], [-w + 0.12, 0.615],
          [w - 0.12, 0.615], [w - 0.03, 0.68], [w + 0.03, 0.82], [w + 0.09, 1.06], [w + 0.12, 1.3], [w + 0.1, 1.4]];
        prof.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y)));
        sh.closePath();
        const n = Math.max(1, Math.round((zn.x1 - zn.x0) / 1.6));
        const len = (zn.x1 - zn.x0) / n;
        for (let i = 0; i < n; i++) {
          const g = new THREE.ExtrudeGeometry(sh, { depth: len - 0.022, bevelEnabled: false, curveSegments: 2 });
          g.rotateY(-Math.PI / 2);
          g.translate(zn.x0 + (i + 1) * len - 0.011, 0, 0);
          centreBins.push(g.toNonIndexed());
        }
        for (const k of [-1, 1]) geos.push(strip(zn.x0, zn.x1, k * (w - 0.36), 0.611, k * (w - 0.1), 0.611, phase));
      }
      const pm = new THREE.Mesh(mergeGeometries(geos, false), mat);
      pm.name = 'psu';
      group.add(pm);
      fadeRoof(pm, mat);
      // row numbers on the aisle edge of the side bins
      for (const [si, k] of [[0, -1], [1, 1]]) {
        const rows = lay.rows.map((r) => ({ x: lay.x(r), label: `${r}  ${zn.letters[si].split('').join(' ')}` }));
        // text reads left to right for someone in the aisle looking up at this side
        const tex = makeRowLabelTexture(rows, zn.x0, zn.x1, { flip: k > 0 });
        const lm = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
        const g = new THREE.BufferGeometry();
        const z = k * 1.639, ya = 0.775, yb = 0.875;
        g.setAttribute('position', new THREE.Float32BufferAttribute([zn.x0, ya, z, zn.x1, ya, z, zn.x0, yb, z, zn.x1, yb, z], 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(k > 0 ? [1, 0, 0, 0, 1, 1, 0, 1] : [0, 0, 1, 0, 0, 1, 1, 1], 2));
        g.setIndex(k > 0 ? [0, 2, 1, 1, 2, 3] : [0, 1, 2, 1, 3, 2]);
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, lm);
        m.name = 'rowLabels';
        group.add(m);
        fadeRoof(m, lm);
      }
    }
    const cb = new THREE.Mesh(mergeGeometries(centreBins, false), binMat);
    cb.geometry.computeVertexNormals();
    cb.name = 'centreBins';
    cb.receiveShadow = true;
    group.add(cb);
    fadeRoof(cb, binMat);
  }

  // ---------- soft contact shadows under every seat, pod, suite and room ----------
  {
    const blobTex = makeBlobTexture(128);
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
    blobMat.polygonOffset = true; blobMat.polygonOffsetFactor = -1;
    const blobGeo = new THREE.PlaneGeometry(1, 1);
    blobGeo.rotateX(-Math.PI / 2);
    for (const deck of IS_DD ? ['main', 'upper'] : ['main']) {
      const list = seats.filter((s) => s.cls !== 'residence' && DECK_OF[s.cls] === deck);
      if (!list.length) continue;
      const blobs = new THREE.InstancedMesh(blobGeo, blobMat, list.length);
      const o = new THREE.Object3D();
      list.forEach((s, i) => {
        const [fx, fz] = s.footprint;
        o.position.set(s.pos.x - (s.cls === 'economy' || s.cls === 'premium' ? 0.06 : 0), s.pos.y + 0.006, s.pos.z);
        o.scale.set(fx * 1.25, 1, fz * 1.3);
        o.updateMatrix();
        blobs.setMatrixAt(i, o.matrix);
      });
      blobs.instanceMatrix.needsUpdate = true;
      blobs.renderOrder = 1;
      (deck === 'upper' ? upperGroup : group).add(blobs);
    }
  }

  // ---------- lavatories and galleys ----------
  // Where a long-haul twin has them: a galley and lavatories at the back, lavatories between the
  // cabins, a galley at the mid doors and at the front by the flight deck. They are open at the
  // top like the rest of the cutaway, so from the cabin map you look into them: toilet, basin,
  // galley counters, ovens and the meal trolleys, each marked with a small sign.
  {
    const mats = {
      wall: new THREE.MeshStandardMaterial({ color: 0xf1f4f7, roughness: 0.55 }),
      door: new THREE.MeshStandardMaterial({ color: 0xd6dde5, roughness: 0.5 }),
      china: new THREE.MeshPhysicalMaterial({ color: 0xfcfdfe, roughness: 0.16, clearcoat: 0.7, clearcoatRoughness: 0.1 }),
      steel: new THREE.MeshStandardMaterial({ color: 0xc8ced5, metalness: 0.85, roughness: 0.28 }),
      counter: new THREE.MeshStandardMaterial({ color: 0x7f8a97, roughness: 0.42 }),
      trolley: new THREE.MeshStandardMaterial({ color: 0xb6bfc9, metalness: 0.55, roughness: 0.32 }),
      floor: new THREE.MeshStandardMaterial({ color: 0xc9d1da, roughness: 0.8 }),
    };
    let G = Object.fromEntries(Object.keys(mats).map((k) => [k, []]));
    const H = 1.88, T = 0.045;
    let signs = [];
    // a lavatory filling [x0,x1] x [z0,z1]; the door is on the x face given by doorAt (x0 or x1)
    const lav = (x0, x1, z0, z1, doorAt) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
      G.floor.push(part(w - 0.02, 0.012, d - 0.02, cx, F + 0.006, cz, { round: 0 }));
      G.wall.push(part(T, H, d, x0 + T / 2, F + H / 2, cz, { round: 0.01 }), part(T, H, d, x1 - T / 2, F + H / 2, cz, { round: 0.01 }));
      G.wall.push(part(w, H, T, cx, F + H / 2, z0 + T / 2, { round: 0.01 }), part(w, H, T, cx, F + H / 2, z1 - T / 2, { round: 0.01 }));
      // the door: a recessed panel with its handle on the side facing the cabin
      const dx = doorAt === x0 ? x0 - 0.004 : x1 + 0.004, dirX = doorAt === x0 ? -1 : 1;
      const dw = Math.min(0.66, d - 0.16);
      G.door.push(part(0.03, 1.78, dw, dx, F + 0.92, cz, { round: 0.012 }));
      G.steel.push(part(0.03, 0.03, 0.14, dx + dirX * 0.02, F + 1.0, cz + dw * 0.32, { round: 0.01 }));
      // toilet at the far end, basin on the side
      const bx = doorAt === x0 ? x1 - 0.32 : x0 + 0.32;
      G.china.push(part(0.44, 0.4, 0.38, bx, F + 0.2, cz - d * 0.12, { round: 0.12, seg: 3 }));
      G.china.push(part(0.14, 0.52, 0.42, bx + (doorAt === x0 ? 0.2 : -0.2), F + 0.42, cz - d * 0.12, { round: 0.04 }));
      G.counter.push(part(Math.min(0.5, w * 0.45), 0.07, 0.4, cx, F + 0.84, z1 - 0.24 - T, { round: 0.02 }));
      G.china.push(part(0.3, 0.06, 0.24, cx, F + 0.885, z1 - 0.24 - T, { round: 0.03 }));
      G.steel.push(part(Math.min(0.5, w * 0.45), 0.5, 0.02, cx, F + 1.3, z1 - T - 0.012, { round: 0 }));   // mirror
      signs.push([cx, cz, 'wc']);
    };
    // a galley: counters and meal trolleys along the wall at x = backAt, the crew working space in front
    const galley = (x0, x1, z0, z1, backAt) => {
      const cz = (z0 + z1) / 2, d = z1 - z0, dirX = backAt === x0 ? 1 : -1;
      const depth = Math.min(0.78, (x1 - x0) * 0.6);
      const fx = backAt + dirX * depth;                               // front face of the counters
      G.counter.push(part(depth, 1.0, d, backAt + dirX * depth / 2, F + 0.5, cz, { round: 0.02 }));
      G.steel.push(part(depth + 0.02, 0.04, d + 0.02, backAt + dirX * depth / 2, F + 1.02, cz, { round: 0.01 }));
      const nT = Math.max(2, Math.floor(d / 0.34));
      for (let i = 0; i < nT; i++) {
        const z = z0 + (i + 0.5) * (d / nT);
        G.trolley.push(part(0.04, 0.84, d / nT - 0.04, fx + dirX * 0.02, F + 0.46, z, { round: 0.01 }));
      }
      // ovens and stowage above
      const ud = 0.42;
      G.counter.push(part(ud, H - 1.24, d, backAt + dirX * ud / 2, F + 1.24 + (H - 1.24) / 2, cz, { round: 0.02 }));
      const nO = Math.max(2, Math.floor(d / 0.42));
      for (let i = 0; i < nO; i++) for (let j = 0; j < 2; j++) {
        const z = z0 + (i + 0.5) * (d / nO);
        G.steel.push(part(0.02, 0.26, d / nO - 0.06, backAt + dirX * (ud + 0.01), F + 1.36 + j * 0.3, z, { round: 0.008 }));
      }
      G.wall.push(part(Math.abs(fx - backAt) + 0.4, H, T, (backAt + fx) / 2 + dirX * 0.2, F + H / 2, z0 + T / 2, { round: 0.01 }));
      G.wall.push(part(Math.abs(fx - backAt) + 0.4, H, T, (backAt + fx) / 2 + dirX * 0.2, F + H / 2, z1 - T / 2, { round: 0.01 }));
      signs.push([(backAt + fx) / 2 + dirX * 0.25, cz, 'galley']);
    };
    const hw = (x) => halfWidthAt(x, F + 0.9) - 0.12;
    // lounge bar (double-decker, at the back of the upper deck): a lit bar counter with shelves
    // behind it and curved sofas along both sides
    const lounge = (x0, x1) => {
      const cx = (x0 + x1) / 2;
      G.counter.push(part(2.6, 1.04, 0.62, cx, F + 0.52, 0, { round: 0.08, seg: 3 }));
      G.steel.push(part(2.7, 0.05, 0.72, cx, F + 1.07, 0, { round: 0.02 }));
      G.wall.push(part(0.3, 1.5, 1.6, x0 + 0.3, F + 0.75, 0, { round: 0.04 }));
      G.steel.push(part(0.04, 0.03, 1.4, x0 + 0.47, F + 1.1, 0, { round: 0.01 }), part(0.04, 0.03, 1.4, x0 + 0.47, F + 1.4, 0, { round: 0.01 }));
      for (const k of [-1, 1]) {
        const z = k * (hw(cx) - 0.55);
        G.trolley.push(part(x1 - x0 - 1.6, 0.42, 0.62, cx + 0.3, F + 0.21, z, { round: 0.1, seg: 3 }));
        G.trolley.push(part(x1 - x0 - 1.6, 0.6, 0.16, cx + 0.3, F + 0.62, z + k * 0.26, { round: 0.07, seg: 3 }));
      }
      signs.push([cx + 1.6, 0, 'galley']);
    };
    const groups = [];
    const flush = (target) => {
      for (const [k, list] of Object.entries(G)) {
        if (!list.length) continue;
        const m = new THREE.Mesh(merge(list), mats[k]);
        m.castShadow = k !== 'floor'; m.receiveShadow = true;
        m.name = `service-${k}`;
        target.add(m);
      }

      G = Object.fromEntries(Object.keys(mats).map((k) => [k, []]));
    };
    if (IS_NARROW) {
      // galley and a lavatory at the front by the flight deck, galley and two lavatories at the back
      F = FUS.FLOOR_Y;
      galley(14.3, 15.45, 0.05, 1.45, 15.45);
      lav(14.3, 15.45, -1.45, -0.1, 14.3);
      galley(-13.55, -12.7, -1.15, 1.15, -13.55);
      lav(-13.55, -12.7, 1.22, Math.min(1.75, hw(-13.1)), -12.7);
      lav(-13.55, -12.7, -Math.min(1.75, hw(-13.1)), -1.22, -12.7);
      flush(group);
      groups.push([signs, FUS.FLOOR_Y, group]);
    } else if (IS_DD) {
      // main deck: galley at the front, lavatories by door 2, galley and lavatories behind the last row
      F = FUS.FLOOR_Y;
      galley(27.75, 29.4, -1.25, 1.25, 29.4);
      lav(16.6, 17.95, -1.0, 0.0, 17.95);
      lav(16.6, 17.95, 0.0, 1.0, 16.6);
      galley(-24.1, -23.05, -1.3, 1.3, -24.1);
      lav(-24.1, -23.05, 1.4, Math.min(2.5, hw(-23.6)), -23.05);
      lav(-24.1, -23.05, -Math.min(2.5, hw(-23.6)), -1.4, -23.05);
      flush(group);
      const mainSigns = signs; signs = [];
      // upper deck: galley and lavatory at the front, lavatories between the suites and the
      // cabins, and the lounge bar with a galley at the back
      F = FUS.UPPER_Y;
      galley(26.05, 27.75, -0.2, 1.7, 27.75);
      lav(26.05, 27.75, -1.7, -0.3, 26.05);
      lav(17.85, 18.95, -0.6, 0.6, 17.85);
      lav(11.05, 12.35, -0.95, 0.0, 11.05);
      lav(11.05, 12.35, 0.0, 0.95, 12.35);
      lounge(-18.3, -13.2);
      galley(-20.5, -19.55, -1.3, 1.3, -20.5);
      flush(upperGroup);
      groups.push([mainSigns, FUS.FLOOR_Y, group], [signs, FUS.UPPER_Y, upperGroup]);
    } else {
      // aft: galley across the middle, a lavatory each side
      galley(-22.35, -20.85, -1.15, 1.15, -22.35);
      lav(-22.35, -21.05, 1.25, Math.min(2.25, hw(-21.7)), -21.05);
      lav(-22.35, -21.05, -Math.min(2.25, hw(-21.7)), -1.25, -21.05);
      // between Economy and Premium: two lavatories back to back
      lav(-6.55, -5.25, -1.0, 0.0, -6.55);
      lav(-6.55, -5.25, 0.0, 1.0, -5.25);
      // mid doors: galley in the middle
      galley(1.05, 2.55, -1.1, 1.1, 1.05);
      // between Business and First: lavatories
      lav(11.05, 12.35, -0.95, 0.0, 11.05);
      lav(11.05, 12.35, 0.0, 0.95, 12.35);
      // between First and The Residence: one lavatory
      lav(17.85, 18.95, -0.6, 0.6, 17.85);
      // front: galley by the flight deck and a lavatory on the left
      galley(26.05, 27.55, -0.2, 1.6, 27.55);
      lav(26.05, 27.55, -1.6, -0.3, 26.05);

      flush(group);
      groups.push([signs, FUS.FLOOR_Y, group]);
    }
    // signs on top, seen from the cabin map
    const icon = (kind) => {
      const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d');
      g.fillStyle = 'rgba(14,30,48,0.88)'; g.beginPath(); g.roundRect(6, 6, S - 12, S - 12, 26); g.fill();
      g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.lineCap = 'round';
      if (kind === 'wc') {
        for (const [x, skirt] of [[44, false], [84, true]]) {
          g.beginPath(); g.arc(x, 36, 9, 0, 6.3); g.fill();
          if (skirt) { g.beginPath(); g.moveTo(x, 50); g.lineTo(x - 15, 82); g.lineTo(x + 15, 82); g.closePath(); g.fill(); g.fillRect(x - 7, 80, 5, 18); g.fillRect(x + 2, 80, 5, 18); }
          else { g.fillRect(x - 11, 50, 22, 30); g.fillRect(x - 10, 78, 8, 22); g.fillRect(x + 2, 78, 8, 22); }
        }
        g.fillRect(63, 30, 2, 70);
      } else {
        g.beginPath(); g.moveTo(36, 46); g.lineTo(84, 46); g.lineTo(78, 92); g.lineTo(42, 92); g.closePath(); g.fill();
        g.beginPath(); g.arc(88, 62, 11, -1.4, 1.4); g.stroke();
        for (const x of [50, 60, 70]) { g.beginPath(); g.moveTo(x, 36); g.quadraticCurveTo(x + 5, 28, x, 20); g.stroke(); }
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      return t;
    };
    const iconMats = { wc: new THREE.MeshBasicMaterial({ map: icon('wc'), transparent: true, depthWrite: false }), galley: new THREE.MeshBasicMaterial({ map: icon('galley'), transparent: true, depthWrite: false }) };
    const sg = new THREE.PlaneGeometry(0.42, 0.42);
    sg.rotateX(-Math.PI / 2);
    for (const [list, floorY, target] of groups) for (const [x, z, kind] of list) {
      const m = new THREE.Mesh(sg, iconMats[kind]);
      m.position.set(x, floorY + H + 0.03, z);
      m.renderOrder = 3;
      m.name = `sign-${kind}`;
      target.add(m);
    }
  }

  // ---------- invisible zones for class picking ----------
  for (const cls of CLASS_ORDER) {
    const z = ZONES[cls];
    const cx = (z.x0 + z.x1) / 2;
    const hw = halfWidthAt(cx);
    const box = new THREE.Mesh(new THREE.BoxGeometry(z.x1 - z.x0, 2.2, hw * 2), new THREE.MeshBasicMaterial());
    box.position.set(cx, floorOf(cls) + 1.0, 0);
    box.visible = false;
    box.userData.cls = cls;
    box.userData.deck = DECK_OF[cls];
    group.add(box);
    zoneMeshes.push(box);
    classes[cls].zone = { ...z, cx, hw, deck: DECK_OF[cls], centre: new THREE.Vector3(cx, floorOf(cls), 0) };
  }

  // ---------- availability (deterministic) ----------
  for (const cls of ['economy', 'premium', 'business', 'first'].filter((k) => CLASS_ORDER.includes(k))) {
    const c = classes[cls];
    const conf = CONFIG.classes[cls];
    const rng = mulberry32(hashStr(cls) ^ 0x9e3779b9);
    const featured = byId.get(conf.featured);
    const pool = c.seats.filter((s) => s !== featured);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    // `available` is set for the twin's cabin; a bigger cabin keeps the same share of free seats
    const twinSeats = { economy: 153, premium: 48, business: 20, first: 6 }[cls];   // the twin's cabins
    const avail = IS_DD || IS_NARROW ? Math.round((conf.available / twinSeats) * c.seats.length) : conf.available;
    const free = Math.max(0, Math.min(c.seats.length, avail) - (featured ? 1 : 0));
    pool.forEach((s, i) => { s.booked = i >= free; });
    if (featured) featured.booked = false;
  }

  // ---------- glow outlines ----------
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.62, 0.86).multiplyScalar(glow * 1.3), transparent: true, opacity: 0, depthWrite: false, toneMapped: true });
  glowMat.polygonOffset = true; glowMat.polygonOffsetFactor = -2;
  const classRing = new THREE.Mesh(new THREE.BufferGeometry(), glowMat);
  classRing.renderOrder = 4;
  classRing.position.y = F + 0.02;
  group.add(classRing);
  const seatGlowMat = glowMat.clone();
  seatGlowMat.color = new THREE.Color(0.16, 0.72, 1.0).multiplyScalar(glow * 1.45);
  const seatRing = new THREE.Mesh(new THREE.BufferGeometry(), seatGlowMat);
  seatRing.renderOrder = 4;
  group.add(seatRing);
  const ringCache = new Map();
  const ringGeo = (w, d, t, r) => {
    const k = `${w.toFixed(2)}|${d.toFixed(2)}|${t}`;
    if (!ringCache.has(k)) ringCache.set(k, ringGeometry(w, d, t, r));
    return ringCache.get(k);
  };

  let hoverSeat = null;
  const tmpC = new THREE.Color();
  const bookedC = new THREE.Color();

  // seats picked together for a group of travellers
  let groupSet = new Set();
  // the seats in a row, split into blocks by the aisles
  const rowBlocks = (cls, row) => {
    const arr = classes[cls].seats.filter((q) => q.row === row).sort((a, b) => a.pos.z - b.pos.z);
    const blocks = [];
    let cur = [];
    for (const q of arr) { if (cur.length && q.pos.z - cur[cur.length - 1].pos.z > 0.75) { blocks.push(cur); cur = []; } cur.push(q); }
    if (cur.length) blocks.push(cur);
    return { arr, blocks };
  };
  function refreshColors(cls) {
    const c = classes[cls];
    if (cls === 'first' || cls === 'residence') {
      for (const s of c.seats) {
        const isHover = s === hoverSeat;
        const target = s.yours ? YOURS : isHover ? HOVER : ORANGE;
        let k = s.booked && !s.yours ? c.hl * 0.18 : c.hl * 0.85;
        if (isHover || s.yours) k = Math.max(k, 0.9);
        const mats = s.mats;
        const leatherMat = mats.leather || mats.cream;
        leatherMat.color.copy(c.base).lerp(target, k);
        if (s.booked && !s.yours) leatherMat.color.multiplyScalar(1 - 0.3 * c.hl);
        mats.wall.color.copy(c.wallBase).lerp(target, k * (s.yours ? 0.08 : 0.22));
        if (mats.linen) mats.linen.color.set('#f7f8fa').lerp(target, k * (s.yours ? 0.12 : 0.22));
        if (s.yours) leatherMat.color.copy(c.base).lerp(target, 0.45);
      }
      return;
    }
    const m = c.fabric;
    for (const s of c.seats) {
      if (s.yours) { m.setColorAt(s.index, YOURS); continue; }
      if (groupSet.has(s) && !s.booked) { m.setColorAt(s.index, HOVER); continue; }
      if (s === hoverSeat) { m.setColorAt(s.index, s.booked ? bookedC.copy(c.base).multiplyScalar(0.55) : HOVER); continue; }
      if (s.booked) {
        bookedC.copy(c.base).multiplyScalar(1 - 0.42 * c.hl);
        m.setColorAt(s.index, bookedC);
      } else {
        tmpC.copy(c.base).lerp(ORANGE, c.hl);
        m.setColorAt(s.index, tmpC);
      }
    }
    m.instanceColor.needsUpdate = true;
  }
  for (const cls of CLASS_ORDER) refreshColors(cls);

  // ---------- API ----------
  const api = {
    group, seats, byId, classes, pickables, zoneMeshes, upperGroup, screenMat,
    ZONES, DECK_OF,
    seatFromHit(hit) {
      if (!hit) return null;
      const o = hit.object;
      if (o.userData.seat) return o.userData.seat;
      if (o.isInstancedMesh && hit.instanceId != null) {
        const c = classes[o.userData.cls];
        return c ? c.seats[hit.instanceId] : null;
      }
      return null;
    },
    setClassHighlight(cls, v) {
      const c = classes[cls];
      if (!c) return;
      c.hl = v;
      refreshColors(cls);
    },
    showClassRing(cls, opacity) {
      if (!cls) { glowMat.opacity = 0; return; }
      const z = classes[cls].zone;
      classRing.geometry = ringGeo(z.x1 - z.x0 + 0.1, z.hw * 2 - 0.12, 0.07, 0.4);
      classRing.position.x = z.cx;
      classRing.position.y = z.centre.y + 0.02;
      classRing.position.z = 0;
      glowMat.opacity = opacity;
    },
    setHoverSeat(seat) {
      const prev = hoverSeat;
      hoverSeat = seat;
      if (prev && prev.cls) refreshColors(prev.cls);
      if (seat) {
        refreshColors(seat.cls);
        const [w, d] = seat.footprint;
        seatRing.geometry = ringGeo(w + 0.12, d + 0.12, seat.cls === 'residence' ? 0.07 : 0.045, 0.12);
        const c = seat.ringCentre || seat.pos;
        seatRing.position.set(seat.cls === 'economy' || seat.cls === 'premium' ? c.x - 0.02 : c.x, seat.pos.y + 0.025, c.z);
        seatGlowMat.opacity = 1;
      } else {
        seatGlowMat.opacity = 0;
      }
    },
    markYours(seat) {
      // one booking per class
      for (const s of classes[seat.cls].seats) s.yours = false;
      seat.yours = true;
      seat.booked = true;
      refreshColors(seat.cls);
    },
    // a group of travellers: n free seats side by side that include `seat`, kept within one block
    // between the aisles if possible, otherwise across an aisle in the same row
    groupAround(seat, n) {
      if (!seat || n <= 1 || !classes[seat.cls].fabric) return null;
      const { arr, blocks } = rowBlocks(seat.cls, seat.row);
      for (const run of [blocks.find((b) => b.includes(seat)), arr]) {
        const i = run.indexOf(seat);
        for (let start = Math.max(0, i - n + 1); start <= Math.min(i, run.length - n); start++) {
          const pick = run.slice(start, start + n);
          if (pick.every((q) => !q.booked || q.yours)) return pick;
        }
      }
      return null;
    },
    // the best n seats together in a cabin: one block, towards the front, a window if it fits
    findTogether(cls, n) {
      const c = classes[cls];
      if (!c.fabric) return null;
      let best = null, bestScore = -Infinity;
      const rows = [...new Set(c.seats.map((q) => q.row))];
      for (const row of rows) {
        const { arr, blocks } = rowBlocks(cls, row);
        const tryRun = (run, penalty) => {
          for (let i = 0; i + n <= run.length; i++) {
            const pick = run.slice(i, i + n);
            if (pick.some((q) => q.booked)) continue;
            let score = -penalty - row * 0.4;
            if (n <= 3 && pick.some((q) => q.window)) score += 3;
            if (pick.length === run.length) score += 1.5;
            if (score > bestScore) { bestScore = score; best = pick; }
          }
        };
        for (const b of blocks) tryRun(b, 0);
        tryRun(arr, 40);
      }
      return best;
    },
    setGroup(list) {
      const touched = new Set([...groupSet].map((q) => q.cls));
      groupSet = new Set(list || []);
      for (const q of groupSet) touched.add(q.cls);
      for (const k of touched) refreshColors(k);
    },
    markYoursGroup(list) {
      const cls = list[0].cls;
      for (const q of classes[cls].seats) q.yours = false;
      for (const q of list) { q.yours = true; q.booked = true; }
      groupSet = new Set();
      refreshColors(cls);
    },
    freeCount(cls) {
      return classes[cls].seats.filter((s) => !s.booked).length;
    },
    // Where your eyes are when you sit in this seat, and where you look first. The seat view is
    // the live 3D cabin, so this is a real head position: seated eye height for the seat, a
    // little in front of the headrest, turned towards the window (or forward from the aisle).
    eyeFor(seat, room, { portrait = false } = {}) {
      if (seat.cls === 'residence') {
        const r = seat.rooms[room || 'living'];
        return { eye: r.eye.clone(), look: r.look.clone() };
      }
      const side = seat.side;
      const head = { economy: [-0.1, 1.3], premium: [-0.14, 1.34], business: [-0.42, 1.3], first: [-0.72, 1.32] }[seat.cls];
      const eye = new THREE.Vector3(seat.pos.x + head[0], seat.pos.y + head[1], seat.pos.z - side * 0.03);
      const wr = rowOf(seat.cls);
      let yaw, pitch;
      if (seat.window) {
        // half-turned to the window: the window beside you, the seat in front and the cabin
        // ahead all in view (a phone screen is narrow, so it turns further to the window)
        const roomy = seat.cls === 'business' || seat.cls === 'first';
        yaw = roomy ? 0.78 : 0.6;                                                      // 0 = forward, π/2 = straight out
        if (portrait) {
          // a phone screen is narrow: look straight at the nearest window just ahead
          const want = eye.x + 0.5;
          const wx = wr.xs.reduce((b, x) => (Math.abs(x - want) < Math.abs(b - want) ? x : b), wr.xs[0]);
          const wallZ = halfWidthAt(eye.x, wr.y);
          yaw = THREE.MathUtils.clamp(Math.atan2(Math.abs(side * wallZ - eye.z), Math.max(0.2, wx - eye.x)), 0.45, 1.25);
        }
        pitch = Math.atan2(wr.y - eye.y, 1.6) - 0.04;
      } else {
        yaw = 0.2;                                                                     // forward, a little towards the windows
        pitch = -0.1;
      }
      const dir = new THREE.Vector3(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), side * Math.sin(yaw) * Math.cos(pitch));
      return { eye, look: eye.clone().addScaledVector(dir, 3) };
    },
  };
  return api;
}
