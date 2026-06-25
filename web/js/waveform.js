// Client-side, zoom-adaptive waveform peaks for the timeline.
//
// Pure given (channels, sampleRate): builds a min/max/RMS bucket cache once,
// then serves per-pixel-column min/max/RMS for any time window — aggregating
// buckets when zoomed out, reading raw samples when deep-zoomed. Channels are
// averaged to mono on the fly (no separate full-resolution mono copy is kept).
export class WaveformPeaks {
  constructor(channels, sampleRate) {
    this.channels = channels || [];
    this.sampleRate = sampleRate;
    this.nChan = this.channels.length;
    this.length = this.nChan ? this.channels[0].length : 0;
    this.BUCKET = 512;
    const nb = Math.ceil(this.length / this.BUCKET);
    this.bMin = new Float32Array(nb);
    this.bMax = new Float32Array(nb);
    this.bRms = new Float32Array(nb);
    this._buildCache(nb);
  }

  // Per-sample average across channels.
  _avg(i) {
    let s = 0;
    for (let c = 0; c < this.nChan; c++) s += this.channels[c][i];
    return s / this.nChan;
  }

  _buildCache(nb) {
    const { BUCKET, length } = this;
    for (let b = 0; b < nb; b++) {
      const s0 = b * BUCKET, s1 = Math.min(s0 + BUCKET, length);
      let mn = Infinity, mx = -Infinity, sq = 0;
      for (let i = s0; i < s1; i++) {
        const v = this._avg(i);
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

  // Per-column { min, max, rms } over [t0, t1) seconds across `width` columns.
  columns(t0, t1, width) {
    const min = new Float32Array(width);
    const max = new Float32Array(width);
    const rms = new Float32Array(width);
    if (!this.length || width <= 0 || t1 <= t0) return { min, max, rms };
    const sr = this.sampleRate;
    const useRaw = ((t1 - t0) * sr / width) < this.BUCKET;
    for (let x = 0; x < width; x++) {
      let i0 = Math.floor((t0 + (t1 - t0) * (x / width)) * sr);
      let i1 = Math.floor((t0 + (t1 - t0) * ((x + 1) / width)) * sr);
      if (i1 <= i0) i1 = i0 + 1;
      if (i0 >= this.length) continue; // past end → leave zeros
      i0 = Math.max(i0, 0);
      i1 = Math.min(i1, this.length);
      let mn = Infinity, mx = -Infinity, sq = 0, cnt = 0;
      if (useRaw) {
        for (let i = i0; i < i1; i++) {
          const v = this._avg(i);
          if (v < mn) mn = v;
          if (v > mx) mx = v;
          sq += v * v;
          cnt++;
        }
      } else {
        // Combine buckets as sqrt(mean(bucketRms^2)). Exact when buckets are
        // equal-size; the track's final partial bucket is weighted equally, a
        // negligible cosmetic RMS bias on at most the last column. Intentional.
        const b0 = Math.floor(i0 / this.BUCKET);
        const b1 = Math.min(Math.floor((i1 - 1) / this.BUCKET), this.bMin.length - 1);
        for (let b = b0; b <= b1; b++) {
          if (this.bMin[b] < mn) mn = this.bMin[b];
          if (this.bMax[b] > mx) mx = this.bMax[b];
          sq += this.bRms[b] * this.bRms[b];
          cnt++;
        }
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
