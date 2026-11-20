// Synthesized sound only: every effect is built from oscillators and filtered
// noise in code, so the game ships no audio files and makes no network request.
// The audio context is created on the first user gesture (the start button).

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  // A lazy bass groove: A minor walk, one note every 0.22 s, very quiet.
  const BASS_LINE = [55, 0, 55, 65.41, 0, 55, 82.41, 73.42, 55, 0, 55, 65.41, 98, 82.41, 73.42, 65.41];

  function ensure() {
    if (ctx) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);

      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();

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
      ctx = null;
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst(duration, filterFreq, volume, type = 'lowpass') {
    if (!ensure()) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  function tone(freq, duration, volume, type = 'sine', when = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
    setEngine(speed, driving) {
      if (!ctx) return;
      const target = driving ? 0.045 + Math.min(Math.abs(speed) / 40, 1) * 0.05 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      const freq = 55 + Math.abs(speed) * 3.2;
      engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
      engineOsc2.frequency.setTargetAtTime(freq / 2, ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(280 + Math.abs(speed) * 22, ctx.currentTime, 0.1);
    },
    setSiren(on, dt) {
      if (!ctx) return;
      if (on) {
        sirenTimer -= dt;
        if (sirenTimer <= 0) {
          sirenTimer = 0.42;
          sirenHigh = !sirenHigh;
          sirenOsc.frequency.setTargetAtTime(sirenHigh ? 920 : 660, ctx.currentTime, 0.05);
        }
        sirenGain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.2);
      } else {
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      }
    },
    gunshot() { burst(0.16, 1800, 0.5, 'bandpass'); tone(160, 0.08, 0.25, 'square'); },
    punch() { burst(0.1, 300, 0.4); },
    crash(intensity = 1) { burst(0.25, 500, 0.35 * intensity); },
    pickup() { tone(523.25, 0.12, 0.22); tone(659.25, 0.12, 0.22, 'sine', 0.09); tone(783.99, 0.2, 0.22, 'sine', 0.18); },
    missionComplete() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.22, 0.22, 'triangle', i * 0.11));
    },
    denied() { tone(180, 0.18, 0.2, 'sawtooth'); },
    startMusic() {
      if (!ensure() || musicTimer) return;
      musicTimer = setInterval(() => {
        if (!ctx || muted) return;
        const freq = BASS_LINE[musicStep % BASS_LINE.length];
        musicStep += 1;
        if (freq > 0) tone(freq, 0.22, 0.07, 'triangle');
      }, 220);
    },
    stopMusic() {
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    },
  };
}
