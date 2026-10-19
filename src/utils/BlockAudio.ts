import { type AudioController, audio } from './AudioTools';
/**
 * Native JudgeControl/ProgressControl gesture transitions (v4.0.1 / Phira-Pro).
 * LevelControl serialized preset is 1500 Hz / 0.1 s.
 * The filter is attached to the chart AudioSource (musicController), not the hit-sound mixer.
 * Maximally flat second-order Butterworth response (Q = 1 / sqrt(2)), without a boost at the cutoff frequency.
 */
export class BlockAudio {
  private enabled: boolean | null = null;
  private used = false;
  private readonly defaultCutoff = 22000;
  private targetCutoff = 22000;
  private fromCutoff = 22000;
  private sweepStartTime = 0;
  private sweepDuration = 0;
  private controller: AudioController | null = null;
  public constructor(controller?: AudioController) {
    if (controller) this.attach(controller);
    audio.test(this.applyCurrentFilter.bind(this));
  }
  public attach(controller: AudioController): void {
    this.controller = controller;
    this.applyCurrentFilter();
  }
  public reset(): void {
    this.enabled = null;
    this.used = false;
    this.setLowPassFilter(null, 0);
  }
  public suspend(): void {
    if (this.used) {
      this.reset();
    }
    this.sync(false);
  }
  public sync(touching: boolean): void {
    if (this.enabled === touching) {
      return;
    }
    // On the first touch Unity enables a disabled filter whose stored
    // cutoff is already 1500 Hz. Subsequent entries sweep from 22000 Hz
    // or the currently interrupted release, rather than from the preset.
    const seconds = this.used ? 0.1 : 0;
    const cutoff = touching ? 1500 : null;
    if (this.setLowPassFilter(cutoff, seconds)) {
      this.enabled = touching;
      this.used ||= touching;
    }
  }
  private getMaxFreq(): number {
    const sampleRate = audio.actx?.sampleRate ?? 44100;
    return Math.min(this.defaultCutoff, sampleRate * 0.499);
  }
  private getCurrentCutoff(now: number): number {
    if (this.sweepDuration <= 0 || now <= this.sweepStartTime) {
      return this.fromCutoff;
    }
    if (now >= this.sweepStartTime + this.sweepDuration) {
      return this.targetCutoff;
    }
    const t = (now - this.sweepStartTime) / this.sweepDuration;
    return this.fromCutoff + (this.targetCutoff - this.fromCutoff) * t;
  }
  private setLowPassFilter(cutoff: number | null, seconds: number): boolean {
    const actx = audio.actx;
    const maxFreq = this.getMaxFreq();
    const target = cutoff === null ? maxFreq : Math.min(cutoff, maxFreq);
    if (!actx || !this.controller?.filterNode) {
      this.fromCutoff = target;
      this.targetCutoff = target;
      this.sweepStartTime = 0;
      this.sweepDuration = 0;
      return true;
    }
    const now = actx.currentTime;
    const current = this.getCurrentCutoff(now);
    this.fromCutoff = current;
    this.targetCutoff = target;
    this.sweepStartTime = now;
    this.sweepDuration = Math.max(0, seconds);
    const param = this.controller.filterNode.frequency;
    try {
      if (typeof param.cancelAndHoldAtTime === 'function') {
        param.cancelAndHoldAtTime(now);
      } else {
        param.cancelScheduledValues(now);
        param.setValueAtTime(current, now);
      }
      if (this.sweepDuration > 0) {
        param.linearRampToValueAtTime(target, now + this.sweepDuration);
      } else {
        param.setValueAtTime(target, now);
      }
    } catch (ignoreErr) {
      try {
        param.cancelScheduledValues(now);
        param.setValueAtTime(target, now);
      } catch (ignoreFallbackErr) {
        // Ignored
      }
    }
    return true;
  }
  private applyCurrentFilter(): void {
    if (!this.controller?.filterNode || !audio.actx) return;
    const now = audio.actx.currentTime;
    const maxFreq = this.getMaxFreq();
    const target = Math.min(this.targetCutoff, maxFreq);
    const param = this.controller.filterNode.frequency;
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(target, now);
    } catch (ignoreErr) {
      // Ignored
    }
  }
}
