// Seatback screens: one animated canvas shown on every screen in the cabin. It cycles through a
// welcome page, the moving map of this route (Africa, the Red Sea, Arabia and Türkiye drawn in
// code from simplified coastlines), flight information and the destination.
import * as THREE from 'three';
import { CONFIG, ROUTE } from './config.js';

// simplified coastlines, [longitude, latitude]
const LAND = [
  // Africa
  [[-17, 21], [-16.5, 15], [-12, 9], [-8, 4.5], [-2, 5], [4, 6.3], [9, 4], [9.5, 1], [12, -5], [13.3, -12], [11.8, -17], [14.5, -22.5], [15.5, -27], [18.4, -34.2], [20, -34.8], [25.6, -34], [28, -32.8], [31, -29.6], [32.9, -26], [35.5, -23.8], [35.3, -21], [34.8, -19.8], [40, -15.8], [40.6, -10.5], [39.3, -6.8], [39.2, -4.7], [41.6, -1.7], [44, 1.8], [47.6, 5.3], [51.2, 10.5], [51.3, 11.8], [44, 10.6], [43.2, 11.5], [42.6, 13], [40.8, 14.7], [38.6, 18], [37.2, 21], [35.8, 23.9], [34.6, 26.2], [32.6, 29.9], [32.3, 31.3], [29.9, 31.2], [25.2, 31.6], [20, 30.8], [19.9, 32.2], [15.2, 32.3], [11.1, 33.3], [10.9, 35.6], [11, 37.1], [8.6, 36.9], [3.1, 36.8], [-1.9, 35.1], [-5.8, 35.8], [-6.8, 34], [-9.6, 30.4], [-13, 27.6]],
  // Madagascar
  [[49.3, -12], [50.4, -15.6], [49.6, -17.5], [48.2, -22], [47.1, -24.9], [45.2, -25.5], [43.7, -22.6], [44.4, -19.8], [44, -17.3], [46.4, -15.7], [48, -13.4]],
  // Arabia
  [[34.9, 29.5], [36, 27.8], [37.3, 25.4], [38.8, 22.6], [39.7, 20.2], [41.4, 17.7], [42.8, 15.3], [43.4, 12.7], [45, 12.8], [48.7, 14], [52.2, 15.7], [55.4, 17.7], [57.8, 19.2], [58.6, 20.8], [59.8, 22.5], [58.6, 23.6], [56.4, 24.9], [56.3, 26.2], [55.2, 25.4], [53.6, 24.1], [51.6, 24.3], [51.2, 26.1], [50.2, 25.6], [49.6, 26.9], [48.3, 28.8], [47.9, 30.1], [48.6, 30.4], [47.2, 31.3], [44.7, 33], [41, 34.4], [38.9, 35.9], [36, 36.4], [35.6, 34.6], [35.1, 32.9], [34.4, 31.5]],
  // Türkiye
  [[26.1, 40.1], [26.7, 41.3], [28.9, 41.3], [31.3, 41.1], [34.9, 42], [38, 41], [41.4, 41.4], [43.4, 41.1], [44.8, 39.7], [44.3, 37.2], [42.3, 37.1], [38.8, 36.7], [36.2, 36.6], [35.9, 36.3], [34.6, 36.8], [32.6, 36.1], [30.6, 36.7], [29.1, 36.7], [27.4, 37.1], [26.4, 38.4], [26.8, 39.5]],
  // southern Europe
  [[-9, 43], [-9.3, 38.7], [-8.9, 37], [-6.3, 36.5], [-4.4, 36.7], [-2, 36.8], [0.2, 38.8], [-0.3, 39.4], [3.1, 41.9], [3.2, 43.2], [6.5, 43.1], [8.9, 44.4], [10.4, 43.6], [12.5, 41.8], [15.7, 40], [16, 38], [17.1, 39.4], [18.5, 40.2], [16.2, 41.5], [13.9, 44.6], [13.6, 45.7], [15.2, 44.2], [19.4, 41.8], [19.6, 40.3], [21.1, 38.3], [22.7, 36.5], [24, 38], [23, 39.9], [24.4, 40.9], [26, 40.8], [28.2, 42.3], [28.6, 43.8], [29.7, 45.2], [28, 46.4], [22, 46.6], [16, 47], [9, 47.5], [3, 46.4], [-1.5, 43.4]],
  // Sinai and the Levant joining Arabia to Africa
  [[32.3, 31.3], [32.6, 29.9], [34.6, 27.9], [34.9, 29.5], [34.4, 31.5]],
];
const CITIES = [['Nairobi', 36.8, -1.3], ['Addis Ababa', 38.7, 9], ['Khartoum', 32.5, 15.6], ['Cairo', 31.2, 30], ['Riyadh', 46.7, 24.7], ['Harare', 31, -17.8], ['Kinshasa', 15.3, -4.3]];

