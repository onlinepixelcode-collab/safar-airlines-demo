import * as THREE from 'three';
import { SKY_GLSL, skyUniforms } from './skyglsl.js';
import { createClouds } from './clouds.js';

// Lighting / sky presets. `sky` drives the physical atmosphere, `clouds` the volumetric layer.
export const PRESETS = {
  day: {
    sunDir: new THREE.Vector3(0.5, 0.74, -0.45).normalize(),
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
  },
  sunset: {
    sunDir: new THREE.Vector3(0.82, 0.2, -0.53).normalize(),
    sunColor: '#ffb27a', sunIntensity: 2.6,
    hemiSky: '#8b95c4', hemiGround: '#f0bf98', hemiIntensity: 0.7,
    envIntensity: 0.8, exposure: 1.0,
    sky: { turbidity: 6.5, rayleigh: 2.4, mie: 0.006, mieG: 0.86, gain: 0.62 },
    clouds: {
      coverage: 0.5,
      sun: [1.0, 0.66, 0.42], power: 2.7,
      ambTop: [0.3, 0.32, 0.46], ambBottom: [0.28, 0.24, 0.3],
      ground: [0.02, 0.03, 0.06], downHaze: [0.3, 0.26, 0.34],
    },
    glass: { zenith: '#6c78ad', horizon: '#f4c7a2' },
    envBelow: '#e8c4a6',
  },
};

function domeMaterial(preset, { disk = true } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: skyUniforms(preset),
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      ${SKY_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        gl_FragColor = vec4(skyColor(d, ${disk ? 'true' : 'false'}), 1.0);
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

  scene.add(group);

  return {
    group,
    env,
    ready: clouds.ready,
    update: (dt) => clouds.update(dt),
    renderClouds: (camera) => clouds.render(camera),
    setSize: (w, h) => clouds.setSize(w, h),
    setQuality: (l) => clouds.setQuality(l),
    get quality() { return clouds.level; },
    clouds,
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
