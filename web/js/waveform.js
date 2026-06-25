// Client-side waveform peaks for the timeline.
//
// Pure given (channels, sampleRate): builds a FIXED-resolution min/max/RMS
// bucket cache once, then serves per-pixel-column min/max/RMS for any time
// window by aggregating buckets. Because the bucket resolution is fixed, the
// per-column amplitude is stable across zoom — zooming changes horizontal
// detail, not vertical scale. A single song-wide normalization reference
// (`normRef`, a high percentile of the per-bucket peak) is computed once so the
// renderer can scale to a fixed height independent of zoom. Channels are
// averaged to mono during the cache build; the channel arrays are not retained
// afterwards (so a playing AudioBufferSourceNode can never affect the display).
export class WaveformPeaks {
  constructor(channels, sampleRate) {
    channels = channels || [];
    this.sampleRate = sampleRate;
    const nChan = channels.length;
    this.length = nChan ? channels[0].length : 0;
    this.BUCKET = 256;
    const nb = Math.ceil(this.length / this.BUCKET);
    this.bMin = new Float32Array(nb);
    this.bMax = new Float32Array(nb);
    this.bRms = new Float32Array(nb);
    this._buildCache(channels, nChan, nb);
    this.normRef = this._globalRef();
  }

  _buildCache(channels, nChan, nb) {
    const { BUCKET, length } = this;
    const avg = (i) => { let s = 0; for (let c = 0; c < nChan; c++) s += channels[c][i]; return s / nChan; };
    for (let b = 0; b < nb; b++) {
      const s0 = b * BUCKET, s1 = Math.min(s0 + BUCKET, length);
      let mn = Infinity, mx = -Infinity, sq = 0;
      for (let i = s0; i < s1; i++) {
        const v = avg(i);
        if (v < mn) mn = v;
        if (v > mx) mx = v;
        sq += v * v;
      }
      const cnt = Math.max(s1 - s0, 1);
      this.bMin[b] = mn === Infinity ? 0 : mn;
      this.bMax[b] = mx === -Infinity ? 0 : mx;
      this.bRms[b] = Math.sqrt(sq / cnt);
    }
  }

  // One fixed normalization reference for the whole song: a high percentile of
  // the per-bucket peak. A percentile (not the absolute max) keeps the body
  // filling the band when a few rare samples clip; the loudest buckets clip at
  // the band edge. Computed once → the waveform height is zoom-invariant.
  _globalRef() {
    const nb = this.bMax.length;
    if (!nb) return 0;
    const peaks = new Float32Array(nb);
    for (let b = 0; b < nb; b++) peaks[b] = Math.max(this.bMax[b], -this.bMin[b]);
    peaks.sort();
    return peaks[Math.min(nb - 1, Math.round((nb - 1) * 0.97))] || 0;
  }

  // Per-column { min, max, rms } over [t0, t1) seconds across `width` columns,
  // aggregated from the fixed-resolution bucket cache (no live sample reads).
  // Zoomed in, several columns share a bucket (blocky but amplitude-stable);
  // zoomed out, a column spans many buckets.
  columns(t0, t1, width) {
    const min = new Float32Array(width);
    const max = new Float32Array(width);
    const rms = new Float32Array(width);
    if (!this.length || width <= 0 || t1 <= t0) return { min, max, rms };
    const sr = this.sampleRate, nb = this.bMax.length;
    for (let x = 0; x < width; x++) {
      let i0 = Math.floor((t0 + (t1 - t0) * (x / width)) * sr);
      let i1 = Math.floor((t0 + (t1 - t0) * ((x + 1) / width)) * sr);
      if (i1 <= i0) i1 = i0 + 1;
      if (i0 >= this.length) continue; // past end → leave zeros
      i0 = Math.max(i0, 0);
      i1 = Math.min(i1, this.length);
      const b0 = Math.floor(i0 / this.BUCKET);
      const b1 = Math.min(Math.floor((i1 - 1) / this.BUCKET), nb - 1);
      let mn = Infinity, mx = -Infinity, sq = 0, cnt = 0;
      for (let b = b0; b <= b1; b++) {
        if (this.bMin[b] < mn) mn = this.bMin[b];
        if (this.bMax[b] > mx) mx = this.bMax[b];
        sq += this.bRms[b] * this.bRms[b];
        cnt++;
      }
      if (cnt > 0) {
        min[x] = mn === Infinity ? 0 : mn;
        max[x] = mx === -Infinity ? 0 : mx;
        rms[x] = Math.sqrt(sq / cnt);
      }
    }
    return { min, max, rms };
  }
}
