// The airport for takeoff and landing: a 4 km runway with real markings (threshold bars, runway
// numbers, touchdown zones, centreline and edge lines), taxiways and an apron, the terminal with
// its glazing, the control tower and hangars, runway edge and approach lights, and the land
// around it (city lights at night). The runway runs along +x, centred on z = 0; the whole group
// is moved under the aircraft, which stays where it is.
import * as THREE from 'three';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function runwayTexture(numA, numB) {
  const W = 4096, H = 128;                      // 4000 m x 60 m: about 1 px per metre along
  const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#2b2d31'; g.fillRect(0, 0, W, H);
  // asphalt texture and rubber deposits in the touchdown zones
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 6, 1 + Math.random() * 2); }
  for (const x0 of [150, W - 750]) { const gr = g.createLinearGradient(x0, 0, x0 + 600, 0); gr.addColorStop(0, 'rgba(10,10,12,0)'); gr.addColorStop(0.5, 'rgba(10,10,12,0.45)'); gr.addColorStop(1, 'rgba(10,10,12,0)'); g.fillStyle = gr; g.fillRect(x0, H * 0.25, 600, H * 0.5); }
  g.fillStyle = '#e9e9e4';
  g.fillRect(0, 3, W, 2); g.fillRect(0, H - 5, W, 2);                    // edge lines
  for (let x = 160; x < W - 160; x += 60) g.fillRect(x, H / 2 - 1, 30, 2);   // centreline
  for (const [x0, dir] of [[8, 1], [W - 8, -1]]) {
    for (let i = 0; i < 8; i++) for (const k of [-1, 1]) g.fillRect(x0 + (dir > 0 ? 0 : -45), H / 2 + k * (8 + i * 6.2) - 2, 45, 3.6);   // threshold bars
    for (const d of [150, 300, 450]) for (const k of [-1, 1]) g.fillRect(x0 + dir * d - (dir > 0 ? 0 : 22), H / 2 + k * 16 - 3, 22, 6);     // touchdown zone
    for (const k of [-1, 1]) g.fillRect(x0 + dir * 400 - (dir > 0 ? 0 : 45), H / 2 + k * 18 - 5, 45, 10);                                   // aiming points
  }
  // runway numbers, written to read when you land on each end
  g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(90, H / 2); g.rotate(-Math.PI / 2); g.fillText(numA, 0, 0); g.restore();
  g.save(); g.translate(W - 90, H / 2); g.rotate(Math.PI / 2); g.fillText(numB, 0, 0); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function groundTexture(desert) {
  const S = 512, c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = desert ? '#b79a73' : '#5d6b4a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const r = 2 + Math.random() * 22, a = Math.random() * 0.12;
    g.fillStyle = desert ? `rgba(${Math.random() < 0.5 ? '120,95,65' : '215,195,160'},${a})` : `rgba(${Math.random() < 0.5 ? '70,85,50' : '120,125,85'},${a})`;
    g.beginPath(); g.arc(Math.random() * S, Math.random() * S, r, 0, 6.3); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
function glowTexture() {
  const c = canvas(64, 64), g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function buildAirport({ desert = false, numA = '03L', numB = '21R', isMobile = false } = {}) {
  const group = new THREE.Group();
  group.name = 'airport';
  const L = 4000, Wd = 60;
  // the land: a big disc, with the haze (scene fog) hiding its edge
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30000, 64), new THREE.MeshStandardMaterial({ map: groundTexture(desert), roughness: 1, color: 0xffffff }));
  ground.material.map.repeat.set(400, 400);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true;
  group.add(ground);
  // grass or sand strips around the runway, slightly different
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(L + 600, 300), new THREE.MeshStandardMaterial({ color: desert ? 0xa88b66 : 0x667852, roughness: 1 }));
  strip.rotation.x = -Math.PI / 2; strip.position.y = -0.03; strip.receiveShadow = true; group.add(strip);
  const runway = new THREE.Mesh(new THREE.PlaneGeometry(L, Wd), new THREE.MeshStandardMaterial({ map: runwayTexture(numA, numB), roughness: 0.85 }));
  runway.rotation.x = -Math.PI / 2; runway.receiveShadow = true; group.add(runway);
  // taxiway, links and apron
  const tarmac = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.9 });
  const yellow = new THREE.MeshBasicMaterial({ color: 0xd8b03a });
  const flat = (w, d, x, z, mat, y = 0.01) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; group.add(m); return m; };
  flat(L, 24, 0, 190, tarmac);
  flat(L, 0.5, 0, 190, yellow, 0.02);
  for (const x of [-1700, -900, 0, 900, 1700]) { flat(24, 160, x, 105, tarmac); flat(0.5, 160, x, 105, yellow, 0.02); }
  flat(1400, 260, 200, 380, tarmac);
  // terminal, tower and hangars
  const concrete = new THREE.MeshStandardMaterial({ color: 0xd9dade, roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x223447, roughness: 0.15, metalness: 0.4, emissive: 0xffd8a0, emissiveIntensity: 0 });
  const box = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; group.add(m); return m; };
  box(900, 22, 70, 200, 0, 560, concrete);
  box(902, 12, 72, 200, 6, 560, glass);
  for (const x of [-150, 50, 250, 450]) box(16, 6, 80, x, 3, 510, concrete);        // air bridges
  const tw = box(9, 70, 9, -420, 0, 520, concrete);
  box(20, 9, 20, -420, 70, 520, glass);
  for (const x of [900, 1060, 1220]) box(140, 30, 90, x, 0, 470, new THREE.MeshStandardMaterial({ color: 0xbfc5cc, roughness: 0.6 }));
  // runway edge lights, threshold and approach lights (bright at night)
  const glow = glowTexture();
  const lights = [];
  const addLights = (pts, color, size) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    const mat = new THREE.PointsMaterial({ map: glow, color, size, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const p = new THREE.Points(geo, mat); p.renderOrder = 7; group.add(p); lights.push(p);
  };
  const edge = []; for (let x = -L / 2; x <= L / 2; x += 60) for (const k of [-1, 1]) edge.push([x, 0.4, k * (Wd / 2 + 1.5)]);
  addLights(edge, 0xfff3d6, 7);
  const ends = []; for (let z = -Wd / 2; z <= Wd / 2; z += 3) { ends.push([-L / 2 - 2, 0.4, z]); ends.push([L / 2 + 2, 0.4, z]); }
  addLights(ends, 0x7dff8a, 7);
  const appr = []; for (const end of [-1, 1]) for (let d = 60; d <= 900; d += 30) for (let k = -3; k <= 3; k++) appr.push([end * (L / 2 + d), 1.5, k * 2.2]);
  addLights(appr, 0xffffff, 8);
  const centre = []; for (let x = -L / 2 + 150; x < L / 2 - 150; x += 15) centre.push([x, 0.2, 0]);
  addLights(centre, 0xfffbe8, 3.5);
  // the city around the airport at night
  const city = [], rng = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const n = isMobile ? 9000 : 18000;
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, r = 2500 + Math.pow(rng(), 0.6) * 20000;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(z) < 1500 && Math.abs(x) < 4000) continue;
    city.push([x, 2, z]);
  }
  addLights(city, 0xffb860, 18);
  const cityPts = lights[lights.length - 1];
  return {
    group,
    runwayHalf: L / 2,
    setNight(night) {
      for (const p of lights) p.visible = night;
      cityPts.visible = night && !desert;
      glass.emissiveIntensity = night ? 1.2 : 0;
      ground.material.color.set(night ? 0x2c3540 : 0xffffff);
    },
    dispose() { group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); },
  };
}
