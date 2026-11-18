// All sound is synthesized with the Web Audio API — no audio files, no
// network. Engine hum, sirens, gunshots, a bass-driven music loop and UI
// stingers, all behind one mute switch. Nothing throws when audio is
// unavailable; the game plays silent instead.

export function buildSound() {
  const s = {
    ac: null,
    bus: null,
    tuneBus: null,
    humA: null,
    humB: null,
    humBus: null,
    humFilter: null,
    wailOsc: null,
    wailBus: null,
    wailT: 0,
    wailUp: false,
    silent: false,
    playing: false,
    step: 0,
    grooveTimer: null,
  };

  // A-minor synthwave groove: roots per bar, Am Am F G.
  const ROOTS = [55, 55, 65.41, 49];
  const PADS = [[220, 261.63, 329.63], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]];

  function ready() {
    if (s.ac) {
      if (s.ac.state === 'suspended') s.ac.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ac = new AC();
      s.ac = ac;
      s.bus = ac.createGain();
      s.bus.gain.value = s.silent ? 0 : 0.5;
      s.bus.connect(ac.destination);
      s.tuneBus = ac.createGain();
      s.tuneBus.gain.value = 0.14;
      s.tuneBus.connect(s.bus);
      s.humBus = ac.createGain();
      s.humBus.gain.value = 0;
      s.humFilter = ac.createBiquadFilter();
      s.humFilter.type = 'lowpass';
      s.humFilter.frequency.value = 700;
      s.humA = ac.createOscillator();
      s.humA.type = 'sawtooth';
      s.humA.frequency.value = 60;
      s.humB = ac.createOscillator();
      s.humB.type = 'square';
      s.humB.frequency.value = 30;
      const g2 = ac.createGain();
      g2.gain.value = 0.4;
      s.humA.connect(s.humFilter);
      s.humB.connect(g2);
      g2.connect(s.humFilter);
      s.humFilter.connect(s.humBus);
      s.humBus.connect(s.bus);
      s.humA.start();
      s.humB.start();
      s.wailOsc = ac.createOscillator();
      s.wailOsc.type = 'triangle';
      s.wailOsc.frequency.value = 750;
      s.wailBus = ac.createGain();
      s.wailBus.gain.value = 0;
      s.wailOsc.connect(s.wailBus);
      s.wailBus.connect(s.bus);
      s.wailOsc.start();
    } catch {
      s.ac = null;
      return false;
    }
    return true;
  }

  function burst(duration, volume, cutoff) {
    if (!s.ac) return;
    const len = Math.floor(s.ac.sampleRate * duration);
    const buf = s.ac.createBuffer(1, len, s.ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = s.ac.createBufferSource();
    src.buffer = buf;
    const filter = s.ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = s.ac.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(s.bus);
    src.start();
  }

  function blip(freq, duration, volume, type, when = 0, dest) {
    if (!s.ac) return;
    const t = s.ac.currentTime + when;
    const osc = s.ac.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = s.ac.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(dest || s.bus);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function grooveStep() {
    if (!s.ac || !s.playing || s.silent) return;
    const bar = Math.floor(s.step / 8) % 4;
    const step = s.step % 8;
    if (step === 0 || step === 3 || step === 6) blip(ROOTS[bar], 0.5, 0.5, 'triangle', 0, s.tuneBus);
    if (step === 0) for (const f of PADS[bar]) blip(f, 1.9, 0.06, 'sine', 0, s.tuneBus);
    if (step % 2 === 1) {
      const len = Math.floor(s.ac.sampleRate * 0.03);
      const buf = s.ac.createBuffer(1, len, s.ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = s.ac.createBufferSource();
      src.buffer = buf;
      const g = s.ac.createGain();
      g.gain.value = 0.05;
      src.connect(g);
      g.connect(s.tuneBus);
      src.start();
    }
    s.step += 1;
  }

  return {
    ensure: ready,
    get muted() { return s.silent; },
    toggleMute() {
      s.silent = !s.silent;
      if (s.bus) s.bus.gain.value = s.silent ? 0 : 0.5;
      return s.silent;
    },
    startMusic() {
      if (!ready() || s.playing) return;
      s.playing = true;
      s.step = 0;
      s.grooveTimer = window.setInterval(grooveStep, 240);
    },
    stopMusic() {
      s.playing = false;
      if (s.grooveTimer !== null) window.clearInterval(s.grooveTimer);
      s.grooveTimer = null;
    },
    /** speed 0..1 and throttle 0..1, called every frame while driving. */
    engine(speed, throttle) {
      if (!s.ac) return;
      const target = throttle > 0 || speed > 0.05 ? 0.05 + throttle * 0.06 + speed * 0.03 : 0;
      s.humBus.gain.setTargetAtTime(target, s.ac.currentTime, 0.08);
      const freq = 55 + speed * 130 + throttle * 25;
      s.humA.frequency.setTargetAtTime(freq, s.ac.currentTime, 0.08);
      s.humB.frequency.setTargetAtTime(freq / 2, s.ac.currentTime, 0.08);
      s.humFilter.frequency.setTargetAtTime(500 + speed * 1400, s.ac.currentTime, 0.1);
    },
    engineOff() {
      if (s.ac) s.humBus.gain.setTargetAtTime(0, s.ac.currentTime, 0.1);
    },
    siren(on, dt) {
      if (!s.ac) return;
      if (!on) {
        s.wailBus.gain.setTargetAtTime(0, s.ac.currentTime, 0.2);
        return;
      }
      s.wailT += dt;
      if (s.wailT > 0.45) {
        s.wailT = 0;
        s.wailUp = !s.wailUp;
        s.wailOsc.frequency.setTargetAtTime(s.wailUp ? 950 : 700, s.ac.currentTime, 0.03);
      }
      s.wailBus.gain.setTargetAtTime(0.03, s.ac.currentTime, 0.2);
    },
    shot() { if (ready()) { burst(0.12, 0.5, 2500); blip(160, 0.1, 0.25, 'square'); } },
    shotgun() { if (ready()) { burst(0.22, 0.6, 1600); blip(110, 0.16, 0.3, 'square'); } },
    punch() { if (ready()) burst(0.08, 0.35, 900); },
    pickup() { if (ready()) { blip(660, 0.12, 0.2, 'sine'); blip(990, 0.18, 0.2, 'sine', 0.09); } },
    click() { if (ready()) blip(880, 0.05, 0.12, 'square'); },
    nearMiss() { if (ready()) { blip(1200, 0.08, 0.14, 'sine'); blip(1500, 0.1, 0.12, 'sine', 0.06); } },
    pass() {
      if (!ready()) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(f, 0.35, 0.18, 'triangle', i * 0.11));
    },
    fail() {
      if (!ready()) return;
      [392, 311.13, 261.63].forEach((f, i) => blip(f, 0.4, 0.16, 'triangle', i * 0.14));
    },
    crash() { if (ready()) burst(0.25, 0.5, 700); },
    explosion() { if (ready()) { burst(0.6, 0.7, 400); blip(70, 0.5, 0.4, 'sine'); } },
    busted() {
      if (!ready()) return;
      [440, 440, 349.23, 293.66].forEach((f, i) => blip(f, 0.3, 0.16, 'square', i * 0.16));
    },
  };
}
