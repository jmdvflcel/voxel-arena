export class AudioSystem {
  constructor() {
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.enabled = true;
    this.volume = 0.45;
    this.lastFootstep = 0;
    this.buffers = new Map();
    this.assetLoadStarted = false;
    this.assetManifest = null;
    this.noiseBuffer = null;
  }

  ensure() {
    if (!this.enabled) return false;

    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;

      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.compressor = this.context.createDynamicsCompressor();
      this.master.gain.value = this.volume;
      this.compressor.threshold.value = -16;
      this.compressor.knee.value = 14;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.18;
      this.master.connect(this.compressor);
      this.compressor.connect(this.context.destination);
      this.loadAssets();
    }

    if (this.context.state === "suspended") {
      this.context.resume();
    }

    return true;
  }

  async loadAssets() {
    if (this.assetLoadStarted || !this.context) return;
    this.assetLoadStarted = true;
    try {
      const response = await fetch("/assets/audio/manifest.json", { cache: "force-cache" });
      if (!response.ok) return;
      this.assetManifest = await response.json();
      await Promise.all(Object.entries(this.assetManifest).map(async ([name, url]) => {
        try {
          const audioResponse = await fetch(url, { cache: "force-cache" });
          if (!audioResponse.ok) return;
          const arrayBuffer = await audioResponse.arrayBuffer();
          const buffer = await this.context.decodeAudioData(arrayBuffer.slice(0));
          this.buffers.set(name, buffer);
        } catch {
          // Runtime synthesis remains a no-network fallback.
        }
      }));
    } catch {
      // The game remains fully playable when optional authored samples fail.
    }
  }

  playSample(name, { gain = 0.18, pan = 0, playbackRate = 1 } = {}) {
    if (!this.ensure()) return false;
    const buffer = this.buffers.get(name);
    if (!buffer) return false;
    const source = this.context.createBufferSource();
    const envelope = this.context.createGain();
    const panner = this.context.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value = Math.max(0.55, Math.min(1.8, playbackRate));
    envelope.gain.value = gain;
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.master);
    source.onended = () => {
      source.disconnect();
      envelope.disconnect();
      panner.disconnect();
    };
    source.start();
    return true;
  }

  playImpact(surface = "stone", pan = 0) {
    const key = surface === "metal" ? "impactMetal" : "impactStone";
    if (this.playSample(key, { gain: surface === "metal" ? 0.11 : 0.085, pan, playbackRate: 0.92 + Math.random() * 0.16 })) return;
    this.noise({ duration: 0.06, gain: 0.045, cutoff: surface === "metal" ? 7200 : 2400, pan });
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));

    if (this.master) {
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.02);
    }
  }

  tone({
    frequency = 440,
    endFrequency = frequency,
    duration = 0.1,
    type = "sine",
    gain = 0.15,
    attack = 0.005,
    release = 0.05,
    pan = 0
  }) {
    if (!this.ensure()) return;

    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const panner = this.context.createStereoPanner();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);

    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), now + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);

    panner.pan.value = Math.max(-1, Math.min(1, pan));

    oscillator.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.master);

    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      panner.disconnect();
    };
    oscillator.start(now);
    oscillator.stop(now + duration + release + 0.02);
  }

  ensureNoiseBuffer() {
    if (this.noiseBuffer || !this.context) return this.noiseBuffer;
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, sampleRate, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index++) channel[index] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  noise({ duration = 0.08, gain = 0.1, cutoff = 5000, pan = 0 }) {
    if (!this.ensure()) return;

    const buffer = this.ensureNoiseBuffer();
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    const panner = this.context.createStereoPanner();
    const now = this.context.currentTime;

    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    panner.pan.value = pan;

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.master);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
      panner.disconnect();
    };
    const maxOffset = Math.max(0, buffer.duration - duration);
    source.start(now, Math.random() * maxOffset, duration);
  }

  playWeapon(name, pan = 0) {
    const sampleName = name === "burst" || name === "lmg" ? "rifle" : name;
    const sampleGain = name === "shotgun" ? 0.28 : name === "railgun" ? 0.22 : name === "marksman" ? 0.2 : name === "sword" || name === "voidblade" ? 0.16 : 0.17;
    if (this.playSample(sampleName, { gain: sampleGain, pan, playbackRate: name === "voidblade" ? 0.72 : 0.96 + Math.random() * 0.08 })) return;
    if (name === "pistol") {
      this.noise({ duration: 0.07, gain: 0.16, cutoff: 7200 });
      this.tone({ frequency: 150, endFrequency: 80, duration: 0.08, type: "square", gain: 0.1 });
    } else if (name === "smg") {
      this.noise({ duration: 0.035, gain: 0.1, cutoff: 9800 });
      this.tone({ frequency: 280, endFrequency: 120, duration: 0.04, type: "square", gain: 0.055 });
    } else if (name === "rifle") {
      this.noise({ duration: 0.05, gain: 0.13, cutoff: 8800 });
      this.tone({ frequency: 220, endFrequency: 105, duration: 0.055, type: "sawtooth", gain: 0.07 });
    } else if (name === "burst") {
      this.noise({ duration: 0.075, gain: 0.14, cutoff: 9000 });
      this.tone({ frequency: 340, endFrequency: 130, duration: 0.08, type: "square", gain: 0.08 });
    } else if (name === "shotgun") {
      this.noise({ duration: 0.14, gain: 0.24, cutoff: 5800 });
      this.tone({ frequency: 115, endFrequency: 48, duration: 0.14, type: "square", gain: 0.15 });
    } else if (name === "lmg") {
      this.noise({ duration: 0.075, gain: 0.18, cutoff: 7200 });
      this.tone({ frequency: 160, endFrequency: 75, duration: 0.08, type: "sawtooth", gain: 0.1 });
    } else if (name === "marksman") {
      this.noise({ duration: 0.11, gain: 0.18, cutoff: 8000 });
      this.tone({ frequency: 260, endFrequency: 70, duration: 0.12, type: "sawtooth", gain: 0.12 });
    } else if (name === "railgun") {
      this.tone({ frequency: 980, endFrequency: 115, duration: 0.22, type: "sawtooth", gain: 0.14 });
      this.noise({ duration: 0.15, gain: 0.2, cutoff: 9600 });
    } else if (name === "voidblade") {
      this.tone({ frequency: 160, endFrequency: 42, duration: 0.28, type: "sawtooth", gain: 0.12 });
      this.tone({ frequency: 880, endFrequency: 260, duration: 0.2, type: "sine", gain: 0.075 });
      this.noise({ duration: 0.16, gain: 0.08, cutoff: 5200 });
    } else if (name === "sword") {
      this.tone({ frequency: 680, endFrequency: 165, duration: 0.16, type: "triangle", gain: 0.105 });
      this.noise({ duration: 0.105, gain: 0.055, cutoff: 4600 });
    }
  }

  playMeleeHit(heavy = false) {
    if (this.playSample("meleeHit", { gain: heavy ? 0.2 : 0.14, playbackRate: heavy ? 0.82 : 1.05 })) return;
    this.noise({ duration: heavy ? 0.11 : 0.075, gain: heavy ? 0.15 : 0.1, cutoff: heavy ? 2300 : 3400 });
    this.tone({
      frequency: heavy ? 150 : 240,
      endFrequency: heavy ? 62 : 105,
      duration: heavy ? 0.13 : 0.09,
      type: "square",
      gain: heavy ? 0.105 : 0.075
    });
  }

  playGrappleLaunch() {
    if (this.playSample("grapple", { gain: 0.1, playbackRate: 1.32 })) return;
    this.tone({ frequency: 520, endFrequency: 1180, duration: 0.075, type: "triangle", gain: 0.052 });
    this.noise({ duration: 0.045, gain: 0.038, cutoff: 7600 });
  }

  playGrappleAttach() {
    if (this.playSample("grapple", { gain: 0.13, playbackRate: 1.05 })) return;
    this.tone({ frequency: 1280, endFrequency: 420, duration: 0.085, type: "triangle", gain: 0.07 });
    this.tone({ frequency: 210, endFrequency: 360, duration: 0.12, type: "sine", gain: 0.055 });
  }

  playGrappleRelease() {
    this.noise({ duration: 0.075, gain: 0.07, cutoff: 6200 });
    this.tone({ frequency: 360, endFrequency: 105, duration: 0.1, type: "sine", gain: 0.055 });
  }

  playDryFire() {
    this.tone({ frequency: 145, endFrequency: 118, duration: 0.035, type: "square", gain: 0.035 });
  }

  playHit(headshot = false) {
    if (this.playSample(headshot ? "headshot" : "hit", { gain: headshot ? 0.15 : 0.1 })) return;
    this.tone({
      frequency: headshot ? 1120 : 720,
      endFrequency: headshot ? 850 : 520,
      duration: 0.06,
      type: "square",
      gain: headshot ? 0.12 : 0.08
    });
  }

  playDamage() {
    this.tone({
      frequency: 130,
      endFrequency: 58,
      duration: 0.16,
      type: "sawtooth",
      gain: 0.12
    });
  }

  playKill() {
    this.tone({ frequency: 420, endFrequency: 820, duration: 0.13, type: "square", gain: 0.09 });
    setTimeout(() => {
      this.tone({ frequency: 620, endFrequency: 1240, duration: 0.16, type: "square", gain: 0.08 });
    }, 90);
  }

  playParry() {
    this.tone({ frequency: 1250, endFrequency: 410, duration: 0.14, type: "triangle", gain: 0.14 });
  }

  playReload() {
    this.tone({ frequency: 270, endFrequency: 220, duration: 0.08, type: "square", gain: 0.05 });
    setTimeout(() => {
      this.tone({ frequency: 350, endFrequency: 310, duration: 0.07, type: "square", gain: 0.05 });
    }, 190);
  }

  playPickup() {
    this.tone({ frequency: 520, endFrequency: 980, duration: 0.2, type: "sine", gain: 0.08 });
  }

  playPower(name) {
    const frequencies = {
      speed: 720,
      dash: 980,
      overshield: 430,
      rapid: 850,
      damage: 310,
      regen: 610,
      jump: 760
    };
    const frequency = frequencies[name] || 620;
    this.tone({ frequency, endFrequency: frequency * 1.75, duration: 0.2, type: "triangle", gain: 0.09 });
  }

  playDash() {
    this.noise({ duration: 0.09, gain: 0.11, cutoff: 8400 });
    this.tone({ frequency: 900, endFrequency: 180, duration: 0.11, type: "sine", gain: 0.08 });
  }

  playFootstep(speed, surface = "stone") {
    const now = performance.now();
    const interval = Math.max(210, 520 - speed * 35);

    if (now - this.lastFootstep < interval) return;

    this.lastFootstep = now;
    const sample = surface === "grass" ? "footstepGrass" : "footstepStone";
    if (this.playSample(sample, { gain: 0.045 + speed * 0.002, playbackRate: 0.9 + Math.random() * 0.18 })) return;
    const cutoff = surface === "grass" ? 1300 : 2600;
    this.noise({ duration: 0.045, gain: 0.035 + speed * 0.003, cutoff });
    this.tone({
      frequency: surface === "grass" ? 95 : 135,
      endFrequency: 70,
      duration: 0.045,
      type: "sine",
      gain: 0.025
    });
  }
}
