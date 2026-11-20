// Procedural Web Audio API synthesizer for Solaris Drift — zero external audio files.

export class SolarisAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private muted = false;
  private unlocked = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.42, this.ctx.currentTime, 0.04);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public unlock(): void {
    if (this.unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.42;
    this.masterGain.connect(this.ctx.destination);

    // Continuous hover-turbine hum
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 180;
    this.engineFilter.Q.value = 2.2;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 62;

    this.engineSubOsc = this.ctx.createOscillator();
    this.engineSubOsc.type = 'triangle';
    this.engineSubOsc.frequency.value = 31;

    this.engineOsc.connect(this.engineFilter);
    this.engineSubOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.engineOsc.start();
    this.engineSubOsc.start();

    this.unlocked = true;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public updateEngine(speedRatio: number, boosting: boolean, active: boolean): void {
    if (!this.ctx || !this.engineOsc || !this.engineSubOsc || !this.engineFilter || !this.engineGain) return;
    const now = this.ctx.currentTime;

    if (!active) {
      this.engineGain.gain.setTargetAtTime(0.0, now, 0.08);
      return;
    }

    const baseFreq = 54 + speedRatio * 56 + (boosting ? 32 : 0);
    this.engineOsc.frequency.setTargetAtTime(baseFreq, now, 0.06);
    this.engineSubOsc.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.06);
    this.engineFilter.frequency.setTargetAtTime(
      170 + speedRatio * 260 + (boosting ? 360 : 0),
      now,
      0.06,
    );
    this.engineGain.gain.setTargetAtTime(boosting ? 0.14 : 0.085, now, 0.08);
  }

  public playRingPass(combo: number): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const semitoneLift = Math.min(combo, 10) * 1.1;
    const rootFreq = 440 * Math.pow(2, semitoneLift / 12);

    this.scheduleTone(rootFreq, 'sine', now, 0.13, 0.22);
    this.scheduleTone(rootFreq * 1.25, 'triangle', now + 0.045, 0.16, 0.18);
    this.scheduleTone(rootFreq * 1.5, 'sine', now + 0.09, 0.2, 0.14);
  }

  public playCrystalPickup(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    this.scheduleTone(784, 'sine', now, 0.09, 0.18);
    this.scheduleTone(1174.66, 'sine', now + 0.04, 0.15, 0.16);
  }

  public playShieldRestore(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    this.scheduleTone(392, 'triangle', now, 0.12, 0.2);
    this.scheduleTone(523.25, 'triangle', now + 0.06, 0.14, 0.2);
    this.scheduleTone(784, 'sine', now + 0.12, 0.22, 0.2);
  }

  public playCannonFire(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.11);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1100, now);
    filter.Q.value = 1.6;

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playBoostIgnite(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.18);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.24);
  }

  public playDroneShatter(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    this.playNoiseBurst(0.24, 950, 0.32);

    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(165, now);
    sub.frequency.exponentialRampToValueAtTime(42, now + 0.22);
    subGain.gain.setValueAtTime(0.32, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.25);
  }

  public playHullImpact(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    this.playNoiseBurst(0.32, 520, 0.42);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(125, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.28);
    gain.gain.setValueAtTime(0.34, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.31);
  }

  public playSectorAdvance(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    this.scheduleTone(330, 'triangle', now, 0.16, 0.16);
    this.scheduleTone(440, 'triangle', now + 0.08, 0.18, 0.16);
    this.scheduleTone(659.25, 'sine', now + 0.16, 0.3, 0.2);
  }

  private scheduleTone(
    freq: number,
    type: OscillatorType,
    startTime: number,
    duration: number,
    peakGain: number,
  ): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  private playNoiseBurst(duration: number, cutoffHz: number, volume: number): void {
    if (!this.ctx || !this.masterGain) return;
    const sampleCount = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, sampleCount, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / sampleCount, 1.5);
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoffHz;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start();
  }

  public dispose(): void {
    if (this.engineOsc) {
      try {
        this.engineOsc.stop();
        this.engineOsc.disconnect();
      } catch {
        // ignore if already stopped
      }
    }
    if (this.engineSubOsc) {
      try {
        this.engineSubOsc.stop();
        this.engineSubOsc.disconnect();
      } catch {
        // ignore
      }
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.unlocked = false;
  }
}
