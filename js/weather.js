import * as THREE from 'three';
import { FUS } from './geo.js';

// Rain: thousands of fine streaks in a box that travels with the camera, blown aft by the
// aircraft's speed. Streaks inside the fuselage are dropped, so from a seat you only see the
// rain through the windows. Drawn as GPU lines, animated entirely in the vertex shader.
export function createRain({ isMobile = false } = {}) {
  const count = isMobile ? 2600 : 5200;
  const BOX = new THREE.Vector3(70, 46, 70);
  const pos = new Float32Array(count * 2 * 3);
  const end = new Float32Array(count * 2);
  const seed = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random(), s = Math.random();
    for (let k = 0; k < 2; k++) {
      pos.set([x, y, z], (i * 2 + k) * 3);
      end[i * 2 + k] = k;
      seed[i * 2 + k] = s;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uBox: { value: BOX }, uLevel: { value: 0 },
      uVel: { value: new THREE.Vector3(-120, -16, 3) },    // air streaming aft and down past the jet
      uR: { value: FUS.R + 0.45 }, uX0: { value: FUS.TAIL_END }, uX1: { value: FUS.NOSE_END },
      uCol: { value: new THREE.Color(0.78, 0.82, 0.88) },
    },
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    vertexShader: /* glsl */`
      attribute float aEnd; attribute float aSeed;
      uniform float uTime; uniform vec3 uBox; uniform vec3 uVel; uniform float uR; uniform float uX0; uniform float uX1;
      varying float vA;
      void main() {
        vec3 v = uVel * (0.85 + 0.3 * aSeed);
        vec3 p = position * uBox + v * uTime;
        // wrap into a box centred on the camera
        vec3 rel = mod(p - cameraPosition + uBox * 0.5, uBox) - uBox * 0.5;
        vec3 wp = cameraPosition + rel;
        wp -= v * 0.028 * aEnd;                              // the streak's tail
        // no rain inside the cabin
        float inside = step(uX0, wp.x) * step(wp.x, uX1) * step(length(wp.yz), uR);
        float far = smoothstep(uBox.x * 0.5, uBox.x * 0.32, length(rel));
        vA = (1.0 - inside) * far * (0.35 + 0.65 * aSeed) * mix(1.0, 0.25, aEnd);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        if (inside > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; uniform float uLevel;
      varying float vA;
      void main() { gl_FragColor = vec4(uCol, vA * 0.42 * uLevel); }`,
  });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 7;
  lines.visible = false;
  lines.name = 'rain';
  let level = 0, target = 0;
  return {
    object: lines,
    setLevel(k) { target = k; if (k > 0) lines.visible = true; },
    update(dt) {
      level += (target - level) * Math.min(1, dt * 2.5);
      mat.uniforms.uLevel.value = level;
      mat.uniforms.uTime.value += dt;
      lines.visible = level > 0.01;
    },
  };
}

// Lightning somewhere in the clouds: random double flickers every few seconds.
export function createLightning() {
  let next = 4 + Math.random() * 4, t = 0, flash = 0, on = false, seq = [];
  return {
    setOn(v) { on = v; if (!v) flash = 0; },
    update(dt) {
      if (!on) return 0;
      t += dt;
      if (t > next) {
        t = 0;
        next = 3.5 + Math.random() * 6.5;
        const a = 0.6 + Math.random() * 0.4;
        seq = [[0.0, a], [0.07, 0.15], [0.13, a * 0.8], [0.22, 0]];
      }
      let f = 0;
      for (let i = seq.length - 1; i >= 0; i--) if (t >= seq[i][0]) { f = seq[i][1]; break; }
      if (seq.length && t > 0.4) seq = [];
      flash += (f - flash) * Math.min(1, dt * 40);
      return flash;
    },
  };
}

