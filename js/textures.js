import * as THREE from 'three';
import { FUS, U, D, DOORS, UPPER_DOORS, WINDOWS, WIN, WIN_ROWS, IS_DD, IS_NARROW, mulberry32 } from './geo.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}
function finish(canvas, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  return t;
}

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Exterior paint: white with panel lines, windows, door outlines, flight-deck mask
// u runs along the fuselage (see U()), v runs around it (0 = top, 0.25 = right side)
// ---------------------------------------------------------------------------
export function makeLiveryTexture(aniso, hi = false, colors = null) {
  const W = hi ? 8192 : 4096, H = hi ? 2048 : 1024;
  const k = W / 4096;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#f4f5f7';
  g.fillRect(0, 0, W, H);
  if (colors) paintRearFacets(g, W, H, colors);

  // faint belly shading so the underside isn't dead flat
  const belly = g.createLinearGradient(0, 0, 0, H);
  belly.addColorStop(0.0, 'rgba(255,255,255,0)');
  belly.addColorStop(0.36, 'rgba(255,255,255,0)');
  belly.addColorStop(0.5, 'rgba(110,122,136,0.12)');
  belly.addColorStop(0.64, 'rgba(255,255,255,0)');
  g.fillStyle = belly;
  g.fillRect(0, 0, W, H);

  // panel lines
  g.strokeStyle = 'rgba(108,118,130,0.16)';
  g.lineWidth = k;
  for (let x = -33; x < 33; x += 2.35) {
    const px = U(D(x)) * W;
    g.beginPath(); g.moveTo(px, 0); g.lineTo(px, H); g.stroke();
  }
  for (const deg of [58, 122, 238, 302]) {
    const py = (deg / 360) * H;
    g.beginPath(); g.moveTo(U(D(-30)) * W, py); g.lineTo(U(D(29)) * W, py); g.stroke();
  }

  drawOpenings(g, W, H, k);

  // flight-deck windscreen ("mask") drawn in (x, theta) space on both sides
  g.fillStyle = '#11151b';
  drawWindscreen(g, W, H, 0);
  // pane posts
  g.strokeStyle = 'rgba(220,226,232,0.5)';
  g.lineWidth = 1.5 * k;
  const wo = WINDSCREEN_DX;
  for (const deg of [20, 44, 340, 316]) {
    const py = (deg / 360) * H;
    g.beginPath(); g.moveTo(U(32.3 + wo) * W, py); g.lineTo(U(33.4 + wo) * W, py); g.stroke();
  }

  // wraps around the fuselage: the nose and tail cone run their angle from -180 to 180 degrees
  const t = finish(c, { aniso, repeat: true });
  t.wrapT = THREE.RepeatWrapping;
  t.flipY = false; // canvas row = v, so (x, theta) drawing maps straight onto the hull
  return t;
}

// ---- low-poly facets ------------------------------------------------------
const hexRgb = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ramp = (stops, t) => {            // stops: [[t, rgb], ...] ascending
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      return mixRgb(c0, c1, (t - t0) / Math.max(1e-6, t1 - t0));
    }
  }
  return stops[stops.length - 1][1];
};
const smooth01 = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

