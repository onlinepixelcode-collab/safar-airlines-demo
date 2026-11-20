// Shared dimensions for the aircraft (metres). Nose points to +X, up is +Y,
// the right-hand (starboard, "K") side is +Z and the left (port, "A") side is -Z.

// Two aircraft share this code: the twin-engine widebody ('twin') and the four-engine
// double-decker ('dd'). The choice comes from ?plane= or the last one picked, and is fixed for
// the page (switching planes reloads it).
const PLANES = ['twin', 'dd', 'narrow'];
export const PLANE = (() => {
  try {
    const q = new URLSearchParams(location.search).get('plane');
    if (PLANES.includes(q)) return q;
    const s = localStorage.getItem('safar-plane');
    if (PLANES.includes(s)) return s;
  } catch (e) { /* private mode */ }
  return 'twin';
})();
export const IS_DD = PLANE === 'dd';
export const IS_NARROW = PLANE === 'narrow';

export const FUS = IS_NARROW ? {
  R: 1.98,              // a 4 m single-aisle fuselage
  NOSE_START: 14.5, NOSE_END: 19.8,
  TAIL_START: -12.5, TAIL_END: -20.4,
  NOSE_DROP: -0.42, TAIL_RISE: 1.3, NOSE_POW: 2.3,
  CUT_H: 0.95,
  FLOOR_Y: -0.72,
  CABIN_X0: -13.6, CABIN_X1: 15.6,
  WALL: 0.09,
  LEN: 40.8, U0: 20.6,
} : IS_DD ? {
  R: 3.9,               // 7.8 m fuselage: two full-length decks
  NOSE_START: 30.0, NOSE_END: 38.6,
  TAIL_START: -22.5, TAIL_END: -37.2,
  NOSE_DROP: -1.05, TAIL_RISE: 2.75, NOSE_POW: 2.0,
  CUT_H: 2.5,           // cutaway above the upper deck
  CUT_M: 0.32,          // cutaway above the main deck (upper deck hidden)
  FLOOR_Y: -2.0,        // main deck floor
  UPPER_Y: 0.78,        // upper deck floor (top)
  SLAB: 0.36,           // upper floor thickness: its underside is the main-deck ceiling
  CABIN_X0: -24.2, CABIN_X1: 29.6,      // main deck: rear bulkhead, flight-deck bulkhead
  UPPER_X0: -20.6, UPPER_X1: 27.9,      // upper deck ends
  WALL: 0.13,
  LEN: 76.8, U0: 38.0,
} : {
  R: 2.95,              // fuselage radius
  NOSE_START: 26.5,     // nose taper begins
  NOSE_END: 35.0,       // nose tip
  TAIL_START: -21.0,    // tail cone begins
  TAIL_END: -35.0,      // APU end
  NOSE_DROP: -0.62, TAIL_RISE: 1.95, NOSE_POW: 2.3,
  CUT_H: 0.55,          // height of the cutaway above the fuselage axis
  FLOOR_Y: -1.25,       // cabin floor height
  CABIN_X0: -22.4,      // rear cabin bulkhead
  CABIN_X1: 27.6,       // flight-deck bulkhead
  WALL: 0.11,           // shell thickness
  LEN: 71.2, U0: 35.6,
};
FUS.THETA_C = Math.acos(FUS.CUT_H / FUS.R);
FUS.R_IN = FUS.R - FUS.WALL;
FUS.THETA_F = Math.acos(FUS.FLOOR_Y / FUS.R_IN); // inner wall meets the floor
if (IS_DD) {
  FUS.THETA_M = Math.acos(FUS.CUT_M / FUS.R);
  FUS.THETA_UF = Math.acos(FUS.UPPER_Y / FUS.R_IN);   // upper inner wall meets the upper floor
}

export function fusProfile(x) {
  const { R, NOSE_START, NOSE_END, TAIL_START, TAIL_END, NOSE_DROP, TAIL_RISE, NOSE_POW } = FUS;
  if (x > NOSE_START) {
    const t = Math.min(1, (x - NOSE_START) / (NOSE_END - NOSE_START));
    return { r: R * Math.sqrt(Math.max(0, 1 - Math.pow(t, NOSE_POW))), c: NOSE_DROP * t * t };
  }
  if (x < TAIL_END) {
    const k = Math.min(1, (TAIL_END - x) / 0.55);
    return { r: R * 0.14 * Math.sqrt(Math.max(0, 1 - k * k)), c: TAIL_RISE };
  }
  if (x < TAIL_START) {
    const t = Math.min(1, (TAIL_START - x) / (TAIL_START - TAIL_END));
    return { r: R * (1 - 0.86 * Math.pow(t, 1.35)), c: TAIL_RISE * Math.pow(t, 1.65) };
  }
  return { r: R, c: 0 };
}