// Contrails: the white condensation trails that form a few dozen metres behind each engine in
// the cold air at cruise height, widening and fading over a couple of kilometres. Each is a
// camera-facing ribbon; its turbulence is fixed in the air, so it streams aft at the airspeed.
// Lit by the sun (pink at sunrise, gold at sunset, faint grey by moonlight).
const AIRSPEED = 235;   // m/s, about 850 km/h true airspeed
export function createContrails(points) {
  const L = 2400, SEG = 180;
  const t = [], side = [], idx = [];
  for (let i = 0; i <= SEG; i++) {
    const a = Math.pow(i / SEG, 1.7);
    t.push(a, a); side.push(-1, 1);
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(t.length * 3), 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setIndex(idx);
  const group = new THREE.Group();
  group.name = 'contrails';
  const mats = points.map(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uOrigin: { value: new THREE.Vector3() }, uTime: { value: 0 }, uLen: { value: L }, uSpeed: { value: AIRSPEED },
      uSun: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.5, 0.6, 0.75) }, uOpacity: { value: 0.8 },
      uSeed: { value: Math.random() * 50 },
    },
    vertexShader: /* glsl */`
      attribute float aT; attribute float aSide;
      uniform vec3 uOrigin; uniform float uLen;
      varying float vD; varying float vS;
      void main() {
        float d = aT * uLen;
        vec3 c = uOrigin + vec3(-d, -d * 0.006, 0.0);            // the trail sinks a little as it ages
        float w = 0.55 + 16.0 * pow(aT, 0.8);
        vec3 toCam = normalize(cameraPosition - c);
        vec3 sd = cross(vec3(1.0, 0.0, 0.0), toCam);
        sd = length(sd) > 1e-3 ? normalize(sd) : vec3(0.0, 1.0, 0.0);
        vD = d; vS = aSide;
        gl_Position = projectionMatrix * viewMatrix * vec4(c + sd * aSide * w, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uSpeed; uniform float uLen; uniform float uOpacity; uniform float uSeed;
      uniform vec3 uSun; uniform vec3 uAmb;
      varying float vD; varying float vS;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float x = vD - uTime * uSpeed;                     // a point fixed in the air
        float n = n2(vec2(x / 14.0, vS * 1.6 + uSeed)) * 0.55 + n2(vec2(x / 4.5, vS * 3.1 + uSeed)) * 0.3 + n2(vec2(x / 60.0, uSeed)) * 0.15;
        float across = exp(-vS * vS * mix(5.0, 2.2, smoothstep(0.0, uLen * 0.3, vD)));
        float onset = smoothstep(9.0, 42.0, vD);          // it takes a moment for the vapour to freeze
        float fade = 1.0 - smoothstep(uLen * 0.35, uLen, vD);
        float a = across * onset * fade * mix(0.45, 1.0, n) * uOpacity;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uAmb + uSun * (0.62 + 0.38 * n), a);
      }`,
  }));
  for (const m of mats) { const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = -20; group.add(mesh); }
  const tmp = new THREE.Vector3();
  let time = 0;
  return {
    object: group,
    // follow the engines (world positions) but keep the trails lying along the flight path
    update(dt, airframe) {
      time = (time + dt) % 2000;
      airframe.updateMatrixWorld();
      points.forEach((p, i) => { mats[i].uniforms.uOrigin.value.copy(tmp.copy(p).applyMatrix4(airframe.matrixWorld)); mats[i].uniforms.uTime.value = time; });
    },
    setLight(sun, amb, opacity) { for (const m of mats) { m.uniforms.uSun.value.copy(sun); m.uniforms.uAmb.value.copy(amb); m.uniforms.uOpacity.value = opacity; } group.visible = opacity > 0.01; },
  };
}