// Jittered grid split into triangles; colorAt(cx, cy, rng) returns [r,g,b,a] or null.
function paintFacets(g, x0, y0, w, h, cols, rows, colorAt, { seed = 1, jitter = 0.7, wrapX = false } = {}) {
  const rng = mulberry32(seed);
  const P = [];
  for (let j = 0; j <= rows; j++) {
    P[j] = [];
    for (let i = 0; i <= cols; i++) {
      const edgeX = (i === 0 || i === cols) && !wrapX;
      const edgeY = j === 0 || j === rows;
      const jx = edgeX ? 0 : (rng() - 0.5) * jitter;
      const jy = edgeY ? 0 : (rng() - 0.5) * jitter;
      P[j][i] = [x0 + ((i + jx) / cols) * w, y0 + ((j + jy) / rows) * h];
    }
    if (wrapX) P[j][cols] = [P[j][0][0] + w, P[j][0][1]];
  }
  const tri = (a, b, c) => {
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
    const col = colorAt(cx, cy, rng);
    if (!col) return;
    const css = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${col[3] ?? 1})`;
    g.fillStyle = css; g.strokeStyle = css; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.closePath();
    g.fill(); g.stroke();
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const p00 = P[j][i], p10 = P[j][i + 1], p01 = P[j + 1][i], p11 = P[j + 1][i + 1];
      if ((i + j) % 2) { tri(p00, p10, p11); tri(p00, p11, p01); }
      else { tri(p00, p10, p01); tri(p10, p11, p01); }
    }
  }
}

// Rear fuselage: white fading through pale blue to Safar blue from the wing back to the tail,
// broken into soft triangular facets (the hull uses full v = 0..1 around, u along x).
function paintRearFacets(g, W, H, colors) {
  const white = [244, 247, 250];
  const stops = [
    [0.0, [238, 247, 253]],
    [0.3, [206, 233, 250]],
    [0.55, [152, 208, 244]],
    [0.8, [104, 182, 236]],
    [1.0, [74, 160, 228]],
  ];
  const xFrom = D(12), xTo = D(-35.6);
  const px0 = U(xTo) * W, px1 = U(xFrom) * W;
  const u9 = U(D(9)), uSpan = U(D(9)) - U(D(-22));
  paintFacets(g, px0, 0, px1 - px0, H, 22, 10, (cx, cy, rng) => {
    let t = smooth01((u9 - cx / W) / uSpan) + (rng() - 0.5) * 0.2;
    t = Math.min(1, Math.max(0, t));
    if (t < 0.04) return null;
    let col = ramp(stops, t);
    // glassy shards: some facets lift towards white, a few drop a shade
    const r = rng();
    if (r < 0.22) col = mixRgb(col, white, 0.18 + rng() * 0.22);
    else if (r > 0.86) col = col.map((v) => v * 0.93);
    const lum = 1 + (rng() - 0.5) * 0.06;
    col = col.map((v) => Math.min(255, v * lum));
    return [...col, smooth01(t / 0.3)];
  }, { seed: 41, jitter: 0.8 });
}

// The flight-deck windscreen in (x, degrees from the top) on the nose, joined across the top.
// On the double-decker the nose is longer, so the same shape sits further forward.
export const WINDSCREEN_DX = IS_DD ? 3.95 : IS_NARROW ? -14.85 : 0;
export const WS_POLY = [[33.38, 0], [33.38, 30], [32.75, 50], [32.2, 61], [32.0, 53], [32.55, 29], [32.9, 0]];
function drawWindscreen(g, W, H, inset) {
  // inset (in degrees and metres) shrinks the shape a little, to leave a dark frame round the glass
  for (const side of [1, -1]) {
    g.beginPath();
    WS_POLY.forEach(([x, deg], i) => {
      const cx = 32.7, xd = x + (x > cx ? -inset * 0.06 : inset * 0.06) + WINDSCREEN_DX;
      const dd = deg < 30 ? deg : deg - inset;
      const th = side > 0 ? dd : 360 - dd;
      const px = U(xd) * W, py = (th / 360) * H;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    });
    g.closePath(); g.fill();
  }
  // across the v = 0 seam (top centre)
  const a = U(32.9 + WINDSCREEN_DX + inset * 0.06) * W, b = U(33.38 + WINDSCREEN_DX - inset * 0.06) * W;
  g.fillRect(a, 0, b - a, 6 * (W / 4096));
  g.fillRect(a, H - 6 * (W / 4096), b - a, 6 * (W / 4096));
}
// alpha mask for the windscreen: holes in the nose skin (solid = white) or the glass itself
export function makeWindscreenMask({ glass = false } = {}) {
  const W = 4096, H = 1024;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = glass ? '#000' : '#fff';
  g.fillRect(0, 0, W, H);
  g.fillStyle = glass ? '#fff' : '#000';
  drawWindscreen(g, W, H, 1.6);
  const t = finish(c, { srgb: false, repeat: true });
  t.flipY = false;
  return t;
}

// Flight-deck displays: six screens across the panel (flight, navigation and engine pages)
export function makeCockpitPanelTexture(engines = 2) {
  const W = 1024, H = 256;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#20252c'; g.fillRect(0, 0, W, H);
  const sw = 138, sh = 150, top = 52;
  const xs = [36, 196, 356, 530, 690, 850];
  xs.forEach((x, i) => {
    g.fillStyle = '#05080c'; rr(g, x - 6, top - 6, sw + 12, sh + 12, 10); g.fill();
    g.save(); g.beginPath(); rr(g, x, top, sw, sh, 6); g.clip();
    const kind = [0, 1, 2, 3, 1, 0][i];
    if (kind === 0) {                                        // primary flight display: horizon
      g.fillStyle = '#2f7fd6'; g.fillRect(x, top, sw, sh * 0.52);
      g.fillStyle = '#8a5a2b'; g.fillRect(x, top + sh * 0.52, sw, sh);
      g.strokeStyle = '#fff'; g.lineWidth = 2;
      for (let k = -2; k <= 2; k++) { if (!k) continue; const y = top + sh * 0.52 - k * 14; g.beginPath(); g.moveTo(x + sw / 2 - (k % 2 ? 14 : 24), y); g.lineTo(x + sw / 2 + (k % 2 ? 14 : 24), y); g.stroke(); }
      g.fillStyle = '#ffd400'; g.fillRect(x + sw / 2 - 30, top + sh * 0.52 - 2, 20, 4); g.fillRect(x + sw / 2 + 10, top + sh * 0.52 - 2, 20, 4);
      g.fillStyle = 'rgba(20,24,30,0.85)'; g.fillRect(x, top, 26, sh); g.fillRect(x + sw - 26, top, 26, sh);
      g.fillStyle = '#e8eef4'; g.font = '600 10px monospace';
      for (let k = 0; k < 6; k++) { g.fillText(String(240 + k * 10), x + 2, top + sh - 12 - k * 24); g.fillText(String(37 + k), x + sw - 22, top + sh - 12 - k * 24); }
    } else if (kind === 1) {                                 // navigation display: arcs and route
      g.fillStyle = '#000'; g.fillRect(x, top, sw, sh);
      g.strokeStyle = '#e8eef4'; g.lineWidth = 1.5;
      for (const r of [40, 80, 120]) { g.beginPath(); g.arc(x + sw / 2, top + sh - 14, r, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
      g.strokeStyle = '#ff3df5'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x + sw / 2, top + sh - 14); g.lineTo(x + sw / 2 + 16, top + 70); g.lineTo(x + sw / 2 + 6, top + 18); g.stroke();
      g.fillStyle = '#2bff6a'; g.font = '600 10px monospace'; g.fillText('JED', x + sw / 2 + 12, top + 16);
      g.fillStyle = '#ffd400'; g.beginPath(); g.moveTo(x + sw / 2, top + sh - 22); g.lineTo(x + sw / 2 - 7, top + sh - 6); g.lineTo(x + sw / 2 + 7, top + sh - 6); g.closePath(); g.fill();
    } else if (kind === 2) {                                 // engine display: one gauge per engine
      g.fillStyle = '#000'; g.fillRect(x, top, sw, sh);
      const n = engines, cw = sw / n;
      for (let e = 0; e < n; e++) {
        const cx = x + cw * (e + 0.5);
        for (const [cy, val] of [[top + 40, 0.82], [top + 100, 0.7]]) {
          g.strokeStyle = '#e8eef4'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, Math.min(22, cw * 0.38), Math.PI * 0.8, Math.PI * 2.2); g.stroke();
          g.strokeStyle = '#2bff6a'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(Math.PI * (0.8 + 1.4 * val)) * 18, cy + Math.sin(Math.PI * (0.8 + 1.4 * val)) * 18); g.stroke();
        }
      }
    } else {                                                 // systems page
      g.fillStyle = '#000'; g.fillRect(x, top, sw, sh);
      g.fillStyle = '#2bff6a'; g.font = '600 11px monospace';
      ['FUEL  84.2', 'CAB ALT 6200', 'OAT  -56', 'GW  412.6', 'CRZ FL370'].forEach((t, k) => g.fillText(t, x + 10, top + 24 + k * 24));
    }
    g.restore();
  });
  const t = finish(c, {});
  return t;
}
// overhead panel: rows of switches, a few lit
export function makeOverheadPanelTexture() {
  const W = 512, H = 256;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#2b3138'; g.fillRect(0, 0, W, H);
  const rng = mulberry32(19);
  for (let y = 14; y < H - 10; y += 22) for (let x = 12; x < W - 12; x += 26) {
    if (rng() < 0.18) continue;
    g.fillStyle = '#14181d'; g.fillRect(x, y, 18, 13);
    const r = rng();
    if (r < 0.12) { g.fillStyle = '#f5f8fb'; g.fillRect(x + 3, y + 3, 12, 7); }
    else if (r < 0.18) { g.fillStyle = '#ffb02e'; g.fillRect(x + 3, y + 3, 12, 7); }
    else if (r < 0.24) { g.fillStyle = '#3fb0ff'; g.fillRect(x + 3, y + 3, 12, 7); }
  }
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
  for (const x of [128, 256, 384]) { g.beginPath(); g.moveTo(x, 6); g.lineTo(x, H - 6); g.stroke(); }
  return finish(c, {});
}

// windows + door outlines (also redrawn over the titles so they show through the letters)
function drawOpenings(g, W, H, k = W / 4096) {
  const R = FUS.R;
  const mPerV = TAU * R;
  const vAt = (y, side) => {
    const th = Math.acos(THREE.MathUtils.clamp(y / R, -1, 1));
    return (side > 0 ? th : TAU - th) / TAU;
  };
  const ww = (WIN.w / FUS.LEN) * W;
  const wh = (WIN.h / mPerV) * H;

  for (const side of [1, -1]) for (const row of WIN_ROWS) {
    const vc = vAt(row.y, side) * H;
    for (const x of row.xs) {
      const px = U(x) * W;
      g.fillStyle = '#1c232d';
      rr(g, px - ww / 2, vc - wh / 2, ww, wh, ww * 0.48); g.fill();
      g.fillStyle = 'rgba(150,180,215,0.35)';
      rr(g, px - ww / 2 + 1.5 * k, vc - wh / 2 + 1.5 * k, ww - 3 * k, wh * 0.42, ww * 0.4); g.fill();
    }
    for (const x of row.deck === 'upper' ? UPPER_DOORS : DOORS) {
      const px = U(x) * W;
      const dw = (1.07 / FUS.LEN) * W, dh = (1.86 / mPerV) * H;
      const dv = vAt(row.floor + 1.03, side) * H;
      g.strokeStyle = 'rgba(40,60,78,0.45)';
      g.lineWidth = 2 * k;
      rr(g, px - dw / 2, dv - dh / 2, dw, dh, 7 * k); g.stroke();
      g.fillStyle = '#1c232d';
      rr(g, px - ww / 2, vc - wh / 2, ww, wh, ww * 0.48); g.fill();
    }
  }
}

// recolour a white-on-transparent logo
function tint(img, color) {
  const c = makeCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function spacedText(g, text, cx, cy, width, size, color) {
  g.save();
  g.fillStyle = color;
  g.font = `750 ${size}px InterVar, Helvetica, Arial, sans-serif`;
  g.textBaseline = 'middle';
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width);
  const gap = (width - widths.reduce((a, b) => a + b, 0)) / Math.max(1, chars.length - 1);
  let x = cx - width / 2;
  chars.forEach((ch, i) => { g.fillText(ch, x, cy); x += widths[i] + gap; });
  g.restore();
}

// Titles above the windows on both sides: SAFAR wordmark + spaced AIRLINES, like the logo lockup.
// Right side is drawn as-is; on the left side both axes run backwards, so it is drawn rotated 180°.
export function decorateLivery(tex, mark, { colors, xFront = 28.4, length = 18.6, yTop = 1.98, yBot = -2.02, sub = '', ink = '#0d0f12' } = {}) {
  if (!mark) return;
  const c = tex.image, g = c.getContext('2d');
  const W = c.width, H = c.height, R = FUS.R;
  const vOf = (y) => Math.acos(THREE.MathUtils.clamp(y / R, -1, 1)) / TAU;
  const mPerPxU = FUS.LEN / W;
  // gradient-filled wordmark: a strong Safar-blue S that lifts to a bright, slightly glassy
  // sky blue across AFAR, with the base of the letters a shade deeper (like water)
  const mw = mark.naturalWidth || mark.width, mh = mark.naturalHeight || mark.height;
  const lc = makeCanvas(mw, mh), lg = lc.getContext('2d');
  lg.drawImage(mark, 0, 0);
  lg.globalCompositeOperation = 'source-in';
  const gx = lg.createLinearGradient(0, 0, mw, 0);
  gx.addColorStop(0, '#0a7fc0');
  gx.addColorStop(0.15, '#1199d6');
  gx.addColorStop(0.2, colors.primary);
  gx.addColorStop(0.5, '#33b8e6');
  gx.addColorStop(0.78, '#46bfea');
  gx.addColorStop(1, '#2aa7e0');
  lg.fillStyle = gx; lg.fillRect(0, 0, mw, mh);
  lg.globalCompositeOperation = 'source-atop';
  const gy = lg.createLinearGradient(0, 0, 0, mh);
  gy.addColorStop(0, 'rgba(255,255,255,0.16)');
  gy.addColorStop(0.42, 'rgba(255,255,255,0)');
  gy.addColorStop(0.66, 'rgba(6,96,160,0)');
  gy.addColorStop(1, 'rgba(6,88,150,0.5)');
  lg.fillStyle = gy; lg.fillRect(0, 0, mw, mh);
  // fine diagonal light shards across the letters, echoing the faceted tail
  lg.globalCompositeOperation = 'source-atop';
  const rng = mulberry32(77);
  for (let i = 0; i < 9; i++) {
    const x0 = rng() * mw, wv = mw * (0.04 + rng() * 0.08);
    lg.fillStyle = `rgba(255,255,255,${0.05 + rng() * 0.08})`;
    lg.beginPath(); lg.moveTo(x0, 0); lg.lineTo(x0 + wv, 0); lg.lineTo(x0 + wv - mh * 0.55, mh); lg.lineTo(x0 - mh * 0.55, mh); lg.closePath(); lg.fill();
  }

  const v0 = vOf(yTop), v1 = vOf(yBot);
  const h = (v1 - v0) * H;
  const w = length / mPerPxU;
  const x1 = U(D(xFront)) * W, cx = x1 - w / 2;
  const cyR = ((v0 + v1) / 2) * H, cyL = (1 - (v0 + v1) / 2) * H;
  g.drawImage(lc, cx - w / 2, cyR - h / 2, w, h);
  g.save(); g.translate(cx, cyL); g.rotate(Math.PI); g.drawImage(lc, -w / 2, -h / 2, w, h); g.restore();
  if (sub) {
    const s0 = vOf(yBot - 0.05), s1 = vOf(yBot - 0.35), sh = (s1 - s0) * H;
    spacedText(g, sub, cx, ((s0 + s1) / 2) * H, w * 0.6, sh * 0.8, ink);
  }
  // windows and doors sit on top of the letters, like the real thing
  drawOpenings(g, W, H);
  tex.needsUpdate = true;
}

// Fin artwork: Safar blue with a slanted white S monogram cut from the wordmark.
// The fin has planar UVs with the two faces in separate halves of the texture
// (left side of the aircraft = bottom half, right side = top half, because flipY is on),
// so the S can be drawn the right way round on each side.
export function makeTailTexture(colors, size = 1024) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const brand = hexRgb(colors.primary);
  const stops = [[0, [92, 170, 232]], [0.3, [96, 174, 234]], [0.55, [62, 144, 222]], [0.74, [40, 108, 200]], [0.88, [30, 72, 160]], [1, [26, 52, 128]]];
  for (const face of [0, 1]) {
    const top = face === 0 ? size / 2 : 0;
    g.fillStyle = '#5aa8e6';
    g.fillRect(0, top, size, size / 2);
    paintFacets(g, 0, top, size, size / 2, 12, 12, (cx, cy, rng) => {
      const z = (1 - (cy - top) / (size / 2)) * 17;     // metres up the fin
      const u = (cx / size) * 17;                        // metres aft of the root leading edge
      let t = z / 9.6 + (u / 17) * 0.2 + (rng() - 0.5) * 0.12;
      let col = ramp(stops, t);
      if (rng() < 0.2 && t < 0.7) col = mixRgb(col, [236, 246, 252], 0.15 + rng() * 0.15);
      const lum = 1 + (rng() - 0.5) * 0.1;
      return [...col.map((v) => Math.min(255, v * lum)), 1];
    }, { seed: 7 + face, jitter: 0.8 });
  }
  return finish(c, {});
}
export function decorateTail(tex, glyphImg, { span = 17, centre = [7.15, 4.75], height = 4.4, shear = 0.5 } = {}) {
  if (!glyphImg) return;
  const c = tex.image, g = c.getContext('2d'), S = c.width;
  const pxU = S / span, pxV = (S / 2) / span;
  const glyph = tint(glyphImg, '#ffffff');
  const hpx = height * pxV;
  const wpx = height * (glyph.width / glyph.height) * pxU;
  for (const face of [0, 1]) {
    const regionTop = face === 0 ? S / 2 : 0;
    const cx = centre[0] * pxU;
    const cy = regionTop + (S / 2) * (1 - centre[1] / span);
    g.save();
    g.beginPath(); g.rect(0, regionTop, S, S / 2); g.clip();
    g.translate(cx, cy);
    g.transform(1, 0, -shear * (pxU / pxV), 1, 0, 0);   // lean aft with the fin sweep
    if (face === 1) g.scale(-1, 1);                       // right-hand face is seen mirrored
    g.drawImage(glyph, -wpx / 2, -hpx / 2, wpx, hpx);
    g.restore();
  }
  tex.needsUpdate = true;
}

// Engine cowls: Safar blue with SAFAR in white on both sides and on top (seen from above).
// Lathe UVs: u runs around the nacelle (u = 0 faces +Z), v runs from the exhaust to the intake.
export function makeEngineTexture(colors, hi = false) {
  const W = hi ? 2048 : 1024, H = W / 2;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  const pale = [228, 242, 251], brand = [110, 182, 236];
  g.fillStyle = `rgb(${pale.join(',')})`;
  g.fillRect(0, 0, W, H);
  paintFacets(g, 0, 0, W, H, 14, 6, (cx, cy, rng) => {
    const along = 1 - cy / H;                                    // 0 exhaust … 1 intake
    const round = Math.abs(((cx / W) * 2 + 1) % 2 - 1);          // varies around the cowl
    let t = 0.15 + 0.5 * (1 - along) + 0.25 * round + (rng() - 0.5) * 0.3;
    let col = mixRgb(pale, brand, Math.min(1, Math.max(0, t)));
    if (rng() < 0.2) col = mixRgb(col, [246, 250, 253], 0.3);
    const lum = 1 + (rng() - 0.5) * 0.06;
    return [...col.map((v) => Math.min(255, v * lum)), 1];
  }, { seed: 19, jitter: 0.8, wrapX: true });
  return finish(c, {});
}
export function decorateEngine(tex, mark, { arcLen = 6.4, circ = 11.2, centreV = 0.5, length = 3.0 } = {}) {
  if (!mark) return;
  const c = tex.image, g = c.getContext('2d'), W = c.width, H = c.height;
  const logo = tint(mark, '#ffffff');
  const Lpx = (length / arcLen) * H;
  const Hpx = ((length * logo.height) / logo.width / circ) * W;
  const cy = (1 - centreV) * H;
  const put = (u, rot) => {
    for (const off of [0, W, -W]) {
      const cx = u * W + off;
      if (cx < -Hpx || cx > W + Hpx) continue;
      g.save(); g.translate(cx, cy); g.rotate(rot); g.drawImage(logo, -Lpx / 2, -Hpx / 2, Lpx, Hpx); g.restore();
    }
  };
  put(0.0, -Math.PI / 2);   // right side (+Z)
  put(0.5, Math.PI / 2);    // left side (−Z)
  put(0.75, -Math.PI / 2);  // top
  tex.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Cabin sidewall seen from inside: cream panels, window reveals and bright glass.
// u matches the exterior; v runs from the cut edge (0) down to the floor (1).
// Returns { map, emissive }
// ---------------------------------------------------------------------------
export function makeInnerWallTextures(aniso, row = WIN_ROWS[0]) {
  // Cool-white sidewall panels. The windows are real openings (alpha holes) framed by 3D
  // bezels built in aircraft.js, so the passenger sees the actual sky, clouds and wing.
  const W = 4096, H = 256;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  const a = makeCanvas(W, H), ga = a.getContext('2d');
  const Ri = FUS.R_IN;
  const T0 = row.th0, T1 = row.th1;
  const tAt = (y) => (Math.acos(THREE.MathUtils.clamp(y / Ri, -1, 1)) - T0) / (T1 - T0);

  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#f5f7f9');
  base.addColorStop(0.55, '#eef1f4');
  base.addColorStop(0.62, '#e2e7ec');
  base.addColorStop(1, '#d6dce3');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  ga.fillStyle = '#fff';
  ga.fillRect(0, 0, W, H);

  // dado rail
  const dado = tAt(row.floor + 0.63) * H;
  g.fillStyle = 'rgba(120,135,155,0.35)';
  g.fillRect(0, dado, W, 2);
  // faint panel joints between window pairs
  g.fillStyle = 'rgba(120,135,155,0.12)';
  for (let i = 0; i < row.xs.length; i += 2) g.fillRect(U(row.xs[i] - 0.31) * W, 0, 1, dado);

  const tc = tAt(row.y) * H;
  const mPerT = (T1 - T0) * Ri;
  const hw = (WIN.HOLE_W / FUS.LEN) * W, hh = (WIN.HOLE_H / mPerT) * H;
  const bw = (WIN.BEZEL_W / FUS.LEN) * W, bh = (WIN.BEZEL_H / mPerT) * H;
  for (const x of row.xs) {
    const px = U(x) * W;
    // soft contact shade around the bezel
    g.save();
    g.shadowColor = 'rgba(60,75,95,0.28)';
    g.shadowBlur = 6;
    g.fillStyle = 'rgba(214,220,227,1)';
    rr(g, px - bw / 2, tc - bh / 2, bw, bh, bw * 0.4); g.fill();
    g.restore();
    ga.fillStyle = '#000';
    rr(ga, px - hw / 2, tc - hh / 2, hw, hh, hw * 0.46); ga.fill();
  }
  const map = finish(c, { aniso }), alpha = finish(a, { aniso, srgb: false });
  map.flipY = false; alpha.flipY = false;
  return { map, alpha };
}

// Window mask on the outer skin (white = solid, black = window glass), used by the fuselage's
// shadow-depth material so sunlight falls through the windows into the cabin.
export function makeShellWindowMask() {
  const W = 4096, H = 1024;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  const R = FUS.R, mPerV = TAU * R;
  const ww = (WIN.w / FUS.LEN) * W, wh = (WIN.h / mPerV) * H;
  g.fillStyle = '#000';
  for (const side of [1, -1]) for (const row of WIN_ROWS) {
    const th = Math.acos(row.y / R);
    const vc = ((side > 0 ? th : TAU - th) / TAU) * H;
    for (const x of row.xs) { const px = U(x) * W; rr(g, px - ww / 2, vc - wh / 2, ww, wh, ww * 0.48); g.fill(); }
  }
  const t = finish(c, { srgb: false });
  t.flipY = false;
  return t;
}

// Night: the cabin windows seen from outside, glowing warm (used as the paint's emissive map)
export function makeWindowGlowTexture() {
  const W = 4096, H = 1024;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  const R = FUS.R, mPerV = TAU * R;
  const ww = (WIN.w / FUS.LEN) * W, wh = (WIN.h / mPerV) * H;
  const rng = mulberry32(83);
  for (const side of [1, -1]) for (const row of WIN_ROWS) {
    const th = Math.acos(row.y / R);
    const vc = ((side > 0 ? th : TAU - th) / TAU) * H;
    for (const x of row.xs) {
      const px = U(x) * W;
      const shade = rng();                       // a few blinds down, a few dimmer
      const a = shade < 0.12 ? 0.12 : shade < 0.3 ? 0.55 : 1;
      g.fillStyle = `rgba(255,236,206,${a})`;
      rr(g, px - ww / 2, vc - wh / 2, ww, wh, ww * 0.48); g.fill();
    }
  }
  const t = finish(c, {});
  t.flipY = false;
  return t;
}

// ---------------------------------------------------------------------------
// Carpet / floor
// ---------------------------------------------------------------------------
export function makeCarpetTexture(base = '#c29d6c', seed = 3) {
  const S = 512;
  const c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  const rng = mulberry32(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 22;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.8));
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(80,55,30,0.06)';
  g.lineWidth = 6;
  for (let k = -S; k < S * 2; k += 32) {
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke();
  }
  return finish(c, { repeat: true });
}

// ---------------------------------------------------------------------------
// Tileable value-noise (fbm) — used for cloud wisps
// ---------------------------------------------------------------------------
export function makeWispTexture(size = 512, seed = 11, { lo = 0.42, hi = 0.78 } = {}) {
  const rng = mulberry32(seed);
  const grids = [];
  const periods = [4, 8, 16, 32, 64];
  for (const p of periods) {
    const arr = new Float32Array(p * p);
    for (let i = 0; i < arr.length; i++) arr[i] = rng();
    grids.push({ p, arr });
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = ({ p, arr }, x, y) => {
    const fx = x * p, fy = y * p;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    const i00 = arr[(y0 % p) * p + (x0 % p)];
    const i10 = arr[(y0 % p) * p + ((x0 + 1) % p)];
    const i01 = arr[((y0 + 1) % p) * p + (x0 % p)];
    const i11 = arr[((y0 + 1) % p) * p + ((x0 + 1) % p)];
    return (i00 * (1 - tx) + i10 * tx) * (1 - ty) + (i01 * (1 - tx) + i11 * tx) * ty;
  };
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0, amp = 0.5, tot = 0;
      for (const gr of grids) { n += sample(gr, x / size, y / size) * amp; tot += amp; amp *= 0.55; }
      n /= tot;
      const a = THREE.MathUtils.smoothstep(n, lo, hi);
      const i = (y * size + x) * 4;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return finish(c, { repeat: true, srgb: false });
}

// ---------------------------------------------------------------------------
// Engine fan face
// ---------------------------------------------------------------------------
export function makeFanTexture() {
  const S = 512;
  const c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#0d0f12';
  g.fillRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  for (let i = 0; i < 22; i++) {
    g.rotate((Math.PI * 2) / 22);
    const grad = g.createLinearGradient(0, 0, S / 2, 0);
    grad.addColorStop(0, '#3a3f46');
    grad.addColorStop(1, '#181b20');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(30, -4);
    g.quadraticCurveTo(S * 0.3, -26, S / 2, -18);
    g.lineTo(S / 2, 4);
    g.quadraticCurveTo(S * 0.3, -6, 30, 6);
    g.closePath();
    g.fill();
  }
  return finish(c, {});
}

// ---------------------------------------------------------------------------
// Make a photo tile seamlessly (two-pass offset blend) so the cloud deck can scroll forever
// ---------------------------------------------------------------------------
export function makeSeamlessCanvas(img, maxSide = 2048) {
  let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = Math.min(1, maxSide / Math.max(w, h));
  w = Math.round(w * s); h = Math.round(h * s);
  const src = makeCanvas(w, h);
  src.getContext('2d').drawImage(img, 0, 0, w, h);

  const pass = (from, horizontal) => {
    const out = makeCanvas(w, h), go = out.getContext('2d');
    if (horizontal) { go.drawImage(from, w / 2, 0); go.drawImage(from, -w / 2, 0); }
    else { go.drawImage(from, 0, h / 2); go.drawImage(from, 0, -h / 2); }
    const m = makeCanvas(w, h), gm = m.getContext('2d');
    gm.drawImage(from, 0, 0);
    gm.globalCompositeOperation = 'destination-in';
    const gr = horizontal ? gm.createLinearGradient(0, 0, w, 0) : gm.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.28, 'rgba(0,0,0,1)');
    gr.addColorStop(0.72, 'rgba(0,0,0,1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    gm.fillStyle = gr;
    gm.fillRect(0, 0, w, h);
    go.drawImage(m, 0, 0);
    return out;
  };
  return pass(pass(src, true), false);
}

// ===========================================================================
// Cabin interior in the Safar livery language
// ===========================================================================

// Faceted panel (white → sky blue → azure), used for bulkheads, suite walls, feature walls.
export function makeFacetPanelTexture({ size = 512, seed = 3, strength = 1, cols = 6, rows = 6 } = {}) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const stops = [[0, [246, 250, 253]], [0.35, [214, 236, 250]], [0.65, [150, 204, 242]], [1, [86, 166, 230]]];
  g.fillStyle = '#eef6fc';
  g.fillRect(0, 0, size, size);
  paintFacets(g, 0, 0, size, size, cols, rows, (cx, cy, rng) => {
    // gradient runs diagonally across the panel, lighter at the top
    let t = ((cx / size) * 0.55 + (cy / size) * 0.45) * strength + (rng() - 0.5) * 0.28;
    let col = ramp(stops, t);
    if (rng() < 0.25) col = mixRgb(col, [252, 253, 255], 0.35);
    return [...col, 1];
  }, { seed, jitter: 0.85 });
  const t = finish(c, {});
  return t;
}

// The same panel with the SAFAR wordmark in white across the middle (bulkhead walls).
export function makeBulkheadLogoTexture(mark, { size = 1024 } = {}) {
  const base = makeFacetPanelTexture({ size, seed: 9, strength: 1.15, cols: 7, rows: 7 });
  if (mark) {
    const c = base.image, g = c.getContext('2d');
    const logo = tint(mark, '#ffffff');
    const w = size * 0.72, h = w * (logo.height / logo.width);
    g.save();
    g.shadowColor = 'rgba(10,60,110,0.35)';
    g.shadowBlur = size * 0.01;
    g.drawImage(logo, (size - w) / 2, size * 0.42 - h / 2, w, h);
    g.restore();
    base.needsUpdate = true;
  }
  return base;
}

// Cabin carpet: soft blue-grey low-poly facets with a fine woven grain.
export function makeFacetCarpetTexture({ size = 512, seed = 5 } = {}) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const a = [186, 184, 180], b = [204, 202, 198], sky = [158, 196, 226];
  g.fillStyle = 'rgb(194,192,188)';
  g.fillRect(0, 0, size, size);
  paintFacets(g, 0, 0, size, size, 5, 5, (cx, cy, rng) => {
    let col = mixRgb(a, b, rng());
    if (rng() < 0.12) col = mixRgb(col, sky, 0.5);
    return [...col, 1];
  }, { seed, jitter: 0.8, wrapX: true });
  // woven grain
  const img = g.getImageData(0, 0, size, size), d = img.data;
  const rng = mulberry32(seed + 11);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 16;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
  return finish(c, { repeat: true });
}

// Aisle runner: navy carpet with faint facets and a woven SAFAR inlay once per tile.
// One tile = 8 m of aisle along u, the runner width along v.
export function makeRunnerTexture(mark, { w = 2048, h = 160 } = {}) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#1b2f52';
  g.fillRect(0, 0, w, h);
  paintFacets(g, 0, 0, w, h, 16, 2, (cx, cy, rng) => {
    const base = [27, 47, 82], hi = [36, 66, 112];
    const col = mixRgb(base, hi, rng() * 0.8);
    return [...col, 1];
  }, { seed: 31, jitter: 0.8, wrapX: true });
  if (mark) {
    const logo = tint(mark, '#7cc6ee');
    const lh = h * 0.56, lw = lh * (logo.width / logo.height) * (0.45 / h) * (w / 8);
    g.globalAlpha = 0.9;
    g.drawImage(logo, w * 0.08, (h - lh) / 2, lw, lh);
    g.globalAlpha = 1;
  }
  const img = g.getImageData(0, 0, w, h), d = img.data;
  const rng = mulberry32(17);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 12;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = finish(c, { repeat: true });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Soft contact-shadow blob (black, alpha in a rounded-rectangle falloff).
export function makeBlobTexture(size = 128) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = Math.abs((x + 0.5) / size * 2 - 1), v = Math.abs((y + 0.5) / size * 2 - 1);
      const r = Math.pow(Math.pow(u, 4) + Math.pow(v, 4), 0.25);   // superellipse
      const a = Math.pow(THREE.MathUtils.clamp(1 - r, 0, 1), 1.6);
      const i = (y * size + x) * 4;
      d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return finish(c, { srgb: false });
}

// Seat-back / suite screen: the Safar welcome screen (navy to Safar blue, soft facets,
// white wordmark and the route), used as an emissive map so the screens glow in the cabin.
export function makeScreenTexture(mark, { w = 512, h = 320, route = 'JNB  ·  JED' } = {}) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, '#071a33');
  grd.addColorStop(0.55, '#0b4a78');
  grd.addColorStop(1, '#1597c4');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  paintFacets(g, 0, 0, w, h, 6, 4, (cx, cy, rng) => [255, 255, 255, 0.015 + rng() * 0.06], { seed: 17, jitter: 0.8 });
  // horizon glow
  const hg = g.createRadialGradient(w * 0.7, h * 1.05, 0, w * 0.7, h * 1.05, h * 0.9);
  hg.addColorStop(0, 'rgba(160,230,255,0.35)');
  hg.addColorStop(1, 'rgba(160,230,255,0)');
  g.fillStyle = hg;
  g.fillRect(0, 0, w, h);
  if (mark) {
    const logo = tint(mark, '#ffffff');
    const lw = w * 0.46, lh = lw * (logo.height / logo.width);
    g.drawImage(logo, (w - lw) / 2, h * 0.4 - lh / 2, lw, lh);
  }
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.font = `600 ${Math.round(h * 0.06)}px InterVar, Inter, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Welcome aboard', w / 2, h * 0.64);
  g.fillStyle = 'rgba(190,236,255,0.75)';
  g.font = `500 ${Math.round(h * 0.045)}px InterVar, Inter, system-ui, sans-serif`;
  g.fillText(route, w / 2, h * 0.74);
  // thin progress line
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(w * 0.18, h * 0.86, w * 0.64, 2);
  g.fillStyle = 'rgba(166,236,255,0.9)';
  g.fillRect(w * 0.18, h * 0.86, w * 0.64 * 0.08, 2);
  return finish(c, {});
}

