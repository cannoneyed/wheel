import { Service } from 'wheel/core';

class AudioService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'AudioService';

  private readonly audio = this.field<AudioContext | null>(null);
  private readonly retryCount = this.field(0);

  readonly attach = this.action((audio: AudioContext) => {
    this.audio.set(audio);
  });

  readonly retry = this.action(() => {
    this.retryCount.set(this.retryCount.get() + 1);
  });
}