// Flying through cloud: now and then a bank of cumulus at cruise height comes at the aircraft
// at the airspeed and passes around it: soft lit puffs stream past the wings and windows, and
// while the camera is inside, the view whites out as it would in the real thing.
function makePuffTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const r = S * (0.12 + rnd() * 0.2), a = rnd() * Math.PI * 2, d = rnd() * S * 0.26;
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.42)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}
export function createCloudBank({ isMobile = false } = {}) {
  const N = isMobile ? 50 : 90;
  const R = new THREE.Vector3(420, 70, 190);          // half-size of the bank (m)
  const quad = new THREE.PlaneGeometry(2, 2);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index; g.attributes.position = quad.attributes.position; g.attributes.uv = quad.attributes.uv;
  const off = new Float32Array(N * 3), size = new Float32Array(N), rot = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let x, y, z;
    do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; } while (x * x + y * y + z * z > 1);
    off.set([x * R.x, y * R.y * (y > 0 ? 1 : 0.6), z * R.z], i * 3);
    size[i] = 45 + Math.random() * 75; rot[i] = Math.random() * 6.28;
  }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
  g.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
  g.setAttribute('aRot', new THREE.InstancedBufferAttribute(rot, 1));
  g.instanceCount = N;
  const uniforms = {
    uCenter: { value: new THREE.Vector3(1e6, 0, 0) }, uTex: { value: makePuffTexture() },
    uSun: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.6, 0.66, 0.75) }, uOpacity: { value: 0.75 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute vec3 aOff; attribute float aSize; attribute float aRot;
      uniform vec3 uCenter;
      varying vec2 vUv; varying float vLit; varying float vNear;
      void main() {
        vec3 wp = uCenter + aOff;
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        float c = cos(aRot), s = sin(aRot);
        vec2 q = mat2(c, -s, s, c) * position.xy;
        mv.xy += q * aSize;
        vUv = uv;
        vLit = clamp(0.55 + 0.45 * position.y + aOff.y / 160.0, 0.0, 1.0);
        vNear = smoothstep(6.0, 40.0, -mv.z);           // no giant puffs right in the lens
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex; uniform vec3 uSun; uniform vec3 uAmb; uniform float uOpacity;
      varying vec2 vUv; varying float vLit; varying float vNear;
      void main() {
        float a = texture2D(uTex, vUv).a * uOpacity * vNear;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uAmb + uSun * (0.25 + 0.75 * vLit), a);
      }`,
  });
  const puffs = new THREE.Mesh(g, mat);
  puffs.frustumCulled = false;
  puffs.renderOrder = 5;
  // white-out while the camera is inside the bank
  const mistMat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(0.9, 0.92, 0.95) }, uA: { value: 0 } },
    transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform vec3 uCol; uniform float uA; void main(){ gl_FragColor = vec4(uCol, uA); }',
  });
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mistMat);
  mist.frustumCulled = false; mist.renderOrder = 999;
  const group = new THREE.Group();
  group.name = 'cloud-bank';
  group.add(puffs, mist);
  let wait = 9 + Math.random() * 8, x = 1e6, y = 0, z = 0, gap = [22, 42], on = true;
  const q = new THREE.Vector3();
  return {
    object: group,
    update(dt, camera, { allowMist = true } = {}) {
      if (x > 1e5) {
        wait -= dt;
        if (wait <= 0 && on) { x = 2200; y = -40 + Math.random() * 90; z = (Math.random() * 2 - 1) * 170; }
      } else {
        x -= AIRSPEED * dt;
        if (x < -2200) { x = 1e6; wait = gap[0] + Math.random() * (gap[1] - gap[0]); }
      }
      uniforms.uCenter.value.set(x, y, z);
      puffs.visible = x < 1e5;
      // how deep the camera is inside the bank
      q.copy(camera.position).sub(uniforms.uCenter.value).divide(R);
      const inside = Math.max(0, 1 - q.length());
      mistMat.uniforms.uA.value = allowMist && puffs.visible ? Math.min(0.9, Math.pow(inside, 0.6) * 1.15) * uniforms.uOpacity.value : 0;
      mist.visible = mistMat.uniforms.uA.value > 0.002;
    },
    setLight(sun, amb, opacity, frequent = false) {
      uniforms.uSun.value.copy(sun); uniforms.uAmb.value.copy(amb); uniforms.uOpacity.value = opacity;
      mistMat.uniforms.uCol.value.copy(amb).add(sun.clone().multiplyScalar(0.55));
      gap = frequent ? [7, 15] : [22, 42];
      on = opacity > 0.01;
    },
    get active() { return x < 1e5; },
  };
}
