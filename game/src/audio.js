// audio.js — every sound is synthesized with WebAudio: no audio files, no
// network. A shared noise buffer feeds the gunshots, impacts and explosions;
// short oscillators make the clicks, beeps and stingers.
export function createAudio() {
  const audio = {
    ctx: null, master: null, noiseBuf: null, enabled: false,
  };

  audio.init = () => {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.4;
      audio.master.connect(audio.ctx.destination);
      const len = audio.ctx.sampleRate * 1;
      audio.noiseBuf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
      const d = audio.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      audio.enabled = true;
    } catch (e) { audio.enabled = false; }
  };

  function noise(dur, filterType, freq, gainVal, when = 0) {
    if (!audio.enabled) return;
    const t = audio.ctx.currentTime + when;
    const src = audio.ctx.createBufferSource();
    src.buffer = audio.noiseBuf;
    src.loop = true;
    const f = audio.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq;
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(audio.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, gainVal, type = 'sine', slideTo = 0, when = 0) {
    if (!audio.enabled) return;
    const t = audio.ctx.currentTime + when;
    const o = audio.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(audio.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  audio.shot = (kind) => {
    if (!audio.enabled) return;
    if (kind === 'sniper') {
      noise(0.28, 'lowpass', 900, 0.9); tone(140, 0.22, 0.5, 'sine', 55);
    } else if (kind === 'rifle') {
      noise(0.11, 'bandpass', 1400, 0.7); tone(180, 0.09, 0.35, 'square', 70);
    } else if (kind === 'smg') {
      noise(0.07, 'highpass', 1800, 0.5); tone(220, 0.06, 0.25, 'square', 90);
    } else {
      noise(0.09, 'bandpass', 1100, 0.6); tone(200, 0.07, 0.3, 'square', 80);
    }
  };
  audio.dryFire = () => tone(1400, 0.05, 0.15, 'square');
  audio.reload = () => { tone(900, 0.05, 0.2, 'square'); tone(600, 0.05, 0.2, 'square', 0, 0.18); tone(1200, 0.04, 0.18, 'square', 0, 0.4); };
  audio.hit = (head) => tone(head ? 2400 : 1700, 0.06, 0.25, 'sine');
  audio.kill = () => { tone(880, 0.09, 0.25, 'sine'); tone(1320, 0.12, 0.25, 'sine', 0, 0.09); };
  audio.hurt = () => { noise(0.12, 'lowpass', 500, 0.5); tone(110, 0.14, 0.3, 'sine', 60); };
  audio.step = () => noise(0.05, 'lowpass', 700, 0.12);
  audio.buy = () => { tone(660, 0.07, 0.25, 'sine'); tone(990, 0.1, 0.25, 'sine', 0, 0.07); };
  audio.denied = () => tone(220, 0.15, 0.25, 'square', 160);
  audio.plantBeep = () => tone(1100, 0.08, 0.3, 'square');
  audio.planted = () => { tone(880, 0.15, 0.3, 'sine'); tone(880, 0.15, 0.3, 'sine', 0, 0.2); };
  audio.explosion = () => { noise(1.1, 'lowpass', 320, 1.0); tone(55, 0.9, 0.7, 'sine', 30); };
  audio.roundWin = () => { tone(523, 0.14, 0.3, 'sine'); tone(659, 0.14, 0.3, 'sine', 0, 0.14); tone(784, 0.22, 0.3, 'sine', 0, 0.28); };
  audio.roundLose = () => { tone(392, 0.16, 0.3, 'sine'); tone(311, 0.16, 0.3, 'sine', 0, 0.16); tone(233, 0.3, 0.3, 'sine', 0, 0.32); };
  audio.defuse = () => tone(1500, 0.06, 0.2, 'square');
  audio.flash = () => tone(3200, 0.3, 0.2, 'sine', 1200);
  return audio;
}
