import * as THREE from 'three';
import { SKY_GLSL, skyUniforms } from './skyglsl.js';
import { createClouds } from './clouds.js';
import { makeWispTexture, makeMilkyWayTexture } from './textures.js';
import { mulberry32 } from './geo.js';

// Lighting / sky presets. `sky` drives the physical atmosphere, `clouds` the volumetric layer.
export const PRESETS = {
  day: {
    sunDir: new THREE.Vector3(0.63, 0.53, -0.567).normalize(),      // about 32 degrees up, ahead of the wing
    sunColor: '#fff3e4', sunIntensity: 2.5,
    hemiSky: '#d2e1f4', hemiGround: '#edf0f4', hemiIntensity: 0.5,
    envIntensity: 0.78, exposure: 0.98,
    sky: { turbidity: 3.6, rayleigh: 1.25, mie: 0.0042, mieG: 0.82, gain: 0.58 },
    clouds: {
      coverage: 0.41,
      sun: [1.0, 0.965, 0.915], power: 3.0,
      ambTop: [0.44, 0.58, 0.84], ambBottom: [0.3, 0.4, 0.56],
      ground: [0.016, 0.065, 0.16], downHaze: [0.2, 0.36, 0.64],
    },
    glass: { zenith: '#5d8fd0', horizon: '#dbe6f2' },
    envBelow: '#e9edf2',
    windowLight: 1, windowGlow: 0, nav: 0.35, stars: 0,
    cirrus: 0.32, cirrusTint: [1.0, 1.0, 1.0], overcast: 0, altitude: 1,
  },
  // early light: low pink-gold sun on the camera side, soft violet shadows, a little mist
  sunrise: {
    sunDir: new THREE.Vector3(0.45, 0.13, 0.88).normalize(),
    sunColor: '#ffb98d', sunIntensity: 2.3,
    hemiSky: '#a4acd8', hemiGround: '#f2c8b4', hemiIntensity: 0.62,
    envIntensity: 0.8, exposure: 1.0,
    sky: { turbidity: 3.8, rayleigh: 2.2, mie: 0.0024, mieG: 0.77, gain: 0.48 },
    clouds: {
      coverage: 0.46,
      sun: [1.0, 0.74, 0.58], power: 2.6,
      ambTop: [0.36, 0.38, 0.56], ambBottom: [0.31, 0.27, 0.36],
      ground: [0.03, 0.04, 0.08], downHaze: [0.33, 0.3, 0.44],
    },
    glass: { zenith: '#8090c6', horizon: '#f6cfb8' },
    envBelow: '#ecd2c4',
    windowLight: 0.8, windowGlow: 0.25, nav: 0.6, stars: 0,
    cirrus: 0.55, cirrusTint: [1.0, 0.8, 0.74], overcast: 0, altitude: 0.8,
  },
  // mid-afternoon: sun lower and warmer than midday, longer shadows, golden clouds
  afternoon: {
    sunDir: new THREE.Vector3(-0.381, 0.342, 0.859).normalize(),    // about 20 degrees up
    sunColor: '#ffe1bb', sunIntensity: 2.6,
    hemiSky: '#c9d6ec', hemiGround: '#f1e7da', hemiIntensity: 0.5,
    envIntensity: 0.78, exposure: 0.98,
    sky: { turbidity: 4.6, rayleigh: 1.5, mie: 0.0048, mieG: 0.83, gain: 0.6 },
    clouds: {
      coverage: 0.43,
      sun: [1.0, 0.9, 0.78], power: 2.9,
      ambTop: [0.42, 0.52, 0.74], ambBottom: [0.32, 0.38, 0.5],
      ground: [0.02, 0.06, 0.14], downHaze: [0.24, 0.36, 0.6],
    },
    glass: { zenith: '#6a92c8', horizon: '#e9e2d6' },
    envBelow: '#eee8e0',
    windowLight: 1, windowGlow: 0, nav: 0.35, stars: 0,
    cirrus: 0.4, cirrusTint: [1.0, 0.96, 0.88], overcast: 0, altitude: 1,
  },
  sunset: {
    sunDir: new THREE.Vector3(0.82, 0.2, -0.53).normalize(),
    sunColor: '#ffb27a', sunIntensity: 2.6,
    hemiSky: '#8b95c4', hemiGround: '#f0bf98', hemiIntensity: 0.7,
    envIntensity: 0.8, exposure: 1.0,
    sky: { turbidity: 4.0, rayleigh: 2.4, mie: 0.0022, mieG: 0.76, gain: 0.47 },   // clean air at cruise height: the sun stands out
    clouds: {
      coverage: 0.5,
      sun: [1.0, 0.66, 0.42], power: 2.7,
      ambTop: [0.3, 0.32, 0.46], ambBottom: [0.28, 0.24, 0.3],
      ground: [0.02, 0.03, 0.06], downHaze: [0.3, 0.26, 0.34],
    },
    glass: { zenith: '#6c78ad', horizon: '#f4c7a2' },
    envBelow: '#e8c4a6',
    windowLight: 0.75, windowGlow: 0.3, nav: 0.65, stars: 0,
    cirrus: 0.6, cirrusTint: [1.0, 0.7, 0.52], overcast: 0, altitude: 0.75,
  },
  // night: a high moon on the camera side lights the clouds silver-blue, stars overhead, the
  // cabin windows glow warm and the navigation lights and strobes show
  night: {
    sunDir: new THREE.Vector3(0.3, 0.52, 0.8).normalize(),
    sunColor: '#b3c4ff', sunIntensity: 0.75,
    hemiSky: '#26385e', hemiGround: '#0e1729', hemiIntensity: 0.6,
    envIntensity: 0.55, exposure: 1.18,
    sky: { turbidity: 2.4, rayleigh: 1.0, mie: 0.004, mieG: 0.8, gain: 0.075 },
    clouds: {
      coverage: 0.4,
      sun: [0.6, 0.67, 0.86], power: 1.15,
      ambTop: [0.04, 0.055, 0.1], ambBottom: [0.022, 0.032, 0.062],
      ground: [0.004, 0.008, 0.02], downHaze: [0.022, 0.036, 0.075],
    },
    glass: { zenith: '#1c2b4c', horizon: '#3b4b70' },
    envBelow: '#1a2234',
    windowLight: 0.06, windowGlow: 1.0, nav: 1, stars: 1, cabinGlow: 0.45, glint: 0.12,
    cirrus: 0.1, cirrusTint: [0.05, 0.062, 0.09], overcast: 0, altitude: 1, night: 1,
  },
  // rain: a grey overcast ceiling above, a thick dark deck below, rain streaking past and the
  // odd flash of lightning inside the clouds
  rain: {
    sunDir: new THREE.Vector3(0.2, 0.62, 0.76).normalize(),
    sunColor: '#d6dce4', sunIntensity: 0.7,
    hemiSky: '#b4bcc7', hemiGround: '#6c7480', hemiIntensity: 1.0,
    envIntensity: 0.5, exposure: 1.02,
    sky: { turbidity: 9, rayleigh: 0.9, mie: 0.006, mieG: 0.7, gain: 0.52 },
    clouds: {
      coverage: 0.82,
      sun: [0.6, 0.63, 0.68], power: 1.0,
      ambTop: [0.34, 0.37, 0.42], ambBottom: [0.19, 0.21, 0.25],
      ground: [0.02, 0.03, 0.04], downHaze: [0.24, 0.27, 0.32],
    },
    glass: { zenith: '#7f8a96', horizon: '#adb6c0' },
    envBelow: '#8a929c',
    windowLight: 0.45, windowGlow: 0.35, nav: 0.85, stars: 0, glint: 0.25,
    cirrus: 0, cirrusTint: [0.62, 0.66, 0.72], overcast: 0.97, altitude: 0.15,
    rain: 1, lightning: 1,
  },
};

