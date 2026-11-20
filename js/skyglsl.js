// Physically based daylight sky (Preetham / Hoffman-Preetham analytic model, as used by
// three.js' Sky object), written as a plain GLSL function so the sky dome, the reflection
// environment and the cloud haze all use exactly the same colours — no seam at the horizon.
export const SKY_GLSL = /* glsl */`
uniform vec3 uSunDir;
uniform float uRayleigh;
uniform float uTurbidity;
uniform float uMieCoef;
uniform float uMieG;
uniform float uSkyGain;
uniform float uAltitude;
uniform float uNight;

const float SKY_PI = 3.141592653589793;
const vec3 SKY_TOTAL_RAYLEIGH = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
const vec3 SKY_MIE_CONST = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);

float skySunIntensity(float zenithAngleCos) {
  zenithAngleCos = clamp(zenithAngleCos, -1.0, 1.0);
  return 1000.0 * max(0.0, 1.0 - exp(-((1.6110731556870734 - acos(zenithAngleCos)) / 1.5)));
}

// dir: normalised view direction. disk: draw the sun's disc.
vec3 skyColor(vec3 dir, bool disk) {
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 sunDir = normalize(uSunDir);
  float sunE = skySunIntensity(dot(sunDir, up));
  vec3 betaR = SKY_TOTAL_RAYLEIGH * uRayleigh;
  float c = (0.2 * uTurbidity) * 10E-18;
  vec3 betaM = 0.434 * c * SKY_MIE_CONST * uMieCoef;

  float zenithAngle = acos(max(0.0, dot(up, dir)));
  float inv = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / SKY_PI), -1.253));
  float sR = 8.4E3 * inv;
  float sM = 1.25E3 * inv;
  vec3 Fex = exp(-(betaR * sR + betaM * sM));

  float cosTheta = dot(dir, sunDir);
  float rPhase = 0.05968310365946075 * (1.0 + pow(cosTheta * 0.5 + 0.5, 2.0));
  float g2 = uMieG * uMieG;
  float mPhase = 0.07957747154594767 * ((1.0 - g2) / pow(max(1e-4, 1.0 - 2.0 * uMieG * cosTheta + g2), 1.5));
  vec3 betaRTheta = betaR * rPhase;
  vec3 betaMTheta = betaM * mPhase;

  vec3 Lin = pow(sunE * ((betaRTheta + betaMTheta) / (betaR + betaM)) * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(sunE * ((betaRTheta + betaMTheta) / (betaR + betaM)) * Fex, vec3(0.5)),
             clamp(pow(1.0 - dot(up, sunDir), 5.0), 0.0, 1.0));

  vec3 L0 = vec3(0.1) * Fex;
  if (disk) {
    float sd = smoothstep(0.99995, 0.99999, cosTheta);
    L0 += sunE * 1200.0 * Fex * sd;
    // glare around the sun: a tight core and a long soft fall-off, no hard edge
    float cs = max(cosTheta, 0.0);
    L0 += sunE * Fex * (1.2 * pow(cs, 9000.0) + 0.05 * pow(cs, 900.0) + 0.012 * pow(cs, 90.0) + 0.004 * pow(cs, 12.0));
  }
  vec3 tex = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);
  vec3 col = pow(tex, vec3(1.0 / 2.4)) * uSkyGain;
  // from cruise altitude (about 11 km) there is far less air overhead than from the ground:
  // the sky above is a deeper, more saturated blue, and only the horizon stays pale
  float zen = smoothstep(0.02, 0.8, dir.y);
  col *= mix(vec3(1.0), vec3(0.7, 0.84, 1.03), zen * uAltitude);
  // night: the daylight model doesn't apply. A moonlit sky seen from cruise altitude is deep
  // blue-black overhead and only a little paler at the horizon, with a soft glow of scattered
  // moonlight around the moon and a faint green airglow band just above the horizon
  if (uNight > 0.0) {
    float hh = clamp(dir.y, -0.1, 1.0);
    vec3 nc = mix(vec3(0.0062, 0.0112, 0.0285), vec3(0.0011, 0.0023, 0.0088), pow(smoothstep(-0.03, 0.8, hh), 0.5));
    float mu = max(cosTheta, 0.0);
    nc += vec3(0.018, 0.026, 0.05) * pow(mu, 40.0) + vec3(0.0045, 0.0065, 0.013) * pow(mu, 6.0);
    nc += vec3(0.0026, 0.0052, 0.0032) * exp(-abs(hh - 0.015) * 28.0);
    col = mix(col, nc, uNight);
  }
  return col;
}
`;

export function skyUniforms(preset) {
  const s = preset.sky;
  return {
    uSunDir: { value: preset.sunDir.clone() },
    uRayleigh: { value: s.rayleigh },
    uTurbidity: { value: s.turbidity },
    uMieCoef: { value: s.mie },
    uMieG: { value: s.mieG },
    uSkyGain: { value: s.gain },
    uAltitude: { value: preset.altitude ?? 1 },
    uNight: { value: preset.night || 0 },
  };
}
