// All sound is synthesized with the Web Audio API — no audio files, no
// network. Engine hum, sirens, gunshots, a bass-driven music loop and UI
// stingers, all behind one mute switch. Nothing throws when audio is
// unavailable; the game plays silent instead.

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;
  let musicOn = false;
  let musicStep = 0;
  let musicTimer = null;

  // A-minor synthwave groove: roots per bar, Am Am F G.
  const BASS = [55, 55, 65.41, 49];
  const CHORDS = [[220, 261.63, 329.63], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]];

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.14;
      musicGain.connect(master);
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 700;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 30;
      const g2 = ctx.createGain();
      g2.gain.value = 0.4;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(g2);
      g2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function noiseBurst(duration, volume, filterFreq) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  function tone(freq, duration, volume, type, when = 0, dest) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(dest || master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function musicTick() {
    if (!ctx || !musicOn || muted) return;
    const bar = Math.floor(musicStep / 8) % 4;
    const step = musicStep % 8;
    if (step === 0 || step === 3 || step === 6) tone(BASS[bar], 0.5, 0.5, 'triangle', 0, musicGain);
    if (step === 0) for (const f of CHORDS[bar]) tone(f, 1.9, 0.06, 'sine', 0, musicGain);
    if (step % 2 === 1) {
      const len = Math.floor(ctx.sampleRate * 0.03);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      src.connect(g);
      g.connect(musicGain);
      src.start();
    }
    musicStep += 1;
  }

  return {
    ensure,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    startMusic() {
      if (!ensure() || musicOn) return;
      musicOn = true;
      musicStep = 0;
      musicTimer = window.setInterval(musicTick, 240);
    },
    stopMusic() {
      musicOn = false;
      if (musicTimer !== null) window.clearInterval(musicTimer);
      musicTimer = null;
    },
    /** speed 0..1 and throttle 0..1, called every frame while driving. */
    engine(speed, throttle) {
      if (!ctx) return;
      const target = throttle > 0 || speed > 0.05 ? 0.05 + throttle * 0.06 + speed * 0.03 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      const freq = 55 + speed * 130 + throttle * 25;
      engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
      engineOsc2.frequency.setTargetAtTime(freq / 2, ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(500 + speed * 1400, ctx.currentTime, 0.1);
    },
    engineOff() {
      if (ctx) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    },
    siren(on, dt) {
      if (!ctx) return;
      if (!on) {
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        return;
      }
      sirenTimer += dt;
      if (sirenTimer > 0.45) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setTargetAtTime(sirenHigh ? 950 : 700, ctx.currentTime, 0.03);
      }
      sirenGain.gain.setTargetAtTime(0.03, ctx.currentTime, 0.2);
    },
    shot() { if (ensure()) { noiseBurst(0.12, 0.5, 2500); tone(160, 0.1, 0.25, 'square'); } },
    shotgun() { if (ensure()) { noiseBurst(0.22, 0.6, 1600); tone(110, 0.16, 0.3, 'square'); } },
    punch() { if (ensure()) noiseBurst(0.08, 0.35, 900); },
    pickup() { if (ensure()) { tone(660, 0.12, 0.2, 'sine'); tone(990, 0.18, 0.2, 'sine', 0.09); } },
    click() { if (ensure()) tone(880, 0.05, 0.12, 'square'); },
    nearMiss() { if (ensure()) { tone(1200, 0.08, 0.14, 'sine'); tone(1500, 0.1, 0.12, 'sine', 0.06); } },
    pass() {
      if (!ensure()) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.35, 0.18, 'triangle', i * 0.11));
    },
    fail() {
      if (!ensure()) return;
      [392, 311.13, 261.63].forEach((f, i) => tone(f, 0.4, 0.16, 'triangle', i * 0.14));
    },
    crash() { if (ensure()) noiseBurst(0.25, 0.5, 700); },
    explosion() { if (ensure()) { noiseBurst(0.6, 0.7, 400); tone(70, 0.5, 0.4, 'sine'); } },
    busted() {
      if (!ensure()) return;
      [440, 440, 349.23, 293.66].forEach((f, i) => tone(f, 0.3, 0.16, 'square', i * 0.16));
    },
  };
}