// the order the times of day are offered in, with their names
export const TIME_ORDER = [['sunrise', 'Sunrise'], ['day', 'Day'], ['afternoon', 'Afternoon'], ['sunset', 'Sunset'], ['night', 'Night'], ['rain', 'Rain']];

let wispTex = null;
function domeMaterial(preset, { disk = true } = {}) {
  if (!wispTex) wispTex = makeWispTexture(256, 41, { lo: 0, hi: 1 });
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      ...skyUniforms(preset),
      uStars: { value: preset.stars || 0 },
      uMilky: { value: null },
      uWisp: { value: wispTex },
      uCirrus: { value: preset.cirrus || 0 },
      uOvercast: { value: preset.overcast || 0 },
      uCirrusTint: { value: new THREE.Vector3(...(preset.cirrusTint || [1, 1, 1])) },
      uSkyTime: { value: 0 },
      uFlash: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform float uStars;
      uniform sampler2D uMilky;
      uniform sampler2D uWisp;
      uniform float uCirrus;
      uniform float uOvercast;
      uniform vec3 uCirrusTint;
      uniform float uSkyTime;
      uniform float uFlash;
      ${SKY_GLSL}
      float mblob(vec2 q, vec2 c, float r) { vec2 e = q - c; return exp(-dot(e, e) / (r * r)); }
      // the full moon as it looks to the eye: bright highlands, the darker "seas" (maria) in
      // their real places, a little speckle, the bright crater Tycho, a soft edge
      vec3 moonDisc(vec3 d, vec3 md, vec3 base, out float cover) {
        const float MR = 0.0072;                       // angular radius: about 0.8 degrees across
        vec3 mr = normalize(cross(md, vec3(0.0, 1.0, 0.0)));
        vec3 mu = cross(mr, md);
        vec2 q = vec2(dot(d, mr), dot(d, mu)) / MR;
        float rq = length(q);
        cover = (1.0 - smoothstep(0.93, 1.03, rq)) * step(0.0, dot(d, md));
        if (cover <= 0.0) return base;
        float m = mblob(q, vec2(-0.5, 0.1), 0.34) + mblob(q, vec2(-0.25, 0.42), 0.24)   // Procellarum, Imbrium
                + mblob(q, vec2(0.16, 0.36), 0.15) + mblob(q, vec2(0.3, 0.1), 0.19)     // Serenitatis, Tranquillitatis
                + mblob(q, vec2(0.66, 0.26), 0.1) + mblob(q, vec2(0.55, -0.16), 0.12)   // Crisium, Fecunditatis
                + mblob(q, vec2(0.38, -0.38), 0.1) + mblob(q, vec2(-0.12, -0.36), 0.15) // Nectaris, Nubium
                + mblob(q, vec2(-0.42, -0.4), 0.09);                                    // Humorum
        float sp = fract(sin(dot(floor(q * 16.0), vec2(12.9898, 78.233))) * 43758.5453);
        m = clamp(m + (sp - 0.5) * 0.14, 0.0, 1.0);
        float limb = mix(0.8, 1.0, sqrt(max(0.0, 1.0 - rq * rq)));
        vec3 c = vec3(1.0, 0.975, 0.92) * 1.15 * limb * (1.0 - 0.45 * m) + 0.5 * mblob(q, vec2(-0.1, -0.72), 0.06);
        return mix(base, c, cover);
      }
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyColor(d, ${disk ? 'true' : 'false'});
        float above = smoothstep(-0.01, 0.2, d.y);
        float moonCover = 0.0;
        // the Milky Way (stars themselves are drawn as points on top)
        if (uStars > 0.0 && d.y > -0.05) {
          vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
          col += texture2D(uMilky, uv).rgb * 0.34 * uStars * smoothstep(-0.03, 0.25, d.y);
        }
        ${disk ? 'if (uNight > 0.0 && uOvercast < 0.5) col = moonDisc(d, normalize(uSunDir), col, moonCover);' : ''}
        if (d.y > 0.0 && (uCirrus > 0.0 || uOvercast > 0.0)) {
          // a high cloud layer about 3 km above the aircraft
          float t = 3000.0 / max(d.y, 0.015);
          vec2 p = d.xz * t;
          vec3 sd = normalize(uSunDir);
          float sunAmt = max(dot(d, sd), 0.0);
          if (uCirrus > 0.0) {
            // cirrus: long thin streaks stretched along the jet stream
            vec2 uv = vec2(p.x / 30000.0 + uSkyTime * 0.0015, p.y / 7000.0);
            float w = texture2D(uWisp, uv).a * 0.6 + texture2D(uWisp, uv * vec2(3.1, 2.3) + 0.37).a * 0.4;
            float cir = smoothstep(0.5, 0.82, w) * uCirrus * smoothstep(0.0, 0.25, d.y);
            cir *= 1.0 - 0.75 * smoothstep(0.999, 0.99996, dot(d, sd));        // thin cirrus: the sun shines through
            vec3 cirCol = uCirrusTint * (0.82 + 0.55 * pow(sunAmt, 5.0));
            col = mix(col, cirCol, cir * 0.85);
          }
          if (uOvercast > 0.0) {
            // overcast: a thick grey ceiling, darker and lumpier underneath
            float lump = texture2D(uWisp, p / 9000.0 + uSkyTime * 0.003).a * 0.55 + texture2D(uWisp, p / 2600.0 + 0.5).a * 0.45;
            vec3 ovCol = uCirrusTint * mix(0.52, 1.05, lump) * (1.0 + uFlash * 2.5);
            col = mix(col, ovCol, uOvercast * smoothstep(-0.01, 0.1, d.y) * (0.85 + 0.15 * lump));
          }
        }
        col += uFlash * vec3(0.55, 0.6, 0.7) * above * uOvercast;
        ${disk ? `if (uNight < 0.5) {
          vec3 sdir = normalize(uSunDir);
          float cs = max(dot(d, sdir), 0.0);
          vec3 tint = mix(vec3(1.0, 0.72, 0.46), vec3(1.0, 0.97, 0.92), smoothstep(0.05, 0.45, sdir.y));
          col += tint * (5.0 * smoothstep(0.99997, 0.999992, cs) + 0.9 * pow(cs, 30000.0) + 0.12 * pow(cs, 3000.0)) * (1.0 - uOvercast);
        }` : ''}
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export function buildSky({ scene, renderer, preset, isMobile }) {
  const group = new THREE.Group();
  group.name = 'sky';

  // physically based sky dome
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), domeMaterial(preset));
  dome.scale.setScalar(20000);
  dome.frustumCulled = false;
  dome.renderOrder = -100;
  group.add(dome);

  // reflection environment: the same sky above, a bright sea of cloud below
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), domeMaterial(preset, { disk: false })));
  const below = new THREE.Mesh(new THREE.CircleGeometry(48, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(preset.envBelow) }));
  below.rotation.x = -Math.PI / 2;
  below.position.y = -14;
  envScene.add(below);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene, 0, 0.1, 200).texture;
  pmrem.dispose();

  // volumetric clouds
  const clouds = createClouds({ renderer, preset, isMobile });
  group.add(clouds.composite);

  // night sky: real stars as points (crisp at any resolution) and the Milky Way glow, built
  // the first time it's needed
  let stars = null;
  function ensureStars() {
    if (stars) return;
    dome.material.uniforms.uMilky.value = makeMilkyWayTexture(isMobile ? 512 : 1024, isMobile ? 256 : 512);
    stars = makeStarField(isMobile ? 4200 : 7000, renderer.getPixelRatio());
    group.add(stars);
  }

  scene.add(group);
  if (preset.stars) ensureStars();

  return {
    group,
    env,
    ready: clouds.ready,
    update: (dt) => {
      clouds.update(dt);
      dome.material.uniforms.uSkyTime.value += dt;
      if (stars) stars.material.uniforms.uTime.value += dt;
    },
    setFlash(f) { dome.material.uniforms.uFlash.value = f; },
    renderClouds: (camera) => clouds.render(camera),
    setSize: (w, h) => clouds.setSize(w, h),
    setQuality: (l) => clouds.setQuality(l),
    get quality() { return clouds.level; },
    clouds,
    // switch to another time of day: sky colours, sun or moon, stars and the cloud lighting
    setPreset(p) {
      for (const u of [dome.material.uniforms, clouds.uniforms]) {
        u.uSunDir.value.copy(p.sunDir);
        u.uRayleigh.value = p.sky.rayleigh; u.uTurbidity.value = p.sky.turbidity;
        u.uMieCoef.value = p.sky.mie; u.uMieG.value = p.sky.mieG; u.uSkyGain.value = p.sky.gain;
      }
      const du = dome.material.uniforms;
      du.uStars.value = p.stars || 0;
      du.uCirrus.value = p.cirrus || 0;
      du.uOvercast.value = p.overcast || 0;
      du.uCirrusTint.value.set(...(p.cirrusTint || [1, 1, 1]));
      for (const u of [dome.material.uniforms, clouds.uniforms]) { u.uAltitude.value = p.altitude ?? 1; u.uNight.value = p.night || 0; }
      if (p.stars) ensureStars();
      if (stars) { stars.visible = !!p.stars; stars.material.uniforms.uStars.value = p.stars || 0; }
      clouds.resetHistory();
      const c = p.clouds, cu = clouds.uniforms;
      cu.uCoverage.value = c.coverage;
      cu.uSunColor.value.set(...c.sun); cu.uSunPower.value = c.power;
      cu.uAmbTop.value.set(...c.ambTop); cu.uAmbBottom.value.set(...c.ambBottom);
      cu.uGround.value.set(...c.ground);
      cu.uDownHaze.value.set(...(c.downHaze || [0.16, 0.3, 0.58]));
    },
    // replace the analytic environment with a capture of the real sky + clouds
    captureEnvironment() {
      const cube = clouds.captureEnv();
      if (!cube) return env;
      const gen = new THREE.PMREMGenerator(renderer);
      const tex = gen.fromCubemap(cube.texture).texture;
      gen.dispose();
      cube.dispose();
      return tex;
    },
  };
}