// ---------------------------------------------------------------------------
// Cabin furnishings (modelled on real widebody cabins, in Safar colours)
// ---------------------------------------------------------------------------

// Passenger service unit: one panel per seat row under the bins — reading lights, air
// nozzles and the seat-belt sign. Returns the colour map and an emissive map (lights glow).
export function makePsuTexture({ w = 512, h = 96 } = {}) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  const e = makeCanvas(w, h), ge = e.getContext('2d');
  g.fillStyle = '#e9edf1'; g.fillRect(0, 0, w, h);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, w, h);
  // panel joints at each end, a faint inset frame
  g.fillStyle = 'rgba(60,70,82,0.35)'; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
  g.strokeStyle = 'rgba(60,70,82,0.18)'; g.lineWidth = 2; rr(g, 14, 12, w - 28, h - 24, 10); g.stroke();
  const cy = h / 2;
  // reading lights (one per seat), the middle one switched on
  [0.16, 0.27, 0.38].forEach((u, i) => {
    const x = u * w;
    g.fillStyle = '#c9d0d8'; g.beginPath(); g.arc(x, cy, 15, 0, TAU); g.fill();
    g.fillStyle = '#f7f9fb'; g.beginPath(); g.arc(x, cy, 10, 0, TAU); g.fill();
    ge.fillStyle = i === 1 ? '#fff4dd' : '#3a3a36'; ge.beginPath(); ge.arc(x, cy, 10, 0, TAU); ge.fill();
  });
  // air nozzles
  [0.52, 0.61, 0.70].forEach((u) => {
    const x = u * w;
    g.fillStyle = '#9aa3ad'; g.beginPath(); g.arc(x, cy, 13, 0, TAU); g.fill();
    g.fillStyle = '#4b535c'; g.beginPath(); g.arc(x, cy, 7, 0, TAU); g.fill();
    g.fillStyle = '#20252b'; g.beginPath(); g.arc(x, cy, 3, 0, TAU); g.fill();
  });
  // seat-belt / no-smoking sign
  const sx = 0.8 * w, sw = 0.14 * w;
  g.fillStyle = '#1b222b'; rr(g, sx, cy - 18, sw, 36, 6); g.fill();
  ge.fillStyle = '#1b2633'; rr(ge, sx, cy - 18, sw, 36, 6); ge.fill();
  ge.strokeStyle = '#9fdcff'; ge.lineWidth = 3;
  ge.beginPath(); ge.arc(sx + sw * 0.3, cy, 9, 0, TAU); ge.stroke();                       // belt buckle
  ge.beginPath(); ge.moveTo(sx + sw * 0.3 - 14, cy); ge.lineTo(sx + sw * 0.3 + 14, cy); ge.stroke();
  ge.beginPath(); ge.arc(sx + sw * 0.72, cy, 9, 0, TAU); ge.stroke();                      // no smoking
  ge.beginPath(); ge.moveTo(sx + sw * 0.72 - 7, cy + 7); ge.lineTo(sx + sw * 0.72 + 7, cy - 7); ge.stroke();
  const map = finish(c, { repeat: true }), emissive = finish(e, { repeat: true });
  return { map, emissive };
}

