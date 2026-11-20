// Shared dimensions for the aircraft (metres). Nose points to +X, up is +Y,
// the right-hand (starboard, "K") side is +Z and the left (port, "A") side is -Z.

export const FUS = {
  R: 2.95,              // fuselage radius
  NOSE_START: 26.5,     // nose taper begins
  NOSE_END: 35.0,       // nose tip
  TAIL_START: -21.0,    // tail cone begins
  TAIL_END: -35.0,      // APU end
  CUT_H: 0.55,          // height of the cutaway above the fuselage axis
  FLOOR_Y: -1.25,       // cabin floor height
  CABIN_X0: -22.4,      // rear cabin bulkhead
  CABIN_X1: 27.6,       // flight-deck bulkhead
  WALL: 0.11,           // shell thickness
};
FUS.THETA_C = Math.acos(FUS.CUT_H / FUS.R);
FUS.R_IN = FUS.R - FUS.WALL;
FUS.THETA_F = Math.acos(FUS.FLOOR_Y / FUS.R_IN); // inner wall meets the floor

export function fusProfile(x) {
  const { R, NOSE_START, NOSE_END, TAIL_START, TAIL_END } = FUS;
  if (x > NOSE_START) {
    const t = Math.min(1, (x - NOSE_START) / (NOSE_END - NOSE_START));
    return { r: R * Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.3))), c: -0.62 * t * t };
  }
  if (x < TAIL_END) {
    const k = Math.min(1, (TAIL_END - x) / 0.55);
    return { r: R * 0.14 * Math.sqrt(Math.max(0, 1 - k * k)), c: 1.95 };
  }
  if (x < TAIL_START) {
    const t = Math.min(1, (TAIL_START - x) / (TAIL_START - TAIL_END));
    return { r: R * (1 - 0.86 * Math.pow(t, 1.35)), c: 1.95 * Math.pow(t, 1.65) };
  }
  return { r: R, c: 0 };
}

// texture u-coordinate along the fuselage
export const U = (x) => (x + 35.6) / 71.2;

export const DOORS = [26.8, 11.7, 1.8, -21.6];
export const WIN = { y: 0.12, w: 0.25, h: 0.38 };
// cabin-side window trim: the opening cut in the sidewall and the moulded bezel around it
Object.assign(WIN, { OPEN_W: 0.27, OPEN_H: 0.4, HOLE_W: 0.29, HOLE_H: 0.42, BEZEL_W: 0.44, BEZEL_H: 0.6 });
export const WINDOWS = (() => {
  const out = [];
  for (let x = -20.5; x <= 26.2; x += 0.62) {
    if (DOORS.some((d) => Math.abs(d - x) < 0.8)) continue;
    out.push(+x.toFixed(3));
  }
  return out;
})();

// Wing planform shared by the 3D wing and the "over the wing" seat-view logic
export const WING = {
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
