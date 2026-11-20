// The flight deck interior, built from code and placed from the windscreen cut into the nose, so
// it fits each aircraft: the pilots' eyes sit level with the bottom of the front windows, the
// glareshield just under the glass and the main panel 75 cm ahead of the eyes, as on a real
// flight deck. Two pilot seats on their floor rails (sheepskin covers, armrests, harness), side
// consoles with sidesticks and tillers, rudder pedals, the main panel (flight and navigation
// displays in front of each pilot, engine and systems displays in the middle, a standby
// instrument and the gear lever), the glareshield with the autopilot and display control panels,
// the centre pedestal (keypads, thrust, flap and speed-brake levers, engine switches, radio
// panels), the overhead panel, window frames and posts, and the door at the back.
// Local frame: x forward from the seats, y up from the flight-deck floor, z to the right.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const C = { green: '#3df06e', cyan: '#3ad2ff', amber: '#ffae1a', white: '#eef2f5', magenta: '#ff52f2', yellow: '#ffdc2e', red: '#ff3b30', tape: '#3a4047' };
const MONO = '"SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
const SANS = 'Inter, "Helvetica Neue", Arial, sans-serif';

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function txt(g, s, x, y, size, color, align = 'left', weight = 600, font = MONO) {
  g.font = `${weight} ${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y);
}
function line(g, x0, y0, x1, y1, color, w = 2) { g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }

// ---------------------------------------------------------------- display pages (512 x 384)
function drawPFD(g, W, H) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  // flight mode annunciator
  for (const x of [102, 204, 306, 408]) line(g, x, 6, x, 42, '#69707a', 2);
  txt(g, 'MACH', 51, 18, 15, C.green, 'center');
  txt(g, 'ALT CRZ', 153, 18, 15, C.green, 'center');
  txt(g, 'NAV', 255, 18, 15, C.green, 'center');
  txt(g, 'AP1', 460, 12, 13, C.white, 'center'); txt(g, '1 FD 2', 460, 26, 13, C.white, 'center'); txt(g, 'A/THR', 460, 40, 13, C.white, 'center');
  // attitude
  const ax = 130, ay = 62, aw = 228, ah = 252, cx = ax + aw / 2, cy = ay + ah / 2, ppd = 7.6, hy = cy + 2.5 * ppd;
  g.save(); rr(g, ax, ay, aw, ah, 16); g.clip();
  let gr = g.createLinearGradient(0, ay, 0, hy); gr.addColorStop(0, '#1b64b8'); gr.addColorStop(1, '#3b8ee0');
  g.fillStyle = gr; g.fillRect(ax, ay, aw, hy - ay);
  gr = g.createLinearGradient(0, hy, 0, ay + ah); gr.addColorStop(0, '#9b6533'); gr.addColorStop(1, '#6a421e');
  g.fillStyle = gr; g.fillRect(ax, hy, aw, ay + ah - hy);
  line(g, ax, hy, ax + aw, hy, C.white, 2);
  for (let d = -20; d <= 20; d += 2.5) {
    if (!d) continue;
    const y = hy - d * ppd, big = d % 10 === 0, w = big ? 66 : d % 5 === 0 ? 38 : 18;
    line(g, cx - w / 2, y, cx + w / 2, y, C.white, 2);
    if (big) { txt(g, String(Math.abs(d)), cx - w / 2 - 15, y, 13, C.white, 'center'); txt(g, String(Math.abs(d)), cx + w / 2 + 15, y, 13, C.white, 'center'); }
  }
  g.restore();
  // roll scale and index
  g.strokeStyle = C.white; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 112, Math.PI * 1.5 - 0.79, Math.PI * 1.5 + 0.79); g.stroke();
  for (const a of [-45, -30, -20, -10, 10, 20, 30, 45]) {
    const t = (a - 90) * Math.PI / 180, r1 = Math.abs(a) >= 30 ? 125 : 119;
    line(g, cx + Math.cos(t) * 112, cy + Math.sin(t) * 112, cx + Math.cos(t) * r1, cy + Math.sin(t) * r1, C.white, 2);
  }
  g.fillStyle = C.yellow; g.beginPath(); g.moveTo(cx, cy - 110); g.lineTo(cx - 9, cy - 95); g.lineTo(cx + 9, cy - 95); g.closePath(); g.fill();
  // aircraft symbol (black outline, yellow fill)
  for (const [w, col] of [[8, '#000'], [4, C.yellow]]) {
    g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'miter';
    g.beginPath(); g.moveTo(cx - 84, cy); g.lineTo(cx - 36, cy); g.lineTo(cx - 36, cy + 13); g.stroke();
    g.beginPath(); g.moveTo(cx + 84, cy); g.lineTo(cx + 36, cy); g.lineTo(cx + 36, cy + 13); g.stroke();
  }
  g.fillStyle = '#000'; g.fillRect(cx - 6, cy - 6, 12, 12); g.fillStyle = C.yellow; g.fillRect(cx - 3, cy - 3, 6, 6);
  // speed tape
  const sx = 56, sw = 64, spd = 282, ppk = 4.2;
  g.fillStyle = C.tape; g.fillRect(sx, ay, sw, ah);
  g.save(); g.beginPath(); g.rect(sx, ay, sw, ah); g.clip();
  for (let v = 220; v <= 340; v += 5) {
    const y = cy - (v - spd) * ppk;
    line(g, sx + sw - (v % 10 ? 8 : 14), y, sx + sw, y, C.white, 2);
    if (v % 20 === 0) txt(g, String(v), sx + sw - 18, y, 15, C.white, 'right');
  }
  g.fillStyle = C.magenta; const ty = cy - (290 - spd) * ppk;
  g.beginPath(); g.moveTo(sx + sw, ty); g.lineTo(sx + sw + 10, ty - 7); g.lineTo(sx + sw + 10, ty + 7); g.closePath(); g.fill();
  g.restore();
  g.fillStyle = C.yellow; g.fillRect(sx - 6, cy - 2, sw + 16, 4);
  txt(g, '.84', sx + sw / 2, ay + ah + 16, 16, C.green, 'center');
  // altitude tape
  const lx = 372, lw = 62, alt = 37000, ppf = 0.11;
  g.fillStyle = C.tape; g.fillRect(lx, ay, lw, ah);
  g.save(); g.beginPath(); g.rect(lx, ay, lw, ah); g.clip();
  for (let a = 35800; a <= 38200; a += 100) {
    const y = cy - (a - alt) * ppf;
    line(g, lx, y, lx + (a % 500 ? 7 : 12), y, C.white, 2);
    if (a % 500 === 0) txt(g, String(a / 100), lx + 18, y, 15, C.white, 'left');
  }
  g.restore();
  g.fillStyle = '#000'; g.fillRect(lx - 2, cy - 16, lw + 22, 32);
  g.strokeStyle = C.yellow; g.lineWidth = 2; g.strokeRect(lx - 2, cy - 16, lw + 22, 32);
  txt(g, '370', lx + 6, cy, 20, C.green, 'left', 700); txt(g, '00', lx + 52, cy, 14, C.green, 'left');
  txt(g, 'FL370', lx + lw / 2, ay - 9, 14, C.cyan, 'center');
  txt(g, 'STD', lx + lw / 2, ay + ah + 16, 16, C.cyan, 'center');
  // vertical speed
  const vx = 446;
  g.fillStyle = C.tape; g.beginPath(); g.moveTo(vx, ay + 30); g.lineTo(vx + 30, ay + 64); g.lineTo(vx + 30, ay + ah - 64); g.lineTo(vx, ay + ah - 30); g.closePath(); g.fill();
  for (const [lab, dy] of [['1', 34], ['2', 62], ['6', 98]]) for (const s of [-1, 1]) { line(g, vx + 2, cy + s * dy, vx + 10, cy + s * dy, C.white, 2); txt(g, lab, vx + 14, cy + s * dy, 11, '#b8bec6', 'left'); }
  line(g, vx + 2, cy, vx + 12, cy, C.yellow, 3);
  line(g, vx + 40, cy, vx + 6, cy, C.green, 3);
  // heading tape
  const tY = ay + ah + 8, hdg = 45, pph = 7.5;
  g.fillStyle = C.tape; g.fillRect(ax, tY, aw, 40);
  g.save(); g.beginPath(); g.rect(ax, tY, aw, 40); g.clip();
  for (let d = 10; d <= 80; d += 5) {
    const x = cx + (d - hdg) * pph;
    line(g, x, tY, x, tY + (d % 10 ? 7 : 12), C.white, 2);
    if (d % 10 === 0) txt(g, String(d / 10).padStart(2, '0'), x, tY + 26, 15, C.white, 'center');
  }
  g.restore();
  g.fillStyle = C.yellow; g.fillRect(cx - 2, tY - 6, 4, 20);
}

function drawND(g, W, H) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H - 36, R = 286, hdg = 45;
  g.strokeStyle = C.white; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2 - 0.87, -Math.PI / 2 + 0.87); g.stroke();
  for (let d = hdg - 50; d <= hdg + 50; d += 5) {
    const a = (d - hdg - 90) * Math.PI / 180, l = d % 10 ? 9 : 16;
    line(g, cx + Math.cos(a) * R, cy + Math.sin(a) * R, cx + Math.cos(a) * (R - l), cy + Math.sin(a) * (R - l), C.white, 2);
    if (d % 10 === 0) {
      const n = ((d % 360) + 360) % 360;
      txt(g, String(n / 10), cx + Math.cos(a) * (R - 32), cy + Math.sin(a) * (R - 32), n % 30 === 0 ? 19 : 14, C.white, 'center', 600, SANS);
    }
  }
  g.fillStyle = C.yellow; g.fillRect(cx - 2, cy - R - 16, 4, 22);
  g.setLineDash([7, 9]); g.strokeStyle = '#d6dbe0'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(cx, cy, R / 2, -Math.PI / 2 - 0.9, -Math.PI / 2 + 0.9); g.stroke(); g.setLineDash([]);
  txt(g, '40', cx - R * 0.42, cy - R * 0.22, 13, C.cyan, 'center');
  txt(g, '80', cx - R * 0.8, cy - R * 0.5, 13, C.cyan, 'center');
  // the route ahead
  const wp = [[cx, cy], [cx + 22, cy - 112], [cx + 66, cy - 205], [cx + 140, cy - 278]];
  g.strokeStyle = C.green; g.lineWidth = 3; g.beginPath(); wp.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  [['OKPOB', C.white], ['RUDAX', C.green], ['KANEL', C.green]].forEach(([n, col], i) => {
    const [x, y] = wp[i + 1];
    g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 7, y); g.lineTo(x, y + 7); g.lineTo(x - 7, y); g.closePath(); g.stroke();
    txt(g, n, x + 13, y, 14, col, 'left', 700);
  });
  // a little weather off the right of track
  g.fillStyle = 'rgba(40,200,80,0.55)'; for (const [x, y, r] of [[cx + 150, cy - 150, 16], [cx + 166, cy - 140, 12], [cx + 140, cy - 136, 10]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(240,210,40,0.7)'; g.beginPath(); g.arc(cx + 154, cy - 146, 6, 0, Math.PI * 2); g.fill();
  // own aircraft
  for (const [w, col] of [[6, '#000'], [3, C.yellow]]) {
    g.strokeStyle = col; g.lineWidth = w;
    g.beginPath(); g.moveTo(cx, cy - 16); g.lineTo(cx, cy + 14); g.moveTo(cx - 15, cy - 4); g.lineTo(cx + 15, cy - 4); g.moveTo(cx - 6, cy + 12); g.lineTo(cx + 6, cy + 12); g.stroke();
  }
  txt(g, 'GS', 14, 18, 14, C.white); txt(g, '488', 42, 18, 16, C.green, 'left', 700);
  txt(g, 'TAS', 90, 18, 14, C.white); txt(g, '492', 124, 18, 16, C.green, 'left', 700);
  txt(g, '285°/62', 14, 40, 15, C.green);
  g.save(); g.translate(30, 66); g.rotate(4.97); line(g, -12, 0, 12, 0, C.green, 2); line(g, 12, 0, 6, -5, C.green, 2); line(g, 12, 0, 6, 5, C.green, 2); g.restore();
  txt(g, 'OKPOB', W - 14, 18, 16, C.white, 'right', 700);
  txt(g, '052°', W - 14, 38, 15, C.green, 'right');
  txt(g, '45 NM', W - 14, 58, 15, C.green, 'right');
  txt(g, '14:32', W - 14, 78, 15, C.green, 'right');
}

function drawEWD(g, W, H, n) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const xs = n === 4 ? [66, 184, 328, 446] : [128, 384], r = n === 4 ? 44 : 60;
  const gauge = (x, y, rad, val, digits) => {
    const a0 = Math.PI * 0.78, a1 = Math.PI * 2.08, a = a0 + (a1 - a0) * val;
    g.strokeStyle = C.white; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, rad, a0, a1 - 0.14); g.stroke();
    g.strokeStyle = C.red; g.lineWidth = 4; g.beginPath(); g.arc(x, y, rad, a1 - 0.14, a1); g.stroke();
    for (let k = 0; k <= 5; k++) { const t = a0 + (a1 - a0) * k / 5; line(g, x + Math.cos(t) * rad, y + Math.sin(t) * rad, x + Math.cos(t) * (rad - 7), y + Math.sin(t) * (rad - 7), C.white, 2); }
    line(g, x + Math.cos(a) * rad * 0.2, y + Math.sin(a) * rad * 0.2, x + Math.cos(a) * (rad + 4), y + Math.sin(a) * (rad + 4), C.green, 3.5);
    g.strokeStyle = '#8a9099'; g.lineWidth = 1.5; g.strokeRect(x + 2, y + 6, rad * 0.95, rad * 0.42);
    txt(g, digits, x + 2 + rad * 0.9, y + 6 + rad * 0.21, Math.round(rad * 0.36), C.green, 'right', 700);
  };
  const lx = n === 4 ? W / 2 : W / 2;
  xs.forEach((x, i) => { gauge(x, 82, r, 0.81 - i * 0.004, (84.2 - i * 0.3).toFixed(1)); gauge(x, 184, r * 0.7, 0.58, String(612 - i * 7)); });
  txt(g, 'N1', lx, 72, 13, C.white, 'center'); txt(g, '%', lx, 88, 12, C.cyan, 'center');
  txt(g, 'EGT', lx, 176, 13, C.white, 'center'); txt(g, '°C', lx, 192, 12, C.cyan, 'center');
  xs.forEach((x, i) => { txt(g, (94.6 - i * 0.2).toFixed(1), x, 246, n === 4 ? 15 : 19, C.green, 'center', 700); txt(g, String(2840 - i * 30), x, 274, n === 4 ? 15 : 19, C.green, 'center', 700); });
  txt(g, 'N2 %', lx, 246, 12, C.white, 'center'); txt(g, 'FF', lx, 268, 12, C.white, 'center'); txt(g, 'KG/H', lx, 282, 11, C.cyan, 'center');
  line(g, 12, 300, W - 12, 300, '#7d848c', 2);
  txt(g, 'SEAT BELTS', 24, 322, 15, C.green); txt(g, 'NO SMOKING', 24, 344, 15, C.green); txt(g, 'NO PORTABLE DEVICES', 24, 366, 13, C.green);
  txt(g, 'FOB :', 330, 322, 15, C.white); txt(g, '84200', 388, 322, 16, C.green, 'left', 700); txt(g, 'KG', 456, 322, 13, C.cyan);
  txt(g, 'FLAP', 330, 352, 13, C.white); g.fillStyle = C.green; g.fillRect(380, 348, 30, 4);
}

function drawSD(g, W, H) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  txt(g, 'CRUISE', W / 2, 22, 17, C.white, 'center', 700); line(g, W / 2 - 40, 34, W / 2 + 40, 34, C.white, 2);
  txt(g, 'ENG', 30, 58, 15, C.white, 'left', 700); line(g, 30, 68, 64, 68, C.white, 1.5);
  txt(g, 'F.USED', 40, 92, 13, C.white); txt(g, '1+2', 40, 110, 12, C.cyan); txt(g, '12620', 150, 100, 18, C.green, 'right', 700); txt(g, 'KG', 158, 100, 12, C.cyan);
  txt(g, 'OIL', 40, 140, 13, C.white); txt(g, 'QT', 40, 158, 12, C.cyan); txt(g, '18.5', 112, 148, 17, C.green, 'right', 700); txt(g, '18.0', 172, 148, 17, C.green, 'right', 700);
  txt(g, 'AIR', 280, 58, 15, C.white, 'left', 700); line(g, 280, 68, 312, 68, C.white, 1.5);
  [['LDG ELEV', 'AUTO', '1050', 'FT'], ['ΔP', '', '8.1', 'PSI'], ['CAB V/S', '', '0', 'FT/MIN'], ['CAB ALT', '', '6200', 'FT']].forEach(([a, b, v, u], i) => {
    const y = 92 + i * 30; txt(g, a, 290, y, 13, C.white); if (b) txt(g, b, 380, y, 13, C.green); txt(g, v, 450, y, 17, C.green, 'right', 700); txt(g, u, 456, y, 11, C.cyan);
  });
  txt(g, 'TEMP', 40, 236, 13, C.white); txt(g, '°C', 84, 236, 12, C.cyan);
  [['CKPT', '22'], ['FWD', '23'], ['AFT', '22']].forEach(([a, v], i) => { txt(g, a, 140 + i * 110, 236, 13, C.white); txt(g, v, 196 + i * 110, 236, 17, C.green, 'right', 700); });
  line(g, 10, 300, W - 10, 300, '#7d848c', 2);
  txt(g, 'TAT  -28 °C', 20, 324, 14, C.green); txt(g, 'SAT  -56 °C', 20, 350, 14, C.green);
  txt(g, 'GMT 14 H 32', W / 2, 336, 15, C.green, 'center', 700);
  txt(g, 'GW', 360, 324, 13, C.white); txt(g, '241300', 470, 336, 17, C.green, 'right', 700); txt(g, 'KG', 476, 336, 12, C.cyan);
}

function drawISIS(g, W, H) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2;
  g.save(); rr(g, 50, 30, W - 100, H - 60, 10); g.clip();
  g.fillStyle = '#2f82d6'; g.fillRect(0, 0, W, cy + 6); g.fillStyle = '#8c5b2c'; g.fillRect(0, cy + 6, W, H);
  line(g, 0, cy + 6, W, cy + 6, C.white, 2);
  for (const d of [-10, -5, 5, 10]) line(g, cx - (d % 10 ? 10 : 20), cy + 6 - d * 4, cx + (d % 10 ? 10 : 20), cy + 6 - d * 4, C.white, 2);
  g.restore();
  g.fillStyle = C.tape; g.fillRect(4, 30, 42, H - 60); g.fillRect(W - 46, 30, 42, H - 60);
  txt(g, '282', 25, cy, 13, C.white, 'center', 700); txt(g, '370', W - 25, cy, 13, C.white, 'center', 700);
  for (const [w, col] of [[6, '#000'], [3, C.yellow]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(cx - 40, cy); g.lineTo(cx - 14, cy); g.moveTo(cx + 14, cy); g.lineTo(cx + 40, cy); g.stroke(); }
  txt(g, 'STD', cx, H - 14, 13, C.cyan, 'center');
}

// ---------------------------------------------------------------- panels drawn in pairs: colour and lit parts
function pair(w, h) {
  const base = makeCanvas(w, h), glow = makeCanvas(w, h);
  const b = base.getContext('2d'), e = glow.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, w, h);
  return { base, glow, b, e };
}
function screw(g, x, y, r = 4) {
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  gr.addColorStop(0, '#9aa1aa'); gr.addColorStop(1, '#3a4048');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  line(g, x - r * 0.6, y, x + r * 0.6, y, '#2a2f35', 1);
}
function knob(g, x, y, r, angle = -0.6) {
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(x + 2, y + 3, r + 1, 0, Math.PI * 2); g.fill();
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  gr.addColorStop(0, '#6d757e'); gr.addColorStop(1, '#1d2126');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#0d0f12'; g.lineWidth = 1.5; g.stroke();
  line(g, x, y, x + Math.cos(angle) * r * 0.85, y + Math.sin(angle) * r * 0.85, '#f0f3f5', Math.max(1.5, r * 0.14));
}
function pushbutton(P, x, y, s, top, bottom, { lit = null, litColor = C.white } = {}) {
  const { b, e } = P;
  b.fillStyle = '#5b636c'; rr(b, x - 2, y - 2, s + 4, s + 4, 4); b.fill();
  b.fillStyle = '#16191d'; rr(b, x, y, s, s, 3); b.fill();
  b.fillStyle = 'rgba(255,255,255,0.06)'; b.fillRect(x + 2, y + 2, s - 4, s * 0.35);
  const f = Math.max(7, Math.round(s * 0.24));
  if (top) txt(b, top, x + s / 2, y + s * 0.3, f, 'rgba(255,174,26,0.32)', 'center', 700, SANS);
  if (bottom) txt(b, bottom, x + s / 2, y + s * 0.72, f, 'rgba(240,244,248,0.38)', 'center', 700, SANS);
  if (lit === 'top' && top) txt(e, top, x + s / 2, y + s * 0.3, f, C.amber, 'center', 700, SANS);
  if (lit === 'bottom' && bottom) { txt(b, bottom, x + s / 2, y + s * 0.72, f, litColor, 'center', 700, SANS); txt(e, bottom, x + s / 2, y + s * 0.72, f, litColor, 'center', 700, SANS); }
}
function toggle(g, x, y, up = true) {
  g.fillStyle = '#1a1e22'; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
  const gr = g.createLinearGradient(x - 3, 0, x + 3, 0); gr.addColorStop(0, '#d9dde1'); gr.addColorStop(1, '#7a8088');
  g.fillStyle = gr; g.fillRect(x - 2.5, up ? y - 16 : y, 5, 16);
  g.fillStyle = '#eef1f4'; g.beginPath(); g.arc(x, up ? y - 16 : y + 16, 4, 0, Math.PI * 2); g.fill();
}
function panelBox(g, x, y, w, h, title) {
  g.strokeStyle = 'rgba(232,236,240,0.55)'; g.lineWidth = 2; rr(g, x, y, w, h, 8); g.stroke();
  if (title) {
    g.font = `700 13px ${SANS}`; const tw = g.measureText(title).width + 14;
    g.fillStyle = '#434a53'; g.fillRect(x + w / 2 - tw / 2, y - 8, tw, 16);
    txt(g, title, x + w / 2, y, 13, '#eef2f5', 'center', 700, SANS);
  }
}
function lcd(P, x, y, w, h, s, size, color = C.amber) {
  P.b.fillStyle = '#0b0d0c'; P.b.fillRect(x, y, w, h);
  P.b.strokeStyle = '#2b3036'; P.b.lineWidth = 2; P.b.strokeRect(x, y, w, h);
  txt(P.b, s, x + w / 2, y + h / 2 + 1, size, color, 'center', 700);
  txt(P.e, s, x + w / 2, y + h / 2 + 1, size, color, 'center', 700);
}

// the face of the glareshield: the two display control panels and the autopilot panel between them
function makeGlareshieldFace(halfW) {
  const PX = 1280, w = Math.round(halfW * 2 * PX), h = 128;
  const P = pair(w, h), { b } = P;
  b.fillStyle = '#16181b'; b.fillRect(0, 0, w, h);
  const zx = (z) => (z + halfW) * PX;
  // display control panels, one per pilot
  for (const side of [-1, 1]) {
    const x0 = zx(side < 0 ? -halfW + 0.04 : halfW - 0.34), pw = 0.30 * PX;
    b.fillStyle = '#3f464f'; rr(b, x0, 8, pw, h - 16, 6); b.fill();
    lcd(P, x0 + 14, 22, 70, 26, 'STD', 17);
    txt(b, 'QNH', x0 + 49, 62, 10, '#e9edf0', 'center', 700, SANS);
    knob(b, x0 + 49, 92, 16, -1.2);
    ['CSTR', 'WPT', 'VOR', 'NDB', 'ARPT'].forEach((l, i) => pushbutton(P, x0 + 102 + i * 34, 20, 26, '', l));
    knob(b, x0 + 140, 90, 18, side < 0 ? -2.4 : -0.7); txt(b, 'ARC', x0 + 140, 64, 9, '#e9edf0', 'center', 700, SANS);
    knob(b, x0 + 228, 90, 18, -1.6); txt(b, '80', x0 + 228, 64, 9, '#e9edf0', 'center', 700, SANS);
    pushbutton(P, x0 + 262, 74, 26, 'FD', '', { lit: 'top' });
  }
  // autopilot panel (FCU)
  const fw = 0.86 * PX, f0 = zx(0) - fw / 2;
  b.fillStyle = '#3f464f'; rr(b, f0, 6, fw, h - 12, 6); b.fill();
  const win = [['SPD', 'MACH', '- - -', 0.08], ['HDG', 'TRK', '- - -', 0.30], ['ALT', 'LVL/CH', '37000', 0.56], ['V/S', 'FPA', '- - - - -', 0.80]];
  for (const [a, c2, s, t] of win) {
    const x = f0 + fw * t;
    txt(b, a, x - 24, 18, 11, '#eef2f5', 'center', 700, SANS); txt(b, c2, x + 24, 18, 11, '#eef2f5', 'center', 700, SANS);
    lcd(P, x - 52, 28, 104, 30, s, 18);
    knob(b, x, 90, 20, -1.57);
    P.e.fillStyle = C.amber; P.e.beginPath(); P.e.arc(x + 40, 43, 3, 0, Math.PI * 2); P.e.fill();
  }
  [['AP1', true], ['AP2', false], ['A/THR', true]].forEach(([l, on], i) => {
    const x = f0 + fw * 0.385 + i * 46, y = 70;
    pushbutton(P, x, y, 38, '', l);
    if (on) { P.b.fillStyle = C.green; P.b.fillRect(x + 8, y + 5, 22, 4); P.e.fillStyle = C.green; P.e.fillRect(x + 8, y + 5, 22, 4); }
  });
  ['LOC', 'EXPED', 'APPR'].forEach((l, i) => pushbutton(P, f0 + fw * 0.66 + i * 40, 74, 32, '', l));
  return P;
}

// the pedestal's top (canvas top = front): a recess for the systems display, the systems
// control buttons, two keypads, the thrust quadrant, engine switches and the radio panels
export const PED = { sd: [0, 250], thrust: { CL: 762 / 1024, slot: [690, 856] }, eng: 903 / 1024, brake: 0.82, flap: 0.69 };
function makePedestalTop(nEng) {
  const w = 512, h = 1024, P = pair(w, h), { b, e } = P;
  b.fillStyle = '#3f464f'; b.fillRect(0, 0, w, h);
  b.fillStyle = '#15181c'; rr(b, 112, 8, 288, 236, 10); b.fill();
  for (const y of [254, 360, 672, 872, 934]) line(b, 0, y, w, y, '#262b31', 3);
  ['ENG', 'BLEED', 'PRESS', 'ELEC', 'HYD', 'FUEL', 'APU', 'COND', 'DOOR', 'WHEEL', 'F/CTL', 'ALL'].forEach((l, i) => pushbutton(P, 20 + (i % 6) * 70, 266 + Math.floor(i / 6) * 46, 38, '', l));
  pushbutton(P, 452, 266, 38, 'CLR', ''); pushbutton(P, 452, 312, 38, '', 'STS');
  // two keypads, drawn at full size and squeezed to fit
  for (const k of [0, 1]) {
    for (const g of [b, e]) { g.save(); g.translate(10 + k * 252, 368); g.scale(1, 0.88); }
    const cw = 240;
    b.fillStyle = '#2f353c'; rr(b, 0, 0, cw, 340, 10); b.fill();
    b.fillStyle = '#050605'; b.fillRect(30, 12, cw - 60, 120);
    const L = (str, row, col = C.green, al = 'left') => { const y = 22 + row * 14, xx = al === 'left' ? 36 : al === 'right' ? cw - 36 : cw / 2; txt(b, str, xx, y, 11, col, al, 700); txt(e, str, xx, y, 11, col, al, 700); };
    L('FROM', 0, C.white); L('SAF001', 0, C.white, 'right');
    L('JNB', 1); L('1432', 1, C.green, 'center'); L('FL370', 1, C.green, 'right');
    L('OKPOB', 3); L('1458', 3, C.green, 'center'); L('FL370', 3, C.green, 'right');
    L('RUDAX', 5); L('1521', 5, C.green, 'center'); L('FL370', 5, C.green, 'right');
    L('KANEL', 7, C.white); L('1548', 7, C.white, 'center'); L('FL370', 7, C.white, 'right');
    for (let r = 0; r < 6; r++) for (const sd of [0, 1]) { b.fillStyle = '#c8ccd1'; b.fillRect(sd ? cw - 24 : 8, 24 + r * 18, 16, 8); }
    ['DIR', 'PROG', 'PERF', 'INIT', 'DATA', 'F-PLN', 'RAD', 'FUEL', 'SEC', 'ATC', 'MENU', 'AIRP'].forEach((l, i) => {
      const x = 10 + (i % 6) * 38, y = 144 + Math.floor(i / 6) * 26;
      b.fillStyle = '#d9dde1'; rr(b, x, y, 34, 20, 3); b.fill(); txt(b, l, x + 17, y + 11, 8, '#16191d', 'center', 700, SANS);
    });
    [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].forEach((ch, i) => {
      const x = 96 + (i % 5) * 28, y = 202 + Math.floor(i / 5) * 22;
      b.fillStyle = '#d9dde1'; rr(b, x, y, 24, 18, 3); b.fill(); txt(b, ch, x + 12, y + 10, 10, '#16191d', 'center', 700, SANS);
    });
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '±'].forEach((ch, i) => {
      const x = 12 + (i % 3) * 26, y = 202 + Math.floor(i / 3) * 26;
      b.fillStyle = '#d9dde1'; rr(b, x, y, 22, 22, 11); b.fill(); txt(b, ch, x + 11, y + 12, 11, '#16191d', 'center', 700, SANS);
    });
    for (const g of [b, e]) g.restore();
  }
  // thrust quadrant
  b.fillStyle = '#23282e'; rr(b, 150, 680, 212, 186, 10); b.fill();
  const lz = Array.from({ length: nEng }, (_, i) => 256 + (i - (nEng - 1) / 2) * (nEng > 2 ? 44 : 64));
  for (const x of lz) { b.fillStyle = '#0c0e10'; rr(b, x - 6, 690, 12, 166, 6); b.fill(); }
  [['TO GA', 694], ['FLX MCT', 728], ['CL', 762], ['0', 812], ['REV', 850]].forEach(([l, y]) => { txt(b, l, 146, y, 11, '#eef2f5', 'right', 700, SANS); line(b, 150, y, 162, y, '#eef2f5', 2); });
  b.fillStyle = '#0c0e10'; rr(b, 44, 690, 12, 160, 6); b.fill(); rr(b, 456, 690, 12, 160, 6); b.fill();
  [['RET', 836], ['1/2', 770], ['FULL', 702]].forEach(([l, y]) => txt(b, l, 66, y, 10, '#eef2f5', 'left', 700, SANS));
  [['0', 702], ['1', 736], ['2', 770], ['3', 804], ['FULL', 840]].forEach(([l, y]) => txt(b, l, 446, y, 10, '#eef2f5', 'right', 700, SANS));
  txt(b, 'SPEED BRAKE', 22, 684, 9, '#eef2f5', 'left', 700, SANS); txt(b, 'FLAPS', 490, 684, 9, '#eef2f5', 'right', 700, SANS);
  // engine master switches
  lz.forEach((x, i) => {
    txt(b, `ENG ${i + 1}`, x, 882, 10, '#eef2f5', 'center', 700, SANS);
    b.fillStyle = '#16191d'; rr(b, x - 16, 892, 32, 24, 4); b.fill();
    txt(b, 'FIRE', x, 904, 8, 'rgba(255,59,48,0.35)', 'center', 700, SANS);
  });
  txt(b, 'ON', 256, 892, 9, '#eef2f5', 'center', 700, SANS); txt(b, 'OFF', 256, 916, 9, '#eef2f5', 'center', 700, SANS);
  // radio panels
  for (const k of [0, 1]) {
    const x0 = 10 + k * 252;
    b.fillStyle = '#2f353c'; rr(b, x0, 942, 240, 76, 8); b.fill();
    lcd(P, x0 + 12, 950, 100, 26, k ? '121.500' : '118.705', 15);
    lcd(P, x0 + 128, 950, 100, 26, k ? '123.450' : '121.800', 15);
    ['VHF1', 'VHF2', 'VHF3', 'HF1', 'HF2', 'AM'].forEach((l, i) => pushbutton(P, x0 + 12 + i * 38, 984, 28, '', l));
  }
  for (const [x, y] of [[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8]]) screw(b, x, y, 4);
  return P;
}

// the overhead panel, laid out in labelled panels as on a real airliner
function makeOverhead() {
  const w = 1024, h = 1024, P = pair(w, h), { b } = P;
  b.fillStyle = '#434a53'; b.fillRect(0, 0, w, h);
  const rows = [
    [['EXT LT', 300, 'toggles', ['STROBE', 'BEACON', 'WING', 'NAV', 'RWY', 'LAND', 'NOSE']], ['APU', 150, 'pbs', [['FAULT', 'MASTER'], ['AVAIL', 'START']]], ['SIGNS', 190, 'toggles', ['SEAT BELTS', 'NO SMOKING', 'EXIT']], ['INT LT', 180, 'knobs', ['OVHD', 'DOME']]],
    [['ANTI ICE', 230, 'pbs', [['FAULT', 'WING'], ['FAULT', 'ENG 1'], ['FAULT', 'ENG 2']]], ['CABIN PRESS', 300, 'mixed', [['FAULT', 'MODE'], ['', 'DITCH']]], ['WIPER', 140, 'knobs', ['WIPER']], ['CALLS', 180, 'pbs', [['', 'MECH'], ['', 'ALL'], ['', 'FWD']]]],
    [['AIR COND', 470, 'mixed', [['FAULT', 'PACK 1'], ['FAULT', 'BLEED 1'], ['FAULT', 'APU BLEED'], ['FAULT', 'BLEED 2'], ['FAULT', 'PACK 2']]], ['ELEC', 450, 'pbs', [['FAULT', 'BAT 1'], ['FAULT', 'BAT 2'], ['FAULT', 'GEN 1'], ['', 'BUS TIE'], ['FAULT', 'GEN 2'], ['AVAIL', 'EXT PWR']]]],
    [['FUEL', 470, 'pbs', [['FAULT', 'L1'], ['FAULT', 'L2'], ['FAULT', 'CTR L'], ['FAULT', 'CTR R'], ['FAULT', 'R1'], ['FAULT', 'R2']]], ['HYD', 450, 'pbs', [['FAULT', 'ENG 1'], ['FAULT', 'ELEC'], ['FAULT', 'PTU'], ['FAULT', 'ENG 2']]]],
    [['FIRE', 470, 'fire', null], ['ADIRS', 450, 'knobs', ['IR 1', 'IR 3', 'IR 2']]],
  ];
  let y = 24;
  const rowH = (h - 40) / rows.length;
  rows.forEach((row, ri) => {
    let x = 18;
    const total = row.reduce((a, r) => a + r[1], 0), scale = (w - 36 - (row.length - 1) * 16) / total;
    for (const [title, pw0, kind, items] of row) {
      const pw = pw0 * scale, ph = rowH - 28, y0 = y + 10;
      panelBox(b, x, y0, pw, ph, title);
      const n = items ? items.length : 2, step = pw / n;
      if (kind === 'toggles') items.forEach((l, i) => { const cx = x + step * (i + 0.5); toggle(b, cx, y0 + ph * 0.55, i % 3 !== 1); txt(b, l, cx, y0 + ph * 0.88, 9, '#eef2f5', 'center', 700, SANS); });
      if (kind === 'knobs') items.forEach((l, i) => { const cx = x + step * (i + 0.5); knob(b, cx, y0 + ph * 0.52, Math.min(20, ph * 0.22), -1.1 - i * 0.4); txt(b, l, cx, y0 + ph * 0.88, 10, '#eef2f5', 'center', 700, SANS); });
      if (kind === 'pbs' || kind === 'mixed') {
        const s = Math.min(46, step - 14, ph * 0.5);
        items.forEach(([tp, bt], i) => {
          const cx = x + step * (i + 0.5);
          pushbutton(P, cx - s / 2, y0 + ph * 0.24, s, tp, '', {});
          txt(b, bt, cx, y0 + ph * 0.84, 10, '#eef2f5', 'center', 700, SANS);
        });
        if (kind === 'mixed') knob(b, x + pw - 30, y0 + ph * 0.5, 14, -0.8);
      }
      if (kind === 'fire') {
        for (let i = 0; i < 3; i++) {
          const cx = x + pw * (0.2 + i * 0.3), fy = y0 + ph * 0.2;
          b.fillStyle = '#b3141a'; rr(b, cx - 44, fy, 88, 46, 8); b.fill();
          b.fillStyle = 'rgba(255,255,255,0.18)'; b.fillRect(cx - 40, fy + 4, 80, 10);
          txt(b, ['ENG 1', 'APU', 'ENG 2'][i], cx, fy + 18, 12, '#ffffff', 'center', 800, SANS);
          txt(b, 'FIRE', cx, fy + 34, 11, '#ffffff', 'center', 800, SANS);
          pushbutton(P, cx - 40, fy + 58, 36, 'DISCH', 'AGENT 1'); pushbutton(P, cx + 4, fy + 58, 36, 'DISCH', 'AGENT 2');
        }
      }
      x += pw + 16;
    }
    y += rowH;
  });
  // a couple of lights on: seat-belt sign and the battery
  P.e.fillStyle = 'rgba(255,255,255,0.0)';
  for (const [x, yy] of [[18, 18], [w - 18, 18], [18, h - 18], [w - 18, h - 18], [w / 2, 12], [w / 2, h - 12]]) screw(b, x, yy, 5);
  return P;
}

// the door at the back of the flight deck
function makeDoorTexture() {
  const w = 512, h = 1024, c = makeCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#525a64'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 6; rr(g, 96, 40, 320, 940, 18); g.stroke();
  g.fillStyle = '#4a525b'; rr(g, 102, 46, 308, 928, 16); g.fill();
  g.fillStyle = '#1b2026'; rr(g, 214, 150, 84, 120, 10); g.fill();               // viewing window
  g.fillStyle = 'rgba(160,190,220,0.25)'; rr(g, 222, 158, 68, 44, 8); g.fill();
  g.fillStyle = '#c9ced4'; rr(g, 360, 520, 22, 120, 10); g.fill();               // handle
  g.fillStyle = '#2a2f35'; g.fillRect(150, 700, 210, 70);
  txt(g, 'FLIGHT DECK', 255, 722, 20, '#e6eaee', 'center', 700, SANS); txt(g, 'CREW ONLY', 255, 750, 16, '#e6eaee', 'center', 700, SANS);
  for (let i = 0; i < 14; i++) for (let j = 0; j < 4; j++) { g.fillStyle = '#20252b'; g.beginPath(); g.arc(20 + j * 16, 120 + i * 30, 5, 0, Math.PI * 2); g.fill(); }   // circuit breakers
  return canvasTex(c);
}

function screenTexture(draw, w = 512, h = 384, ...args) {
  const c = makeCanvas(w, h); draw(c.getContext('2d'), w, h, ...args); return canvasTex(c);
}

// ---------------------------------------------------------------- build
export function buildFlightDeck({ FD, nEng, hwAt, roofAt, wsAt, wsPoly, wsDX }) {
  const root = new THREE.Group();
  root.name = 'flightDeckInterior';
  root.position.set(FD.seatX, FD.floor, 0);
  const X0 = FD.seatX, Y0 = FD.floor;
  const hw = (x, y) => hwAt(X0 + x, Y0 + y);              // inner half-width at a local point
  const roof = (x) => roofAt(X0 + x) - Y0;                 // inner roof height (local)
  const toLocal = (v) => v.clone().sub(new THREE.Vector3(X0, Y0, 0));

  const M = {
    panel: new THREE.MeshStandardMaterial({ color: 0x66707b, roughness: 0.72, metalness: 0.08 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.6, metalness: 0.1 }),
    glare: new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.96 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.58 }),
    fleece: new THREE.MeshStandardMaterial({ color: 0xcfc5b3, roughness: 1.0 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa1aa, roughness: 0.32, metalness: 0.85 }),
    webbing: new THREE.MeshStandardMaterial({ color: 0x353a42, roughness: 0.9 }),
    bezel: new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.45, metalness: 0.2 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x7a838e, roughness: 0.55, metalness: 0.15 }),
    lever: new THREE.MeshStandardMaterial({ color: 0x1e2227, roughness: 0.35, metalness: 0.3 }),
    knob: new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.4, metalness: 0.4 }),
  };
  const parts = new Map();
  const add = (mat, geo) => { if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(geo.index ? geo.toNonIndexed() : geo); };
  const rbox = (w, h, d, r = 0.02, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.05, h / 2.05, d / 2.05));
  const at = (geo, x, y, z, rz = 0, ry = 0, rx = 0) => { if (rx) geo.rotateX(rx); if (rz) geo.rotateZ(rz); if (ry) geo.rotateY(ry); geo.translate(x, y, z); return geo; };
  const screen = (tex, w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: true, color: 0xdfe6ee }));

  // ---- pilot seats on their rails
  const SEAT_Z = 0.55;
  for (const side of [-1, 1]) {
    const z = side * SEAT_Z;
    for (const k of [-1, 1]) add(M.metal, at(rbox(0.9, 0.025, 0.04, 0.008), 0.0, 0.0125, z + k * 0.17));
    add(M.dark, at(rbox(0.36, 0.3, 0.3, 0.03), 0.02, 0.17, z));
    add(M.metal, at(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 14), 0.02, 0.36, z));
    // cushion, sheepskin cover and side bolsters
    add(M.leather, at(rbox(0.5, 0.1, 0.5, 0.04), 0.05, 0.47, z));
    add(M.fleece, at(rbox(0.44, 0.04, 0.4, 0.018), 0.07, 0.535, z));
    for (const k of [-1, 1]) add(M.leather, at(rbox(0.44, 0.07, 0.06, 0.025), 0.06, 0.53, z + k * 0.225));
    // backrest, reclined a little, with its cover, wings, headrest and harness
    const back = new THREE.Group();
    back.position.set(-0.2, 0.5, z); back.rotation.z = 0.2;
    const bparts = [];
    const bp = (mat, geo) => bparts.push([mat, geo]);
    bp(M.leather, at(rbox(0.1, 0.74, 0.48, 0.04), 0, 0.37, 0));
    bp(M.fleece, at(rbox(0.035, 0.6, 0.38, 0.015), 0.06, 0.36, 0));
    for (const k of [-1, 1]) bp(M.leather, at(rbox(0.13, 0.5, 0.06, 0.025), 0.035, 0.32, k * 0.24));
    bp(M.leather, at(rbox(0.11, 0.2, 0.3, 0.05), 0.02, 0.88, 0));
    for (const k of [-1, 1]) bp(M.metal, at(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8), 0.0, 0.76, k * 0.08));
    for (const k of [-1, 1]) bp(M.webbing, at(rbox(0.012, 0.6, 0.045, 0.004), 0.082, 0.42, k * 0.09));
    for (const [mat, geo] of bparts) { geo.applyMatrix4(new THREE.Matrix4().compose(back.position, new THREE.Quaternion().setFromEuler(back.rotation), new THREE.Vector3(1, 1, 1))); add(mat, geo); }
    // lap belt and buckle
    for (const k of [-1, 1]) add(M.webbing, at(rbox(0.05, 0.012, 0.2, 0.004), -0.02, 0.56, z + k * 0.1));
    add(M.metal, at(new THREE.CylinderGeometry(0.035, 0.035, 0.015, 18), -0.02, 0.565, z));
    // armrests
    for (const k of [-1, 1]) {
      add(M.leather, at(rbox(0.34, 0.05, 0.075, 0.022), -0.02, 0.73, z + k * 0.29));
      add(M.metal, at(rbox(0.035, 0.2, 0.03, 0.008), -0.15, 0.63, z + k * 0.29));
    }
    // rudder pedals
    for (const k of [-1, 1]) {
      add(M.dark, at(rbox(0.04, 0.18, 0.1, 0.012), 0.74, 0.14, z + k * 0.12, 0.45));
      add(M.metal, at(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), 0.78, 0.06, z + k * 0.12, 0, 0, Math.PI / 2));
    }
    // side console with the sidestick, tiller and oxygen-mask box
    const cz = side * Math.min(1.02, hw(0.3, 0.66) - 0.16);
    add(M.panel, at(rbox(0.85, 0.66, 0.26, 0.03), 0.22, 0.33, cz));
    const ct = makeConsoleTop(side);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.26), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.7 }));
    top.rotation.x = -Math.PI / 2; top.position.set(0.22, 0.662, cz);
    root.add(top);
    add(M.dark, at(new THREE.CylinderGeometry(0.045, 0.06, 0.04, 20), 0.36, 0.68, cz));
    const grip = new THREE.LatheGeometry([[0, 0], [0.022, 0], [0.024, 0.04], [0.021, 0.09], [0.026, 0.13], [0.028, 0.16], [0.02, 0.18], [0, 0.185]].map(([r, y]) => new THREE.Vector2(r, y)), 18);
    add(M.lever, at(grip, 0.36, 0.69, cz, -0.18, 0, side * 0.1));
    add(M.knob, at(new THREE.CylinderGeometry(0.055, 0.055, 0.018, 24), 0.5, 0.675, cz - side * 0.02));
    add(M.metal, at(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), 0.53, 0.695, cz - side * 0.02));
    add(M.dark, at(rbox(0.2, 0.12, 0.14, 0.02), -0.08, 0.72, cz + side * 0.04));
  }

  // ---- glareshield height: just below the lowest edge of the front windows
  const GT = (wsAt(wsPoly[0][0] + wsDX, 30).y - Y0) - 0.06;
  const GTH = 0.11;                                          // its thickness at the lip

  // ---- main panel: two wings angled towards the pilots and the centre section, one row of
  // displays tucked under the glareshield
  const PANEL_X = FD.panelX - X0, PB = 0.36, PT = GT - GTH - 0.01, lean = 0.18;
  const panelH = PT - PB, pyc = (PB + PT) / 2;
  const hwP = Math.min(1.06, hw(PANEL_X, PT) - 0.05);
  const CW = 0.31;                                          // half width of the centre section
  const DW = 0.30, DH = 0.225;                              // display size (4:3)
  const DY = PT - 0.03 - DH / 2 - pyc;                      // display centre, relative to the panel
  const pfd = screenTexture(drawPFD), nd = screenTexture(drawND), ewd = screenTexture(drawEWD, 512, 384, nEng), sd = screenTexture(drawSD), isis = screenTexture(drawISIS, 256, 256);
  const section = (width, zc, yaw, build) => {
    const s = new THREE.Group();
    s.rotation.order = 'YZX'; s.rotation.set(0, yaw, -lean);
    s.position.set(PANEL_X, pyc, zc);
    const body = new THREE.Mesh(rbox(0.08, panelH, width, 0.012), M.panel);
    body.position.x = 0.04; s.add(body);
    build(s);
    root.add(s);
    return s;
  };
  const unit = (s, tex, z, y, w = DW, h = DH) => {
    const bz = new THREE.Mesh(rbox(0.03, h + 0.05, w + 0.05, 0.01), M.bezel);
    bz.position.set(-0.012, y, z); s.add(bz);
    const sc = screen(tex, w, h); sc.rotation.y = -Math.PI / 2; sc.position.set(-0.028, y, z); s.add(sc);
  };
  const wingW = hwP - CW, yaw = 0.13;
  for (const side of [-1, 1]) {
    // the inner edge meets the centre section; the outer end comes round towards the pilot
    const zc = side * (CW + (wingW / 2) * Math.cos(yaw));
    const s = section(wingW, zc, -side * yaw, (g) => {
      const outer = side * (wingW / 2 - DW / 2 - 0.04), inner = side * (-(wingW / 2) + DW / 2 + 0.04);
      unit(g, pfd, outer, DY);
      unit(g, nd, inner, DY);
      const kb = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 20), M.knob);
      kb.rotation.z = Math.PI / 2; kb.position.set(-0.012, DY - DH / 2 - 0.09, outer); g.add(kb);
    });
    s.position.x = PANEL_X - (wingW / 2) * Math.sin(yaw);
  }
  section(CW * 2, 0, 0, (g) => {
    unit(g, ewd, 0, DY);
    unit(g, isis, -0.245, DY + 0.05, 0.085, 0.085);
    for (let i = 0; i < 3; i++) { const bt = new THREE.Mesh(rbox(0.012, 0.026, 0.05, 0.005), M.bezel); bt.position.set(-0.01, DY - 0.03 - i * 0.034, -0.245); g.add(bt); }
    // landing gear lever with its wheel-shaped knob
    const slot = new THREE.Mesh(rbox(0.02, 0.16, 0.05, 0.008), M.dark); slot.position.set(-0.01, DY - 0.02, 0.245); g.add(slot);
    const lev = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 8), M.metal); lev.rotation.z = Math.PI / 2 - 0.5; lev.position.set(-0.045, DY - 0.07, 0.245); g.add(lev);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 22), new THREE.MeshStandardMaterial({ color: 0xe8ebee, roughness: 0.45 }));
    wheel.position.set(-0.085, DY - 0.09, 0.245); g.add(wheel);
  });
  // knee panel under the main panel, set back for the pilots' legs
  add(M.dark, at(rbox(0.06, PB, hwP * 2 - 0.1, 0.02), PANEL_X + 0.2, PB / 2, 0));

  // ---- glareshield: a padded shelf under the windscreen, tapering with the nose
  const gRear = PANEL_X - 0.08, gFront = wsPoly[0][0] + wsDX - X0 + 0.22;
  const pts = [];
  const N = 7;
  for (let i = 0; i <= N; i++) { const x = gRear + (gFront - gRear) * i / N; pts.push([x, Math.min(1.05, hw(x, GT) - 0.05)]); }
  const shape = new THREE.Shape();
  pts.forEach(([x, h], i) => (i ? shape.lineTo(x, h) : shape.moveTo(x, h)));
  for (let i = N; i >= 0; i--) shape.lineTo(pts[i][0], -pts[i][1]);
  shape.closePath();
  const bev = 0.025;
  const gGeo = new THREE.ExtrudeGeometry(shape, { depth: GTH - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 4 });
  gGeo.rotateX(-Math.PI / 2);                                  // shape (x, s) -> (x, up, -s)
  gGeo.translate(0, GT - (GTH - bev), 0);
  add(M.glare, gGeo);
  const gHalf = pts[0][1] - 0.02;
  const face = makeGlareshieldFace(gHalf);
  const fMat = new THREE.MeshStandardMaterial({ map: canvasTex(face.base), emissiveMap: canvasTex(face.glow), emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.6 });
  const fcu = new THREE.Mesh(new THREE.PlaneGeometry(gHalf * 2, 0.1), fMat);
  fcu.rotation.y = -Math.PI / 2; fcu.position.set(gRear - bev - 0.002, GT - GTH / 2, 0);
  root.add(fcu);
  for (const t of [0.08, 0.30, 0.56, 0.80]) {                  // autopilot knobs
    const kz = -0.43 + 0.86 * t;
    const kb = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.022, 20), M.knob);
    kb.rotation.z = Math.PI / 2; kb.position.set(gRear - bev - 0.012, GT - GTH / 2 - 0.02, kz); root.add(kb);
  }

  // ---- centre pedestal
  const pW = 0.25, pF = PANEL_X - 0.05, pR = -0.38, yF = 0.60, yR = 0.56;
  const prof = new THREE.Shape();
  prof.moveTo(pF, 0); prof.lineTo(pF, yF - 0.03); prof.lineTo(pF - 0.04, yF); prof.lineTo(pR + 0.04, yR); prof.lineTo(pR, yR - 0.04); prof.lineTo(pR, 0); prof.closePath();
  const pedGeo = new THREE.ExtrudeGeometry(prof, { depth: pW * 2, bevelEnabled: false });
  pedGeo.translate(0, 0, -pW);
  add(M.panel, pedGeo);
  const PT2 = makePedestalTop(nEng);
  const topGeo = new THREE.BufferGeometry();
  const xf = pF - 0.04, xr = pR + 0.04, ep = 0.002;
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute([xr, yR + ep, -pW, xr, yR + ep, pW, xf, yF + ep, pW, xf, yF + ep, -pW], 3));
  topGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  topGeo.setIndex([0, 1, 2, 0, 2, 3]);
  topGeo.computeVertexNormals();
  root.add(new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ map: canvasTex(PT2.base), emissiveMap: canvasTex(PT2.glow), emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.65 })));
  const onTop = (v) => [xf + (xr - xf) * v, yF + (yR - yF) * v];   // v: 0 front .. 1 rear (canvas top to bottom)
  // the systems display, tilted up towards the pilots at the front of the pedestal
  {
    const a = THREE.MathUtils.degToRad(22);
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(Math.cos(a), Math.sin(a), 0), new THREE.Vector3(-Math.sin(a), Math.cos(a), 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    const [x, y] = onTop(0.125);
    const n = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0);
    const housing = new THREE.Mesh(rbox(0.29, 0.23, 0.04, 0.012), M.bezel);
    housing.quaternion.copy(q); housing.position.set(x, y + 0.035, 0); root.add(housing);
    const sc = screen(sd, 0.24, 0.18); sc.quaternion.copy(q);
    sc.position.set(x, y + 0.035, 0).addScaledVector(n, 0.021); root.add(sc);
  }
  const leverZ = (i) => ((256 + (i - (nEng - 1) / 2) * (nEng > 2 ? 44 : 64)) / 512 - 0.5) * pW * 2;
  for (let i = 0; i < nEng; i++) {                              // thrust levers in the climb detent
    const [x, y] = onTop(PED.thrust.CL);
    add(M.metal, at(rbox(0.016, 0.17, 0.016, 0.005), x + 0.02, y + 0.08, leverZ(i), -0.3));
    add(M.lever, at(rbox(0.05, 0.035, 0.05, 0.014), x + 0.045, y + 0.165, leverZ(i)));
  }
  { // speed brake (left, retracted) and flaps (right, up)
    const [x1, y1] = onTop(PED.brake), [x2, y2] = onTop(PED.flap);
    const z1 = (50 / 512 - 0.5) * pW * 2, z2 = (462 / 512 - 0.5) * pW * 2;
    add(M.metal, at(rbox(0.012, 0.12, 0.012, 0.004), x1, y1 + 0.06, z1, 0.2));
    add(M.lever, at(rbox(0.04, 0.025, 0.03, 0.01), x1 - 0.012, y1 + 0.12, z1));
    add(M.metal, at(rbox(0.012, 0.12, 0.012, 0.004), x2, y2 + 0.06, z2, -0.1));
    const flap = new THREE.Shape(); flap.moveTo(0, 0); flap.quadraticCurveTo(0.03, 0.022, 0.07, 0.006); flap.lineTo(0.07, 0); flap.quadraticCurveTo(0.03, -0.01, 0, 0);
    const fg = new THREE.ExtrudeGeometry(flap, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
    add(M.fleece, at(fg, x2 - 0.03, y2 + 0.125, z2 - 0.02));
  }
  for (let i = 0; i < nEng; i++) {                              // engine master switches
    const [x, y] = onTop(PED.eng);
    add(M.knob, at(new THREE.CylinderGeometry(0.013, 0.015, 0.028, 14), x, y + 0.014, leverZ(i)));
  }

  // ---- overhead panel, following the roof
  {
    const xF = wsPoly[wsPoly.length - 1][0] + wsDX - X0 - 0.04, xRr = -0.5;
    const yF0 = roof(xF) - 0.05, yR0 = roof(xRr) - 0.1;
    const hF = Math.min(0.5, hw(xF, yF0) - 0.03), hR = Math.min(0.62, hw(xRr, yR0) - 0.03);
    const OH = makeOverhead();
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.Float32BufferAttribute([xRr, yR0, -hR, xRr, yR0, hR, xF, yF0, hF, xF, yF0, -hF], 3));
    og.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    og.setIndex([0, 1, 2, 0, 2, 3]);
    og.computeVertexNormals();
    const om = new THREE.MeshStandardMaterial({ map: canvasTex(OH.base), emissiveMap: canvasTex(OH.glow), emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.9, side: THREE.DoubleSide });
    root.add(new THREE.Mesh(og, om));
    // the ceiling liner behind the overhead panel, with two dome lights
    {
      const xs = [xRr, -0.8, -1.1, -1.4];
      const v = [], uvs = [], idx = [];
      xs.forEach((x, i) => {
        const y = i === 0 ? yR0 : roof(x) - 0.08, h = Math.min(0.75, hw(x, y) - 0.03);
        v.push(x, y, -h, x, y, h); uvs.push(0, i / 3, 1, i / 3);
        if (i) { const a2 = (i - 1) * 2; idx.push(a2, a2 + 2, a2 + 1, a2 + 1, a2 + 2, a2 + 3); }
      });
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      cg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      cg.setIndex(idx); cg.computeVertexNormals();
      root.add(new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: 0xaeb4ba, roughness: 0.85, side: THREE.DoubleSide })));
      for (const k of [-1, 1]) {
        const x = -0.9, y = roof(x) - 0.095;
        const dome = new THREE.Mesh(new THREE.CircleGeometry(0.055, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.96, 0.88).multiplyScalar(1.4) }));
        dome.rotation.x = Math.PI / 2; dome.position.set(x, y, k * 0.28); root.add(dome);
      }
    }
    // the panel's frame and a shallow box behind it, so it reads as a unit
    const len = Math.hypot(xF - xRr, yF0 - yR0), ang = Math.atan2(yF0 - yR0, xF - xRr);
    for (const k of [-1, 1]) {
      const g = rbox(len, 0.05, 0.04, 0.012);
      g.rotateZ(ang); g.translate((xF + xRr) / 2, (yF0 + yR0) / 2 + 0.01, k * ((hF + hR) / 2 + 0.01));
      add(M.frame, g);
    }
  }

  // ---- window frames and posts, on the openings cut in the nose
  {
    const tube = (pts2, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts2), Math.max(8, pts2.length * 3), r, 8, false);
    const along = (a, b, side, steps = 10, inset = 0.035) => Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps, x = a[0] + (b[0] - a[0]) * t + wsDX, d = a[1] + (b[1] - a[1]) * t;
      return toLocal(wsAt(x, side * d, inset));
    });
    const P2 = wsPoly;
    for (const side of [-1, 1]) {
      for (let i = 0; i < P2.length - 1; i++) add(M.frame, tube(along(P2[i], P2[i + 1], side), 0.024));
      add(M.frame, tube(along([33.38, 30], [32.55, 29], side, 8, 0.04), 0.038));      // between front and side windows
      add(M.frame, tube(along([32.75, 50], [32.33, 38.6], side, 8, 0.04), 0.032));    // between the two side windows
    }
    add(M.frame, tube(along([32.9, 0], [33.38, 0], 1, 6, 0.045), 0.04));             // centre post
    const top = toLocal(wsAt(32.95 + wsDX, 0, 0.12));                               // standby compass
    add(M.dark, at(rbox(0.07, 0.055, 0.075, 0.012), top.x, top.y - 0.02, 0));
    // sun visors folded up at the top of each front window
    for (const side of [-1, 1]) {
      const a = toLocal(wsAt(32.8 + wsDX, side * 14, 0.09)), b = toLocal(wsAt(32.6 + wsDX, side * 26, 0.09));
      const vis = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.12), new THREE.MeshStandardMaterial({ color: 0x1e2a33, transparent: true, opacity: 0.7, roughness: 0.2, side: THREE.DoubleSide }));
      vis.position.copy(a).add(b).multiplyScalar(0.5);
      vis.lookAt(vis.position.clone().add(new THREE.Vector3(-0.3, -1, 0)));
      root.add(vis);
    }
  }

  // ---- back wall with the flight-deck door (only when there is room behind the jump seat)
  {
    const bx = Math.max(FD.back - X0 + 0.02, -1.42);
    if (bx > FD.back - X0 + 0.01) {
      const hW = hw(bx, 0.9) - 0.02, hT = roof(bx) - 0.02;
      const sh = new THREE.Shape();
      const n = 24, pts3 = [];
      for (let i = 0; i <= n; i++) { const y = hT * i / n; pts3.push([Math.min(hW, hw(bx, y) - 0.02), y]); }
      pts3.forEach(([w2, y], i) => (i ? sh.lineTo(w2, y) : sh.moveTo(w2, y)));
      for (let i = n; i >= 0; i--) sh.lineTo(-pts3[i][0], pts3[i][1]);
      sh.closePath();
      const wg = new THREE.ShapeGeometry(sh, 2); wg.rotateY(Math.PI / 2); wg.translate(bx, 0, 0);
      root.add(new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x4d555f, roughness: 0.8, side: THREE.DoubleSide })));
      const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.9), new THREE.MeshStandardMaterial({ map: makeDoorTexture(), roughness: 0.7 }));
      door.rotation.y = Math.PI / 2; door.position.set(bx + 0.006, 0.97, 0);
      root.add(door);
    }
  }

  for (const [mat, list] of parts) {
    const m = new THREE.Mesh(mergeGeometries(list, false), mat);
    m.castShadow = true; m.receiveShadow = true;
    root.add(m);
  }
  root.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  // a soft, neutral flood light from the overhead, as the flight deck's own lighting
  const flood = new THREE.PointLight(0xfff3e4, 2.0, 4.5, 2);
  flood.position.set(-0.55, Math.min(1.5, roof(-0.55) - 0.4), 0);
  root.add(flood);
  return {
    group: root,
    // where a pilot's eyes are, for a view from the captain's seat
    captainEye: new THREE.Vector3(X0 - 0.08, Y0 + 1.2, -SEAT_Z),
  };
}

// the top of a side console: the sidestick boot, tiller, a table stowage and a few labels
function makeConsoleTop(side) {
  const w = 512, h = 160, c = makeCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#48505a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; rr(g, 6, 6, w - 12, h - 12, 10); g.stroke();
  // u runs along x (rear to front), v across (side to side)
  g.fillStyle = '#2b3037'; g.beginPath(); g.arc(w * 0.66, h / 2, 44, 0, Math.PI * 2); g.fill();
  txt(g, 'PRIORITY', w * 0.4, h * 0.3, 14, '#e8ecef', 'center', 700, SANS);
  g.fillStyle = '#16191d'; rr(g, w * 0.34, h * 0.42, 70, 34, 5); g.fill();
  txt(g, 'TILLER', w * 0.88, h * 0.2, 12, '#e8ecef', 'center', 700, SANS);
  for (let i = 0; i < 4; i++) screw(g, 30 + i * 18, h - 26, 3);
  const t = canvasTex(c);
  if (side > 0) { t.center.set(0.5, 0.5); t.rotation = Math.PI; }
  return t;
}
