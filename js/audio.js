// Cabin sound, made live with Web Audio: the deep drone of the engines and the hiss of air over
// the fuselage, slowly breathing as in a real cabin, quieter up front in First and The
// Residence, and the two-tone cabin chime when you settle into a seat. After the chime comes
// the welcome announcement from safartravelagency.com (assets/audio/safar-welcome.mp3), played
// through the same "cabin speaker" filter the website uses, with the cabin sound dipping under it.
// It only starts after a tap or click (browsers require that) and remembers if you mute it.
const VOICE_URL = 'assets/audio/safar-welcome.mp3';

export function createCabinAudio() {
  let ctx = null, master = null, lowF = null, airG = null;
  let muted = false, level = 0, inside = false;
  let voiceLoad = null, voiceSrc = null;
  try { muted = localStorage.getItem('safar-sound') === 'off'; } catch (e) { /* private mode */ }
  const LEVEL = { economy: 0.5, premium: 0.46, business: 0.38, first: 0.3, residence: 0.26 };

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    // brown noise: the broadband roar of air and engines
    const len = ctx.sampleRate * 6, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
    }
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    lowF = ctx.createBiquadFilter(); lowF.type = 'lowpass'; lowF.frequency.value = 240; lowF.Q.value = 0.4;
    const lowG = ctx.createGain(); lowG.gain.value = 1.0;
    const air = ctx.createBiquadFilter(); air.type = 'bandpass'; air.frequency.value = 1100; air.Q.value = 0.5;
    airG = ctx.createGain(); airG.gain.value = 0.1;
    noise.connect(lowF).connect(lowG).connect(master);
    noise.connect(air).connect(airG).connect(master);
    // the engines' low tone and a faint harmonic
    for (const [f, a] of [[88, 0.05], [176, 0.018], [264, 0.006]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = a; o.connect(g).connect(master); o.start();
    }
    // a slow swell in the roar
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 30; lfo.connect(lfoG).connect(lowF.frequency); lfo.start();
    noise.start();
    loadVoice();
    return true;
  }
  // fetch and decode the announcement once, in the background
  function loadVoice() {
    if (!voiceLoad && ctx) {
      voiceLoad = fetch(VOICE_URL)
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then((b) => new Promise((ok, no) => ctx.decodeAudioData(b, ok, no)))
        .catch(() => null);
    }
    return voiceLoad || Promise.resolve(null);
  }
  function stopVoice() {
    if (!voiceSrc) return;
    try { voiceSrc.stop(); } catch (e) { /* already ended */ }
    voiceSrc = null;
  }
  function ramp(v, t) {
    if (!ctx) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(v, now + t);
  }
  function chime(delay = 0.8) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    [[1046.5, 0], [830.6, 0.62]].forEach(([f, dt]) => {
      for (const [mul, amp] of [[1, 0.16], [2.01, 0.03], [3.0, 0.012]]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0 + dt);
        g.gain.linearRampToValueAtTime(amp, t0 + dt + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 2.2);
        o.connect(g).connect(ctx.destination); o.start(t0 + dt); o.stop(t0 + dt + 2.3);
      }
    });
  }
  return {
    // browsers (Safari above all) only allow sound that is started from a tap or click: build
    // the sound graph silently on the first one
    unlock() { if (!ctx && !muted) build(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    // stepping into a seat
    enter(cls, { ding = true } = {}) {
      if (!ctx && !build()) return;
      if (ctx.state === 'suspended') ctx.resume();
      level = LEVEL[cls] ?? 0.45;
      inside = true;
      if (!muted) ramp(level, 1.8);
      if (ding) chime();
    },
    setClass(cls) { level = LEVEL[cls] ?? level; if (inside && !muted) ramp(level, 1.2); },
    leave() { inside = false; stopVoice(); ramp(0, 1.2); },
    // the website's welcome announcement; resolves false if the recording couldn't be loaded
    announce() {
      if (!ctx || muted) return Promise.resolve(false);
      return loadVoice().then((buf) => {
        if (!buf) return false;
        if (muted || !inside || voiceSrc) return true;
        const src = ctx.createBufferSource(); src.buffer = buf;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 260;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
        const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1900; pk.gain.value = 4; pk.Q.value = 0.9;
        const g = ctx.createGain(); g.gain.value = 1.15;
        src.connect(hp).connect(lp).connect(pk).connect(g).connect(ctx.destination);
        voiceSrc = src;
        if (inside && !muted) ramp(level * 0.35, 0.5);
        src.onended = () => { if (voiceSrc === src) voiceSrc = null; if (inside && !muted) ramp(level, 1.2); };
        src.start(ctx.currentTime + 0.1);
        return true;
      });
    },
    // quieter while the captain is speaking
    duck(on) { if (inside && !muted) ramp(on ? level * 0.35 : level, on ? 0.4 : 1.2); },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('safar-sound', muted ? 'off' : 'on'); } catch (e) { /* private mode */ }
      if (muted) { stopVoice(); ramp(0, 0.3); }
      else if (inside) { if (!ctx) build(); if (ctx.state === 'suspended') ctx.resume(); ramp(level, 0.6); }
      return muted;
    },
    get muted() { return muted; },
  };
}
