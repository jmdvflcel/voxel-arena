export class AudioSystem {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.45;
    this.lastFootstep = 0;
  }

  ensure() {
    if (!this.enabled) return false;

    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;

      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
    }

    if (this.context.state === "suspended") {
      this.context.resume();
    }

    return true;
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

    oscillator.start(now);
    oscillator.stop(now + duration + release + 0.02);
  }

  noise({ duration = 0.08, gain = 0.1, cutoff = 5000, pan = 0 }) {
    if (!this.ensure()) return;

    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, sampleRate * duration, sampleRate);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < channel.length; i++) {
      channel[i] = Math.random() * 2 - 1;
    }

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
    source.start(now);
  }

  playWeapon(name) {
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
    } else if (name === "sword") {
      this.tone({ frequency: 530, endFrequency: 180, duration: 0.18, type: "sine", gain: 0.11 });
      this.noise({ duration: 0.12, gain: 0.05, cutoff: 4000 });
    }
  }

  playHit(headshot = false) {
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
