// Procedural audio: every sound is synthesized with WebAudio — no audio
// files, no network. Music is a slow synth loop; effects are short bursts.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let muted = false;
  let musicStep = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: a low sawtooth whose pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a triangle wave alternating between two notes.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 1200;
    const g = ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
  }

  // A slow minor-key bassline + pad, one step every 320 ms.
  const BASS = [110, 110, 130.8, 98, 110, 110, 146.8, 130.8];
  function startMusic() {
    if (!ctx || musicTimer) return;
    musicTimer = setInterval(() => {
      if (muted || !ctx) return;
      const step = musicStep % 8;
      blip(BASS[step], 0.3, 'triangle', 0.12);
      if (step % 2 === 0) blip(BASS[step] * 2, 0.5, 'sine', 0.05);
      musicStep += 1;
    }, 320);
  }

  return {
    ensure,
    startMusic,
    engine(speed01, throttle) {
      if (!ctx || !engineGain) return;
      const on = throttle > 0.05 || speed01 > 0.02;
      engineGain.gain.value = muted ? 0 : (on ? 0.05 + speed01 * 0.06 : 0);
      engineOsc.frequency.value = 50 + speed01 * 130 + throttle * 25;
    },
    siren(on) {
      if (!ctx || !sirenGain) return;
      if (on && !muted) {
        sirenGain.gain.value = 0.045;
        sirenOsc.frequency.value = (Math.floor(Date.now() / 450) % 2 === 0) ? 720 : 960;
      } else {
        sirenGain.gain.value = 0;
      }
    },
    gunshot() { noise(0.12, 0.35, 900); blip(140, 0.1, 'square', 0.18, 60); },
    punch() { noise(0.07, 0.2, 500); },
    crash() { noise(0.3, 0.4, 700); },
    click() { blip(660, 0.06, 'sine', 0.12); },
    pickup() { blip(520, 0.12, 'sine', 0.16, 880); },
    nearMiss() { blip(880, 0.15, 'sine', 0.14, 1320); },
    missionDone() { blip(523, 0.14, 'triangle', 0.18); setTimeout(() => blip(659, 0.14, 'triangle', 0.18), 130); setTimeout(() => blip(784, 0.22, 'triangle', 0.18), 260); },
    busted() { blip(330, 0.3, 'sawtooth', 0.15, 165); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
  };
}