// Lowered ceiling panels: off-white, a joint every 1.52 m, a speaker grille now and then.
export function makeCeilingTexture({ w = 512, h = 128 } = {}) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, w, h);
  const rng = mulberry32(51);
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(120,130,145,${0.012 + rng() * 0.02})`; g.fillRect(rng() * w, rng() * h, 2, 2); }
  g.fillStyle = 'rgba(70,80,95,0.28)'; g.fillRect(0, 0, 3, h);
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(3, 0, 2, h);
  g.fillStyle = 'rgba(80,90,105,0.22)';
  for (let k = 0; k < 18; k++) { g.beginPath(); g.arc(w * 0.62 + (k % 6) * 7, h * 0.46 + Math.floor(k / 6) * 7, 1.6, 0, TAU); g.fill(); }
  return finish(c, { repeat: true });
}

// Row numbers and seat letters on the edge of the bins, like the real thing.
// rows: [{ x, label }], the canvas spans x0..x1 (flip: canvas runs from x1 back to x0).
export function makeRowLabelTexture(rows, x0, x1, { pxPerM = 220, h = 56, flip = false } = {}) {
  const w = Math.min(4096, Math.ceil((x1 - x0) * pxPerM));
  const c = makeCanvas(w, h), g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.font = `650 ${Math.round(h * 0.5)}px InterVar, Inter, system-ui, sans-serif`;
  g.textBaseline = 'middle'; g.textAlign = 'center';
  for (const r of rows) {
    const px = ((flip ? x1 - r.x : r.x - x0) / (x1 - x0)) * w;
    g.fillStyle = 'rgba(16,28,46,0.82)';
    rr(g, px - h * 0.95, h * 0.16, h * 1.9, h * 0.68, h * 0.18); g.fill();
    g.fillStyle = '#eaf7ff';
    g.fillText(r.label, px, h * 0.52);
  }
  const t = finish(c, {});
  return t;
}

// Seat fabric: a fine Safar weave (light luminance pattern, tinted per seat by the seat colour)
export function makeSeatFabricTexture({ size = 256 } = {}) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  g.fillStyle = '#f4f6f9'; g.fillRect(0, 0, size, size);
  const rng = mulberry32(77);
  // woven threads
  for (let y = 0; y < size; y += 2) { g.fillStyle = `rgba(40,52,70,${0.035 + rng() * 0.04})`; g.fillRect(0, y, size, 1); }
  for (let x = 0; x < size; x += 3) { g.fillStyle = `rgba(40,52,70,${0.02 + rng() * 0.03})`; g.fillRect(x, 0, 1, size); }
  // small faceted diamonds, the Safar motif
  const n = 8, s = size / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const cx = (i + (j % 2) * 0.5) * s, cy = j * s + s / 2;
    g.fillStyle = `rgba(30,44,64,${0.06 + rng() * 0.05})`;
    g.beginPath(); g.moveTo(cx, cy - s * 0.32); g.lineTo(cx + s * 0.22, cy); g.lineTo(cx, cy + s * 0.32); g.lineTo(cx - s * 0.22, cy); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath(); g.moveTo(cx, cy - s * 0.32); g.lineTo(cx + s * 0.22, cy); g.lineTo(cx, cy); g.closePath(); g.fill();
  }
  return finish(c, { repeat: true });
}

// Diamond-quilted leather (Business and First): stitched seams with soft padding shadows.
export function makeQuiltTexture({ size = 512, cells = 6 } = {}) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  g.fillStyle = '#f6f4f1'; g.fillRect(0, 0, size, size);
  const s = size / cells;
  for (let j = -1; j <= cells; j++) for (let i = -1; i <= cells; i++) {
    const cx = (i + (j % 2 ? 0.5 : 0)) * s + s / 2, cy = j * s * 0.5 + s / 2;
    const grd = g.createRadialGradient(cx - s * 0.08, cy - s * 0.1, s * 0.05, cx, cy, s * 0.62);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(120,112,104,0.16)');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(cx, cy - s * 0.5); g.lineTo(cx + s * 0.5, cy); g.lineTo(cx, cy + s * 0.5); g.lineTo(cx - s * 0.5, cy); g.closePath(); g.fill();
  }
  // stitching
  g.strokeStyle = 'rgba(90,84,78,0.35)'; g.lineWidth = 1.2; g.setLineDash([4, 3]);
  for (let k = -cells; k <= cells * 2; k++) {
    g.beginPath(); g.moveTo(k * s, 0); g.lineTo(k * s + size, size); g.stroke();
    g.beginPath(); g.moveTo(k * s, size); g.lineTo(k * s + size, 0); g.stroke();
  }
  g.setLineDash([]);
  return finish(c, { repeat: true });
}

// Louvred sliding doors for the First suites (vertical slats, satin metal frame).
export function makeLouvreTexture({ w = 256, h = 512 } = {}) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#e9eef3'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c9d2db'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
  const top = h * 0.12, bot = h * 0.62;
  for (let x = 22; x < w - 18; x += 9) {
    g.fillStyle = '#1d2c47'; g.fillRect(x, top, 5, bot - top);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x, top, 1, bot - top);
  }
  g.strokeStyle = 'rgba(29,44,71,0.25)'; g.lineWidth = 2; g.strokeRect(18, top - 6, w - 36, bot - top + 12);
  return finish(c, {});
}

// The Milky Way for the night sky: an equirectangular glow along a tilted great circle, with a
// brighter core towards the galactic centre, mottled star clouds and the dark dust rift.
export function makeMilkyWayTexture(W = 1024, H = 512) {
  const rng = mulberry32(1987);
  // 3D value noise on a hashed lattice (directions are used as coordinates, so no seam)
  const hash = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const vnoise = (x, y, z) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
    let r = 0;
    for (let c = 0; c < 8; c++) {
      const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
      r += hash(ix + dx, iy + dy, iz + dz) * (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
    }
    return r;
  };
  const fbm = (x, y, z, oct) => { let s = 0, a = 0.5, w = 0, f = 1; for (let o = 0; o < oct; o++) { s += vnoise(x * f, y * f, z * f) * a; w += a; a *= 0.5; f *= 2.03; } return s / w; };
  // galactic plane normal (tilted so the band arcs across the sky) and the centre direction
  const n = new THREE.Vector3(0.42, 0.55, -0.72).normalize();
  const c0 = new THREE.Vector3(1, 0, 0).sub(n.clone().multiplyScalar(n.x)).normalize();   // in-plane
  const img = new ImageData(W, H);
  const d = img.data;
  const v = new THREE.Vector3();
  void rng;
  for (let j = 0; j < H; j++) {
    const lat = (0.5 - (j + 0.5) / H) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < W; i++) {
      const lon = ((i + 0.5) / W - 0.5) * Math.PI * 2;
      v.set(cl * Math.cos(lon), sl, cl * Math.sin(lon));
      const b = Math.asin(Math.max(-1, Math.min(1, v.dot(n))));          // galactic latitude
      const toward = (v.dot(c0) + 1) * 0.5;                             // 1 at the centre, 0 opposite
      const wide = Math.exp(-(b * b) / (2 * 0.2 * 0.2));
      const core = Math.exp(-(b * b) / (2 * 0.07 * 0.07));
      const clouds = fbm(v.x * 6 + 3.1, v.y * 6 + 7.7, v.z * 6 + 1.3, 5);
      const fine = fbm(v.x * 24, v.y * 24, v.z * 24, 3);
      let glow = wide * (0.25 + 0.75 * Math.pow(toward, 2.2)) * (0.45 + 0.9 * clouds) + core * (0.35 + 0.65 * Math.pow(toward, 3)) * (0.5 + 0.8 * fine);
      // dust rift: dark lanes along the centre line, broken up by noise
      const rift = Math.exp(-((b - 0.012) * (b - 0.012)) / (2 * 0.022 * 0.022)) * Math.max(0, fbm(v.x * 11 + 9, v.y * 11, v.z * 11 + 4, 4) * 1.6 - 0.45);
      glow *= 1 - Math.min(0.85, rift * 1.4);
      glow = Math.max(0, glow);
      const warm = Math.pow(toward, 3) * core;                           // the centre is slightly warmer
      const k = Math.min(1, glow * 0.62);
      const o = (j * W + i) * 4;
      d[o] = Math.round(255 * k * (0.86 + 0.14 * warm));
      d[o + 1] = Math.round(255 * k * (0.88 + 0.04 * warm));
      d[o + 2] = Math.round(255 * k * (1.0 - 0.12 * warm));
      d[o + 3] = 255;
    }
  }
  const c = makeCanvas(W, H);
  c.getContext('2d').putImageData(img, 0, 0);
  const t = finish(c, {});
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