// A real-looking star field: positions spread over the sky with more along the Milky Way,
// brightness following the magnitude distribution (a few bright, thousands faint), colours by
// temperature (blue-white to orange), a soft point-spread disc and a faint twinkle. Stars fade
// out towards the horizon where the light passes through more air.
function makeStarField(count, pixelRatio) {
  const rng = mulberry32(31415);
  const n = new THREE.Vector3(0.42, 0.55, -0.72).normalize();
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count), seed = new Float32Array(count);
  const temps = [[0.66, 0.75, 1.0], [0.82, 0.88, 1.0], [1.0, 0.98, 0.95], [1.0, 0.94, 0.82], [1.0, 0.85, 0.66], [1.0, 0.76, 0.55]];
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  a.set(1, 0, 0).sub(n.clone().multiplyScalar(n.x)).normalize();
  b.crossVectors(n, a);
  for (let i = 0; i < count; i++) {
    if (rng() < 0.35) {
      // concentrated towards the galactic plane
      const th = rng() * Math.PI * 2, lat = (rng() + rng() + rng() - 1.5) * 0.22;
      v.copy(a).multiplyScalar(Math.cos(th) * Math.cos(lat)).addScaledVector(b, Math.sin(th) * Math.cos(lat)).addScaledVector(n, Math.sin(lat));
    } else {
      const z = rng() * 2 - 1, th = rng() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      v.set(r * Math.cos(th), z, r * Math.sin(th));
    }
    v.normalize();
    pos.set([v.x, v.y, v.z], i * 3);
    const m = Math.pow(rng(), 4.2);                        // apparent brightness, mostly faint
    const t = rng();
    const c = temps[t < 0.08 ? 0 : t < 0.22 ? 1 : t < 0.62 ? 2 : t < 0.82 ? 3 : t < 0.94 ? 4 : 5];
    const k = 0.22 + m * 2.3;
    col.set([c[0] * k, c[1] * k, c[2] * k], i * 3);
    size[i] = (1.1 + m * 3.2) * pixelRatio;
    seed[i] = rng() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uStars: { value: 1 } },
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aColor; attribute float aSize; attribute float aSeed;
      uniform float uTime; uniform float uStars;
      varying vec3 vCol;
      void main() {
        vec3 dir = normalize(position);
        float ext = smoothstep(-0.035, 0.16, dir.y);                   // extinction near the horizon
        float tw = 1.0 + 0.16 * sin(uTime * (2.3 + fract(aSeed) * 3.1) + aSeed) * sin(uTime * 1.7 + aSeed * 3.0);
        vCol = aColor * ext * tw * uStars * mix(vec3(1.0, 0.82, 0.7), vec3(1.0), ext);
        vec4 wp = vec4(cameraPosition + dir * 16000.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
        gl_PointSize = aSize * mix(0.7, 1.0, ext);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(q, q);
        if (r2 > 1.0) discard;
        float psf = exp(-r2 * 5.5) + 0.35 * exp(-r2 * 1.6) * 0.25;   // sharp core, faint halo
        gl_FragColor = vec4(vCol * psf, 1.0);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -90;
  pts.name = 'stars';
  return pts;
}
