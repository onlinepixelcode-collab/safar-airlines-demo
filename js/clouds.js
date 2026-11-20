import * as THREE from 'three';
import { SKY_GLSL, skyUniforms } from './skyglsl.js';
import { mulberry32 } from './geo.js';
import { makeWispTexture } from './textures.js';

// ---------------------------------------------------------------------------
// Real-time volumetric cumulus.
// A tileable 3D noise texture (Perlin-Worley for the cloud shapes, Worley fbm for
// the billowy detail) is baked once at load. Every frame a full-screen pass ray-marches
// a cloud layer below the aircraft at reduced resolution: sunlight is traced towards the
// sun for self-shadowing, with a multiple-scattering term, a powder term for bright
// rims, two-lobe Henyey-Greenstein phase, sky ambient from above, aerial perspective to
// the horizon and the ocean showing through the gaps. The result is composited behind
// the aircraft, in front of the sky dome.
// ---------------------------------------------------------------------------

function makeNoise3D(N, seed = 1337) {
  const rng = mulberry32(seed);
  const pts = (cells) => { const a = new Float32Array(cells * cells * cells * 3); for (let i = 0; i < a.length; i++) a[i] = rng(); return a; };
  const P4 = pts(4), P8 = pts(8), P16 = pts(16), P32 = pts(32);
  const worley = (x, y, z, cells, P) => {
    const fx = x * cells, fy = y * cells, fz = z * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    let md = 9;
    for (let dz = -1; dz <= 1; dz++) {
      const cz = iz + dz, wz = (cz + cells) % cells;
      for (let dy = -1; dy <= 1; dy++) {
        const cy = iy + dy, wy = (cy + cells) % cells;
        for (let dx = -1; dx <= 1; dx++) {
          const cx = ix + dx, wx = (cx + cells) % cells;
          const k = ((wz * cells + wy) * cells + wx) * 3;
          const px = cx + P[k] - fx, py = cy + P[k + 1] - fy, pz = cz + P[k + 2] - fz;
          const d = px * px + py * py + pz * pz;
          if (d < md) md = d;
        }
      }
    }
    return 1 - Math.min(1, Math.sqrt(md));
  };
  const grads = (n) => {
    const g = new Float32Array(n * n * n * 3);
    for (let i = 0; i < n * n * n; i++) {
      let x, y, z, l;
      do { x = rng() * 2 - 1; y = rng() * 2 - 1; z = rng() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 1e-4);
      l = Math.sqrt(l);
      g[i * 3] = x / l; g[i * 3 + 1] = y / l; g[i * 3 + 2] = z / l;
    }
    return g;
  };
  const G4 = grads(4), G8 = grads(8), G16 = grads(16);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const perlin = (x, y, z, n, G) => {
    const fx = x * n, fy = y * n, fz = z * n;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    const tx = fx - ix, ty = fy - iy, tz = fz - iz;
    const u = fade(tx), v = fade(ty), w = fade(tz);
    let r = 0;
    for (let c = 0; c < 8; c++) {
      const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
      const idx = ((((iz + dz) % n) * n + ((iy + dy) % n)) * n + ((ix + dx) % n)) * 3;
      const dot = G[idx] * (tx - dx) + G[idx + 1] * (ty - dy) + G[idx + 2] * (tz - dz);
      r += dot * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    }
    return r;
  };
  const data = new Uint8Array(N * N * N * 2);
  let o = 0;
  for (let k = 0; k < N; k++) {
    const z = (k + 0.5) / N;
    for (let j = 0; j < N; j++) {
      const y = (j + 0.5) / N;
      for (let i = 0; i < N; i++) {
        const x = (i + 0.5) / N;
        const p = perlin(x, y, z, 4, G4) * 0.55 + perlin(x, y, z, 8, G8) * 0.3 + perlin(x, y, z, 16, G16) * 0.15;
        const p01 = Math.min(1, Math.max(0, 0.5 + p * 0.95));
        const w4 = worley(x, y, z, 4, P4), w8 = worley(x, y, z, 8, P8), w16 = worley(x, y, z, 16, P16), w32 = worley(x, y, z, 32, P32);
        const wb = w4 * 0.625 + w8 * 0.25 + w16 * 0.125;
        let base = (p01 - (wb - 1)) / (2 - wb);               // Perlin-Worley
        base = Math.min(1, Math.max(0, base * 1.15 - 0.08));
        const det = w8 * 0.625 + w16 * 0.25 + w32 * 0.125;
        data[o++] = Math.round(base * 255);
        data[o++] = Math.round(det * 255);
      }
    }
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
  precision highp float;
  precision highp sampler3D;
  uniform sampler3D uNoise;
  uniform sampler2D uWeather;
  uniform vec3 uCamPos;
  uniform mat4 uCamWorld;
  uniform mat4 uProjInv;
  uniform float uTime;
  uniform vec3 uWind;
  uniform float uBottom;
  uniform float uTop;
  uniform float uCoverage;
  uniform float uDensity;
  uniform vec3 uSunColor;
  uniform float uSunPower;
  uniform vec3 uAmbTop;
  uniform vec3 uAmbBottom;
  uniform vec3 uGround;
  uniform float uGroundY;
  uniform int uSteps;
  uniform int uLightSteps;
  uniform float uMaxDist;
  uniform float uBaseLo;
  uniform float uBaseHi;
  uniform float uErode;
  uniform float uSigma;
  uniform float uShapeScale;
  uniform float uDetailScale;
  uniform float uGroundHaze;
  uniform float uMsFloor;
  uniform vec3 uDownHaze;
  uniform float uEnvMode;
  varying vec2 vUv;
  ${SKY_GLSL}

  float remap(float v, float l0, float h0, float l1, float h1) { return l1 + (v - l0) * (h1 - l1) / (h0 - l0); }
  float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5); }
  float heightFrac(float y) { return clamp((y - uBottom) / (uTop - uBottom), 0.0, 1.0); }

  // cov: local coverage (sampled once per ray from the weather map)
  float density(vec3 p, float cov, bool detail) {
    float h = heightFrac(p.y);
    vec3 q = p + uWind * uTime;
    float topH = mix(0.5, 1.0, cov);
    float prof = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(topH * 0.45, topH, h));
    float base = texture(uNoise, q / uShapeScale).r;
    base = clamp((base - uBaseLo) / (uBaseHi - uBaseLo), 0.0, 1.0);
    float d = remap(base * prof, 1.0 - cov, 1.0, 0.0, 1.0);
    if (d <= 0.0) return 0.0;
    if (detail) {
      float det = texture(uNoise, q / uDetailScale + vec3(0.0, uTime * 0.0004, 0.0)).g;
      det = clamp((det - 0.22) / 0.5, 0.0, 1.0);
      float er = mix(det, 1.0 - det, clamp(h * 3.0, 0.0, 1.0));
      d = remap(d, er * uErode, 1.0, 0.0, 1.0);
    }
    return clamp(d, 0.0, 1.0) * uDensity;
  }

  void main() {
    vec2 ndc = vUv * 2.0 - 1.0;
    vec4 vp = uProjInv * vec4(ndc, 1.0, 1.0);
    vec3 rd = normalize((uCamWorld * vec4(vp.xyz / vp.w, 0.0)).xyz);
    vec3 ro = uCamPos;
    if (rd.y > -0.0004) {
      if (uEnvMode > 0.5) {               // reflection capture: sky plus a soft sun lobe for highlights
        float sl = max(dot(rd, normalize(uSunDir)), 0.0);
        gl_FragColor = vec4(skyColor(rd, false) + uSunColor * (pow(sl, 420.0) * 6.0 + pow(sl, 24.0) * 0.12), 1.0);
      } else {
        gl_FragColor = vec4(0.0);         // sky dome shows through above the horizon
      }
      return;
    }

    vec3 hazeDir = normalize(vec3(rd.x, 0.0015, rd.z));
    vec3 haze = skyColor(hazeDir, false);

    float tTop = (uTop - ro.y) / rd.y;
    float tBot = (uBottom - ro.y) / rd.y;
    float t0 = max(tTop, 0.0);
    float t1 = min(tBot, t0 + uMaxDist);

    // coverage along this ray (weather changes slowly, so sample at entry and exit)
    vec3 pe = ro + rd * t0 + uWind * uTime, px = ro + rd * t1 + uWind * uTime;
    float wA = texture(uWeather, pe.xz / 15000.0).a * 0.7 + texture(uWeather, pe.xz / 5600.0 + 0.37).a * 0.3;
    float wB = texture(uWeather, px.xz / 15000.0).a * 0.7 + texture(uWeather, px.xz / 5600.0 + 0.37).a * 0.3;

    float cosT = dot(rd, normalize(uSunDir));
    float phase = mix(hg(cosT, 0.6), hg(cosT, -0.25), 0.4) * 0.85 + 0.15;

    float T = 1.0;
    vec3 L = vec3(0.0);
    float firstHit = -1.0;
    float dist = t1 - t0;
    float stp = max(dist / float(uSteps), 10.0);
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float t = t0 + stp * jitter;
    float SIGMA = uSigma;

    for (int i = 0; i < 128; i++) {
      if (i >= uSteps || t > t1 || T < 0.012) break;
      vec3 p = ro + rd * t;
      float f = clamp((t - t0) / max(dist, 1.0), 0.0, 1.0);
      float cov = clamp(uCoverage + (mix(wA, wB, f) - 0.5) * 0.95, 0.0, 1.0);
      float dt = stp * (1.0 + (t - t0) * 0.00008);
      float dc = density(p, cov, false);
      if (dc > 0.0) {
        float d = density(p, cov, true);
        if (d > 0.002) {
          if (firstHit < 0.0) firstHit = t;
          float ld = 0.0, ls = 20.0;
          vec3 lp = p;
          for (int j = 0; j < 6; j++) {
            if (j >= uLightSteps) break;
            lp += uSunDir * ls;
            ld += density(lp, cov, false) * ls;
            ls *= 2.1;
          }
          float beer = exp(-ld * SIGMA);
          float ms = max(beer, uMsFloor * exp(-ld * SIGMA * 0.2));   // multiple scattering
          float powder = 1.0 - exp(-d * 6.0);
          float h = heightFrac(p.y);
          vec3 amb = mix(uAmbBottom, uAmbTop, smoothstep(0.05, 0.95, h));
          vec3 S = uSunColor * uSunPower * ms * phase * mix(0.6, 1.0, powder) + amb;
          float Ts = exp(-d * SIGMA * dt);
          L += T * S * (1.0 - Ts);
          T *= Ts;
        }
        t += dt;
      } else {
        t += dt * 1.7;
      }
    }

    // ocean far below, seen through the gaps, faded by the air in between
    float tG = (uGroundY - ro.y) / rd.y;
    // looking down through the atmosphere the in-scattered light is blue (Rayleigh);
    // towards the horizon it becomes the pale horizon haze
    vec3 airCol = mix(uDownHaze, haze, pow(1.0 - clamp(-rd.y, 0.0, 1.0), 5.0));
    vec3 bg = mix(uGround, airCol, 1.0 - exp(-tG / uGroundHaze));
    float hz = firstHit > 0.0 ? 1.0 - exp(-firstHit / 15000.0) : 0.0;
    vec3 col = mix(L, haze * (1.0 - T), hz) + bg * T;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const QUALITY = [
  { scale: 0.62, steps: 76, light: 5 },
  { scale: 0.5, steps: 62, light: 4 },
  { scale: 0.42, steps: 50, light: 4 },
  { scale: 0.34, steps: 40, light: 3 },
  { scale: 0.28, steps: 32, light: 3 },
];

export function createClouds({ renderer, preset, isMobile }) {
  const cp = preset.clouds;
  let level = isMobile ? 2 : 0;
  let size = { w: 2, h: 2 };
  let ready = false;

  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false });
  rt.texture.minFilter = THREE.LinearFilter;
  rt.texture.magFilter = THREE.LinearFilter;
  rt.texture.generateMipmaps = false;

  const weather = makeWispTexture(256, 5, { lo: 0.18, hi: 0.86 });
  const uniforms = {
    ...skyUniforms(preset),
    uNoise: { value: null },
    uWeather: { value: weather },
    uCamPos: { value: new THREE.Vector3() },
    uCamWorld: { value: new THREE.Matrix4() },
    uProjInv: { value: new THREE.Matrix4() },
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector3(38, 0, 6) },        // clouds drift aft under the aircraft
    uBottom: { value: -1500 },
    uTop: { value: -420 },
    uCoverage: { value: cp.coverage },
    uDensity: { value: 1.0 },
    uSunColor: { value: new THREE.Vector3(...cp.sun) },
    uSunPower: { value: cp.power },
    uAmbTop: { value: new THREE.Vector3(...cp.ambTop) },
    uAmbBottom: { value: new THREE.Vector3(...cp.ambBottom) },
    uGround: { value: new THREE.Vector3(...cp.ground) },
    uGroundY: { value: -10500 },
    uSteps: { value: QUALITY[level].steps },
    uLightSteps: { value: QUALITY[level].light },
    uMaxDist: { value: 24000 },
    uBaseLo: { value: 0.52 },
    uBaseHi: { value: 0.8 },
    uErode: { value: 0.55 },
    uSigma: { value: 0.085 },
    uShapeScale: { value: 1650 },
    uDetailScale: { value: 230 },
    uGroundHaze: { value: 22000 },
    uDownHaze: { value: new THREE.Vector3(...(cp.downHaze || [0.16, 0.3, 0.58])) },
    uMsFloor: { value: 0.24 },
    uEnvMode: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false });
  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  quadScene.add(quad);

  // composite: drawn in the main scene behind the aircraft (depth = far), over the sky dome
  const compMat = new THREE.ShaderMaterial({
    uniforms: { tClouds: { value: rt.texture }, uOpacity: { value: 0 }, uTexel: { value: new THREE.Vector2(0.5, 0.5) } },
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999999, 1.0); }`,
    // soft 5-tap tent upsample hides the ray-march dither at cloud edges
    fragmentShader: /* glsl */`uniform sampler2D tClouds; uniform float uOpacity; uniform vec2 uTexel; varying vec2 vUv;
      void main(){
        vec2 o = uTexel * 0.9;
        vec4 c = texture2D(tClouds, vUv) * 0.4;
        c += texture2D(tClouds, vUv + vec2( o.x,  o.y)) * 0.15;
        c += texture2D(tClouds, vUv + vec2(-o.x,  o.y)) * 0.15;
        c += texture2D(tClouds, vUv + vec2( o.x, -o.y)) * 0.15;
        c += texture2D(tClouds, vUv + vec2(-o.x, -o.y)) * 0.15;
        gl_FragColor = c * uOpacity;
      }`,
  });
  const composite = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compMat);
  composite.frustumCulled = false;
  composite.renderOrder = -50;

  const promise = new Promise((resolve) => {
    setTimeout(() => {
      uniforms.uNoise.value = makeNoise3D(isMobile ? 48 : 64);
      ready = true;
      compMat.uniforms.uOpacity.value = 1;
      resolve();
    }, 40);
  });

  function setSize(w, h) {
    size = { w, h };
    const q = QUALITY[level];
    const rw = Math.max(2, Math.round(w * q.scale)), rh = Math.max(2, Math.round(h * q.scale));
    rt.setSize(rw, rh);
    compMat.uniforms.uTexel.value.set(1 / rw, 1 / rh);
  }
  function setQuality(l) {
    level = Math.max(0, Math.min(QUALITY.length - 1, l));
    uniforms.uSteps.value = QUALITY[level].steps;
    uniforms.uLightSteps.value = QUALITY[level].light;
    setSize(size.w, size.h);
  }
  const prevRT = { t: null };
  function render(camera) {
    if (!ready) return;
    camera.updateMatrixWorld();
    uniforms.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    uniforms.uCamWorld.value.copy(camera.matrixWorld);
    uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
    prevRT.t = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(quadScene, quadCam);
    renderer.setRenderTarget(prevRT.t);
  }
  function update(dt) { uniforms.uTime.value += dt; }

  // Capture the real sky + volumetric clouds + ocean into a cube map from the aircraft's
  // position, so paint, glass and metal reflect exactly what's around them.
  function captureEnv(size = 160) {
    if (!ready) return null;
    const cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType });
    const cubeCam = new THREE.CubeCamera(0.1, 1000, cubeRT);
    cubeCam.coordinateSystem = renderer.coordinateSystem;
    cubeCam.updateCoordinateSystem();
    cubeCam.position.set(0, 0, 0);
    cubeCam.updateMatrixWorld(true);
    const keep = { s: uniforms.uSteps.value, l: uniforms.uLightSteps.value };
    uniforms.uSteps.value = 56; uniforms.uLightSteps.value = 4; uniforms.uEnvMode.value = 1;
    const prev = renderer.getRenderTarget();
    cubeCam.children.forEach((cam, i) => {
      cam.updateMatrixWorld(true);
      uniforms.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
      uniforms.uCamWorld.value.copy(cam.matrixWorld);
      uniforms.uProjInv.value.copy(cam.projectionMatrixInverse);
      renderer.setRenderTarget(cubeRT, i);
      renderer.render(quadScene, quadCam);
    });
    renderer.setRenderTarget(prev);
    uniforms.uSteps.value = keep.s; uniforms.uLightSteps.value = keep.l; uniforms.uEnvMode.value = 0;
    return cubeRT;
  }

  return { composite, render, update, setSize, setQuality, captureEnv, get level() { return level; }, ready: promise, uniforms };
}
