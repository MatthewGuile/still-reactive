// Web Audio transport: playback + the master clock the renderer follows.
// The audio is played untouched, exactly as uploaded.

export class Transport {
  constructor() {
    this.ctx = null;
    this.buffer = null;
    this.source = null;
    this.playing = false;
    this.offset = 0;
    this.startedAt = 0;
    this.onEnded = null;
    this.loopOn = false;     // Ableton-style loop region (seconds)
    this.loopStart = 0;
    this.loopEnd = 0;
  }

  // Loop region in seconds. Uses AudioBufferSourceNode's native, sample-
  // accurate looping; the time getter maps elapsed time back into the loop.
  setLoop(start, end, on) {
    this.loopStart = Math.max(start || 0, 0);
    this.loopEnd = Math.max(end || 0, 0);
    this.loopOn = !!on && this.loopEnd > this.loopStart + 0.01;
    if (this.playing) {
      // restart the source so the new loop points take effect
      const t = this.time;
      this.stop();
      this.offset = t;
      this.play();
    }
  }

  async load(url) {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.stop();
    this.offset = 0;
    const resp = await fetch(url);
    const data = await resp.arrayBuffer();
    this.buffer = await this.ctx.decodeAudioData(data);
  }

  get duration() {
    return this.buffer ? this.buffer.duration : 0;
  }

  get time() {
    if (!this.buffer) return 0;
    let t = this.playing ? this.offset + this.ctx.currentTime - this.startedAt : this.offset;
    // native looping keeps playing past loopEnd in wall-clock terms — fold
    // the elapsed time back into the loop so the visuals follow exactly
    if (this.playing && this.loopOn && this.offset < this.loopEnd && t >= this.loopEnd) {
      const len = this.loopEnd - this.loopStart;
      t = this.loopStart + ((t - this.loopStart) % len);
    }
    return Math.min(Math.max(t, 0), this.duration);
  }

  async play() {
    if (!this.buffer || this.playing) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this.offset >= this.duration - 0.01) this.offset = 0;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    // starting past loopEnd would never reach the loop — play through instead
    if (this.loopOn && this.offset < this.loopEnd) {
      src.loop = true;
      src.loopStart = this.loopStart;
      src.loopEnd = this.loopEnd;
    }
    src.connect(this.ctx.destination);
    src.start(0, this.offset);
    src.onended = () => {
      if (this.source !== src) return; // superseded by seek/stop
      this.offset = this.duration;
      this.playing = false;
      this.source = null;
      if (this.onEnded) this.onEnded();
    };
    this.source = src;
    this.startedAt = this.ctx.currentTime;
    this.playing = true;
  }

  stop() {
    if (this.source) {
      const src = this.source;
      this.source = null;
      try { src.stop(); } catch (e) { /* already stopped */ }
    }
    this.playing = false;
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.time;
    this.stop();
  }

  async seek(t) {
    const wasPlaying = this.playing;
    if (wasPlaying) this.stop();
    this.offset = Math.min(Math.max(t, 0), this.duration);
    if (wasPlaying) await this.play();
  }
}