// texture u-coordinate along the fuselage
export const U = (x) => (x + FUS.U0) / FUS.LEN;
// livery artwork is laid out in the twin's coordinates; on the double-decker each part (nose,
// cabin, tail) is stretched onto the matching part of the longer fuselage
export const D = (x) => {
  if (PLANE === 'twin') return x;
  const seg = (a0, a1, b0, b1) => b0 + ((x - a0) / (a1 - a0)) * (b1 - b0);
  if (x >= 26.5) return seg(26.5, 35.6, FUS.NOSE_START, FUS.NOSE_END + 0.6);
  if (x <= -21.0) return seg(-35.6, -21.0, FUS.TAIL_END - 0.6, FUS.TAIL_START);
  return seg(-21.0, 26.5, FUS.TAIL_START, FUS.NOSE_START);
};

export const DOORS = IS_NARROW ? [14.9, 0.9, -0.1, -12.9] : IS_DD ? [28.3, 15.6, 3.2, -9.6, -22.6] : [26.8, 11.7, 1.8, -21.6];
export const UPPER_DOORS = IS_DD ? [18.4, 0.0, -18.9] : [];
export const WIN = { y: IS_DD ? FUS.FLOOR_Y + 1.37 : IS_NARROW ? FUS.FLOOR_Y + 1.32 : 0.12, w: IS_NARROW ? 0.23 : 0.25, h: IS_NARROW ? 0.34 : 0.38 };
// cabin-side window trim: the opening cut in the sidewall and the moulded bezel around it
Object.assign(WIN, { OPEN_W: 0.27, OPEN_H: 0.4, HOLE_W: 0.29, HOLE_H: 0.42, BEZEL_W: 0.44, BEZEL_H: 0.6 });
const windowsBetween = (x0, x1, pitch, doors) => {
  const out = [];
  for (let x = x0; x <= x1; x += pitch) {
    if (doors.some((d) => Math.abs(d - x) < 0.8)) continue;
    out.push(+x.toFixed(3));
  }
  return out;
};
export const WINDOWS = IS_NARROW ? windowsBetween(-12.0, 14.2, 0.53, [14.9, -12.9]) : IS_DD ? windowsBetween(-23.0, 28.9, 0.54, DOORS) : windowsBetween(-20.5, 26.2, 0.62, DOORS);
// every row of windows: one on the twin, two (main and upper deck) on the double-decker
// deck: which deck the row belongs to; th0/th1: the inner wall it sits in (angles from the top)
export const WIN_ROWS = IS_DD ? [
  { deck: 'main', y: WIN.y, xs: WINDOWS, th0: Math.acos((FUS.UPPER_Y - FUS.SLAB) / FUS.R_IN), th1: FUS.THETA_F, floor: FUS.FLOOR_Y },
  { deck: 'upper', y: FUS.UPPER_Y + 1.3, xs: windowsBetween(-19.8, 27.0, 0.54, UPPER_DOORS), th0: FUS.THETA_C, th1: FUS.THETA_UF, floor: FUS.UPPER_Y },
] : [{ deck: 'main', y: WIN.y, xs: WINDOWS, th0: FUS.THETA_C, th1: FUS.THETA_F, floor: FUS.FLOOR_Y }];

// Wing planform shared by the 3D wing and the "over the wing" seat-view logic
export const WING = IS_NARROW ? {
  rootX: 5.0, rootZ: 1.0, rootY: -1.35, span: 16.0,
  rootChord: 7.0, kinkChord: 4.0, kinkAt: 0.33, tipChord: 1.4,
  sweep: 25 * Math.PI / 180, dihedral: 5.5 * Math.PI / 180,
} : IS_DD ? {
  rootX: 10.5, rootZ: 2.3, rootY: -2.95, span: 37.0,
  rootChord: 17.6, kinkChord: 10.4, kinkAt: 0.33, tipChord: 4.0,
  sweep: 33.5 * Math.PI / 180, dihedral: 5.6 * Math.PI / 180,
} : {
  rootX: 9.0, rootZ: 1.5, rootY: -2.05, span: 30.5,
  rootChord: 12.0, kinkChord: 7.0, kinkAt: 0.32, tipChord: 1.9,
  sweep: 33 * Math.PI / 180, dihedral: 6 * Math.PI / 180,
};

export function linspace(a, b, n, pow = 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push(a + (b - a) * Math.pow(t, pow));
  }
  return out;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
