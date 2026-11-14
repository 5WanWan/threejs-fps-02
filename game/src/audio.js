// Procedural sound: every effect is synthesized with WebAudio (noise buffers,
// oscillators, filters) at runtime. No audio files, no network — the game
// stays plain static files. Every method is a no-op until the player first
// interacts (browsers block AudioContext before a gesture), and all of them
// guard the missing context, so shot mode (no gesture) stays silent and safe.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.42;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration, filterFreq, filterType = 'lowpass', gain = 0.5, decay = 0.001, when = 0 }) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(duration + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(decay, t + duration);
    source.connect(filter).connect(amp).connect(master);
    source.start(t);
    source.stop(t + duration + 0.05);
  }

  function tone({ freq, endFreq = null, duration, type = 'sine', gain = 0.3, when = 0 }) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  const SHOTS = {
    p9: () => { burst({ duration: 0.09, filterFreq: 2400, gain: 0.5 }); tone({ freq: 190, endFreq: 70, duration: 0.08, type: 'triangle', gain: 0.35 }); },
    ar77: () => { burst({ duration: 0.08, filterFreq: 3000, gain: 0.55 }); tone({ freq: 160, endFreq: 60, duration: 0.09, type: 'triangle', gain: 0.4 }); },
    sg12: () => { burst({ duration: 0.22, filterFreq: 1400, gain: 0.8 }); tone({ freq: 120, endFreq: 45, duration: 0.2, type: 'triangle', gain: 0.5 }); },
    sr90: () => { burst({ duration: 0.3, filterFreq: 3600, filterType: 'highpass', gain: 0.6 }); tone({ freq: 220, endFreq: 50, duration: 0.28, type: 'sawtooth', gain: 0.25 }); },
  };

  return {
    resume: ensure,
    setMuted(value) { muted = value; if (master) master.gain.value = value ? 0 : 0.42; },
    shot(weaponId) {
      if (!ensure()) return;
      const fn = SHOTS[weaponId] ?? SHOTS.ar77;
      fn();
    },
    dryFire() { if (ensure()) tone({ freq: 900, duration: 0.03, type: 'square', gain: 0.12 }); },
    reload() {
      if (!ensure()) return;
      tone({ freq: 1400, duration: 0.03, type: 'square', gain: 0.15 });
      tone({ freq: 900, duration: 0.03, type: 'square', gain: 0.15, when: 0.18 });
      tone({ freq: 1800, duration: 0.04, type: 'square', gain: 0.18, when: 0.45 });
    },
    hit(kill) {
      if (!ensure()) return;
      tone({ freq: kill ? 1900 : 1500, duration: 0.05, type: 'square', gain: 0.2 });
      if (kill) tone({ freq: 2400, duration: 0.07, type: 'square', gain: 0.2, when: 0.06 });
    },
    hurt() { if (ensure()) tone({ freq: 220, endFreq: 110, duration: 0.14, type: 'sawtooth', gain: 0.25 }); },
    step() { if (ensure()) burst({ duration: 0.04, filterFreq: 500, gain: 0.06 }); },
    plantBeep(done) {
      if (!ensure()) return;
      tone({ freq: done ? 1560 : 1180, duration: 0.09, type: 'square', gain: 0.22 });
    },
    bombTick() { if (ensure()) tone({ freq: 1000, duration: 0.05, type: 'square', gain: 0.14 }); },
    explode() {
      if (!ensure()) return;
      burst({ duration: 1.4, filterFreq: 700, gain: 1.0 });
      tone({ freq: 90, endFreq: 28, duration: 1.2, type: 'sine', gain: 0.9 });
    },
    roundStart() {
      if (!ensure()) return;
      tone({ freq: 520, duration: 0.16, type: 'triangle', gain: 0.3 });
      tone({ freq: 780, duration: 0.24, type: 'triangle', gain: 0.3, when: 0.16 });
    },
    roundWin() {
      if (!ensure()) return;
      [523, 659, 784].forEach((f, i) => tone({ freq: f, duration: 0.22, type: 'triangle', gain: 0.28, when: i * 0.12 }));
    },
    roundLose() {
      if (!ensure()) return;
      [392, 330, 262].forEach((f, i) => tone({ freq: f, duration: 0.24, type: 'triangle', gain: 0.25, when: i * 0.13 }));
    },
    buy() { if (ensure()) tone({ freq: 1320, duration: 0.06, type: 'square', gain: 0.16 }); },
    denied() { if (ensure()) tone({ freq: 220, duration: 0.12, type: 'square', gain: 0.2 }); },
    grenadePin() { if (ensure()) tone({ freq: 2000, duration: 0.03, type: 'square', gain: 0.12 }); },
    flash() { if (ensure()) tone({ freq: 3200, endFreq: 800, duration: 0.4, type: 'sine', gain: 0.2 }); },
  };
}