export function createIFE() {
  const W = 512, H = 320;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  let logo = null;
  const im = new Image(); im.onload = () => { logo = tintWhite(im); }; im.src = 'assets/brand/safar-wordmark.png';
  const A = ROUTE.from.ll, B = ROUTE.to.ll;
  // map frame around the route
  const pad = 9;
  let x0 = Math.min(A[0], B[0]) - pad, x1 = Math.max(A[0], B[0]) + pad, y0 = Math.min(A[1], B[1]) - pad, y1 = Math.max(A[1], B[1]) + pad;
  const mapW = 336, mapH = H - 40, k = Math.min(mapW / (x1 - x0), mapH / (y1 - y0));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const P = (lon, lat) => [16 + mapW / 2 + (lon - cx) * k, 20 + mapH / 2 - (lat - cy) * k];
  // the route as a gentle great-circle-like arc
  const along = (t) => {
    const lon = A[0] + (B[0] - A[0]) * t, lat = A[1] + (B[1] - A[1]) * t;
    const bow = Math.sin(Math.PI * t) * 2.2;
    return [lon + bow * 0.6, lat + bow * 0.15];
  };
  let progress = 0.36, page = 0, pageT = 0, acc = 1;
  const PAGES = 4, DWELL = 8;
  function welcome() {
    bg('#071a33', '#0b4a78', '#1597c4');
    if (logo) { const lw = W * 0.44, lh = lw * (logo.height / logo.width); g.drawImage(logo, (W - lw) / 2, H * 0.36 - lh / 2, lw, lh); }
    text('Welcome aboard', W / 2, H * 0.62, 20, 'rgba(255,255,255,0.9)', 600, 'center');
    text(`${CONFIG.flight.number}  ·  ${CONFIG.flight.from.city} to ${CONFIG.flight.to.city}`, W / 2, H * 0.72, 14, 'rgba(190,236,255,0.85)', 500, 'center');
    text(CONFIG.brand.tagline || '', W / 2, H * 0.86, 11, 'rgba(190,236,255,0.6)', 500, 'center');
  }
  function map() {
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#061a33'); grd.addColorStop(1, '#0a2c4f');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.save(); g.beginPath(); g.rect(16, 20, mapW, mapH); g.clip();
    g.fillStyle = '#1b4d72'; g.strokeStyle = 'rgba(160,215,245,0.55)'; g.lineWidth = 1;
    for (const poly of LAND) { g.beginPath(); poly.forEach(([lo, la], i) => { const [x, y] = P(lo, la); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); g.fill(); g.stroke(); }
    g.fillStyle = 'rgba(200,230,250,0.6)'; g.font = '500 9px Inter, system-ui, sans-serif'; g.textAlign = 'left';
    for (const [n, lo, la] of CITIES) { const [x, y] = P(lo, la); if (x < 20 || x > 16 + mapW - 30) continue; g.fillRect(x - 1.2, y - 1.2, 2.4, 2.4); g.fillText(n, x + 4, y + 3); }
    // route: flown part solid, the rest dashed
    const pts = []; for (let i = 0; i <= 60; i++) pts.push(P(...along(i / 60)));
    const split = Math.round(progress * 60);
    g.setLineDash([4, 4]); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.6;
    g.beginPath(); pts.slice(split).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    g.setLineDash([]); g.strokeStyle = '#3fd0ff'; g.lineWidth = 2.6;
    g.beginPath(); pts.slice(0, split + 1).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    for (const [code, ll] of [[CONFIG.flight.from.code, A], [CONFIG.flight.to.code, B]]) {
      const [x, y] = P(...ll); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 3.4, 0, 6.3); g.fill();
      g.font = '700 11px Inter, system-ui, sans-serif'; g.fillText(code, x + 6, y - 5);
    }
    // the aircraft, pointing along the route
    const [px, py] = P(...along(progress)), [qx, qy] = P(...along(Math.min(1, progress + 0.01)));
    g.save(); g.translate(px, py); g.rotate(Math.atan2(qy - py, qx - px)); planeIcon(9); g.restore();
    g.restore();
    // information panel
    const ix = 16 + mapW + 14;
    g.fillStyle = 'rgba(255,255,255,0.06)'; roundRect(ix - 6, 20, W - ix - 10, mapH, 10); g.fill();
    const left = Math.max(0, ROUTE.mins * (1 - progress));
    const rows = [['Time to ' + CONFIG.flight.to.code, `${Math.floor(left / 60)}h ${String(Math.round(left % 60)).padStart(2, '0')}m`], ['Altitude', '37,000 ft'], ['Ground speed', '905 km/h'], ['Outside', '−56 °C'], ['Arrive', `${CONFIG.flight.to.time} local`]];
    rows.forEach(([l, v], i) => { text(l, ix + 4, 46 + i * 52, 10, 'rgba(190,225,245,0.7)', 500); text(v, ix + 4, 66 + i * 52, 16, '#ffffff', 650); });
  }
  function info() {
    bg('#081a30', '#0d3358', '#155a8a');
    text(`${CONFIG.flight.from.code}`, W * 0.2, H * 0.36, 44, '#fff', 750, 'center');
    text(`${CONFIG.flight.to.code}`, W * 0.8, H * 0.36, 44, '#fff', 750, 'center');
    text(CONFIG.flight.from.city, W * 0.2, H * 0.47, 12, 'rgba(190,236,255,0.8)', 500, 'center');
    text(CONFIG.flight.to.city, W * 0.8, H * 0.47, 12, 'rgba(190,236,255,0.8)', 500, 'center');
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(W * 0.32, H * 0.34, W * 0.36, 2);
    g.fillStyle = '#3fd0ff'; g.fillRect(W * 0.32, H * 0.34, W * 0.36 * progress, 2);
    g.save(); g.translate(W * 0.32 + W * 0.36 * progress, H * 0.34 + 1); planeIcon(10); g.restore();
    const left = Math.max(0, ROUTE.mins * (1 - progress));
    const cells = [['Flight', CONFIG.flight.number], ['Remaining', `${Math.floor(left / 60)}h ${String(Math.round(left % 60)).padStart(2, '0')}m`], ['Arrive', CONFIG.flight.to.time]];
    cells.forEach(([l, v], i) => { const x = W * (0.2 + i * 0.3); text(l, x, H * 0.68, 11, 'rgba(190,225,245,0.7)', 500, 'center'); text(v, x, H * 0.79, 19, '#fff', 650, 'center'); });
  }
  function destination() {
    const t = performance.now() / 1000;
    const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, '#f6c89a'); grd.addColorStop(0.5, '#e8907a'); grd.addColorStop(1, '#5a4f8c');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // a low sun and the skyline of minarets and domes, drawn simply
    const sx = W * 0.72, sy = H * 0.5 + Math.sin(t * 0.2) * 3;
    const sg = g.createRadialGradient(sx, sy, 4, sx, sy, 90); sg.addColorStop(0, 'rgba(255,245,220,0.95)'); sg.addColorStop(0.2, 'rgba(255,220,170,0.6)'); sg.addColorStop(1, 'rgba(255,200,150,0)');
    g.fillStyle = sg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(40,30,60,0.85)';
    const base = H * 0.78;
    g.fillRect(0, base, W, H - base);
    for (const [x, h, w] of [[60, 120, 10], [110, 90, 30], [170, 140, 9], [230, 70, 60], [320, 150, 11], [370, 95, 34], [440, 115, 9]]) {
      if (w < 14) { g.fillRect(x, base - h, w, h); g.beginPath(); g.moveTo(x - 2, base - h); g.lineTo(x + w / 2, base - h - 16); g.lineTo(x + w + 2, base - h); g.fill(); }
      else { g.fillRect(x, base - h * 0.5, w, h * 0.5); g.beginPath(); g.arc(x + w / 2, base - h * 0.5, w / 2, Math.PI, 0); g.fill(); }
    }
    text('Your journey to', 30, 54, 13, 'rgba(255,255,255,0.85)', 500);
    text(ROUTE.label === 'Makkah & Madinah' ? 'Makkah & Madinah' : ROUTE.to.city, 30, 84, 26, '#ffffff', 750);
    text(`Landing in ${ROUTE.to.city} at ${CONFIG.flight.to.time}`, 30, 108, 12, 'rgba(255,255,255,0.85)', 500);
  }
  const draw = [welcome, map, info, destination];
  function bg(a, b, cc) { const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, a); grd.addColorStop(0.55, b); grd.addColorStop(1, cc); g.fillStyle = grd; g.fillRect(0, 0, W, H); }
  function text(s, x, y, size, col, weight = 500, align = 'left') { g.font = `${weight} ${size}px InterVar, Inter, system-ui, sans-serif`; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y); }
  function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function planeIcon(s) { g.fillStyle = '#ffd34d'; g.beginPath(); g.moveTo(s, 0); g.lineTo(-s * 0.6, -s * 0.18); g.lineTo(-s * 0.2, -s * 0.9); g.lineTo(-s * 0.45, -s * 0.9); g.lineTo(-s * 0.95, -s * 0.15); g.lineTo(-s, 0); g.lineTo(-s * 0.95, s * 0.15); g.lineTo(-s * 0.45, s * 0.9); g.lineTo(-s * 0.2, s * 0.9); g.lineTo(-s * 0.6, s * 0.18); g.closePath(); g.fill(); }
  function tintWhite(img) { const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; const x = cv.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); return cv; }
  function render() {
    draw[page]();
    // fade between pages
    const fade = Math.min(1, pageT / 0.6);
    if (fade < 1) { g.fillStyle = `rgba(4,10,20,${1 - fade})`; g.fillRect(0, 0, W, H); }
    tex.needsUpdate = true;
  }
  render();
  return {
    texture: tex,
    get progress() { return progress; },
    setProgress(p) { progress = Math.max(0, Math.min(1, p)); },
    showMap() { page = 1; pageT = 0; },
    update(dt, active) {
      if (!active) return;                 // only redrawn while someone is looking at a screen
      progress = Math.min(1, progress + dt / (ROUTE.mins * 60));
      pageT += dt; acc += dt;
      if (pageT > DWELL) { page = (page + 1) % PAGES; pageT = 0; }
      if (acc > (pageT < 0.7 ? 0.05 : 0.2)) { acc = 0; render(); }
    },
  };
}
