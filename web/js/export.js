// Browser-side deterministic export.
//
// The same renderer that drives the preview renders every frame at full
// resolution into an offscreen target; raw RGBA pixels stream over a
// WebSocket to the backend, which pipes them into ffmpeg and muxes the
// untouched audio (AAC 320k encode only). This is what makes preview and
// output pixel-identical.

const CHUNK_BYTES = 4 * 1024 * 1024;   // stay under uvicorn's ws frame limit
const MAX_IN_FLIGHT = 48 * 1024 * 1024; // unacked bytes allowed in transit
const ACK_STALL_MS = 60 * 1000;        // no ack progress for this long = dead

// Backpressure is paced by server ACKs (bytes actually fed to ffmpeg), NOT
// by ws.bufferedAmount — Firefox's counter is unreliable under sustained
// multi-GB sends (it reported empty buffers while gigabytes were queued,
// silently killing long exports). Acks are end-to-end truth on any browser.

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export async function runExport(opts) {
  const {
    renderer, bank, reframe, projectId,
    width, height, fps, quality,
    motionBlur = false,
    onProgress = () => {},
    onStatus = () => {},
    shouldAbort = () => false,
  } = opts;
  // Params are resolved per frame so drawn automation renders in the export
  // exactly as in the preview. Accepts a static object for convenience.
  const getParams = typeof opts.getParams === 'function'
    ? opts.getParams
    : () => opts.params;

  // Optional range (the loop region): render t from rangeStart and trim the
  // audio server-side. Rendering is pure in t, so range frames are pixel-
  // identical to the same moments in a whole-song export.
  const rangeStart = Math.max(opts.start || 0, 0);
  const rangeDur = opts.duration || Math.max(bank.duration - rangeStart, 0);
  const totalFrames = Math.ceil(rangeDur * fps);
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/api/export`);
  ws.binaryType = 'arraybuffer';

  let done, fail;
  const result = new Promise((res, rej) => { done = res; fail = rej; });
  let started = false;
  let sentBytes = 0;
  let ackedBytes = 0;
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'started') started = true;
    else if (msg.type === 'ack') ackedBytes = msg.bytes;
    else if (msg.type === 'done') done(msg);
    else if (msg.type === 'error') fail(new Error(msg.message));
  };
  ws.onerror = () => fail(new Error('Export connection failed.'));
  ws.onclose = () => fail(new Error('Export connection closed early.'));

  await new Promise((res, rej) => {
    ws.onopen = res;
    const prevErr = ws.onerror;
    ws.onerror = () => { rej(new Error('Could not open export connection.')); ws.onerror = prevErr; };
  });
  ws.send(JSON.stringify({
    projectId, width, height, fps, quality,
    start: rangeStart, duration: rangeDur,
  }));

  // Wait until at most `maxInFlight` sent bytes remain unacknowledged.
  // Progress-based watchdog: if the server stops acking for ACK_STALL_MS
  // while acks are owed, fail fast with a clear error instead of hanging.
  async function drainTo(maxInFlight) {
    let lastAcked = ackedBytes;
    let progressAt = performance.now();
    while (sentBytes - ackedBytes > maxInFlight) {
      if (shouldAbort()) {
        ws.send(JSON.stringify({ abort: true }));
        throw new Error('Export cancelled.');
      }
      if (ackedBytes > lastAcked) {
        lastAcked = ackedBytes;
        progressAt = performance.now();
      } else if (performance.now() - progressAt > ACK_STALL_MS) {
        throw new Error(
          'Export stalled: the encoder stopped consuming frames for 60 s '
          + `(${((sentBytes - ackedBytes) / 1048576).toFixed(0)} MB in flight). `
          + 'Check the server terminal, restart the server, and try again.');
      }
      await sleep(25);
    }
  }

  const prevW = renderer.width;
  const prevH = renderer.height;
  renderer.setSize(width, height);
  renderer.resetFeedback();

  // The live export-preview blit is pure overhead on the hot path, so throttle
  // it: the preview canvas refreshes every BLIT_EVERY frames (it simply freezes
  // between blits — the MP4 comes from the readback, never the canvas).
  const BLIT_EVERY = 5;

  const subFrames = motionBlur && fps < 60 ? 3 : 1;
  const acc = subFrames > 1 ? new Float32Array(width * height * 4) : null;
  const frameOut = subFrames > 1 ? new Uint8Array(width * height * 4) : null;
  // Async PBO readback pipeline for the common (no-motion-blur) path: it
  // overlaps a frame's GPU→CPU readback and WebSocket transfer with the next
  // frame's render instead of stalling on a synchronous gl.readPixels each
  // frame. Motion blur keeps the sync read (it averages sub-frames on the CPU).
  const readback = subFrames === 1 ? renderer.createReadback(3) : null;

  let sent = 0;
  async function sendFrame(pixels) {
    for (let off = 0; off < pixels.length; off += CHUNK_BYTES) {
      ws.send(pixels.subarray(off, Math.min(off + CHUNK_BYTES, pixels.length)));
    }
    sentBytes += pixels.length;
    await drainTo(MAX_IN_FLIGHT);
    sent++;
    onProgress(sent / totalFrames, sent, totalFrames);
    if (sent % 3 === 0) await nextFrame(); // keep the UI alive
  }

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (shouldAbort()) {
        ws.send(JSON.stringify({ abort: true }));
        throw new Error('Export cancelled.');
      }
      const t = rangeStart + i / fps;
      if (subFrames === 1) {
        renderer.render(t, 1 / fps, bank.sample(t), getParams(t), reframe,
          { toTexture: true, blit: i % BLIT_EVERY === 0 });
        readback.enqueue(renderer.targets.post);
        // Once the pipeline is primed, drain its oldest (now-ready) frame.
        if (readback.full) await sendFrame(readback.dequeue());
      } else {
        // synthetic motion blur: average sub-frames across a ~180° shutter
        acc.fill(0);
        const subDt = 0.5 / fps / subFrames;
        for (let s = 0; s < subFrames; s++) {
          const ts = t + s * subDt;
          renderer.render(ts, subDt, bank.sample(ts), getParams(ts), reframe,
            { toTexture: true, blit: s === subFrames - 1 && i % BLIT_EVERY === 0 });
          const px = renderer.readPixels();
          for (let k = 0; k < px.length; k++) acc[k] += px[k];
        }
        for (let k = 0; k < acc.length; k++) frameOut[k] = acc[k] / subFrames;
        await sendFrame(frameOut);
      }
    }

    // flush frames still in flight in the async readback pipeline
    if (readback) {
      while (readback.pending) await sendFrame(readback.dequeue());
    }

    // wait until the encoder has consumed everything, then signal the end —
    // rendering is done but the encoder may still be chewing.
    onStatus('rendered — flushing frames to the encoder…');
    await drainTo(0);
    ws.send(JSON.stringify({ end: true }));
    onStatus('finalizing encode (ffmpeg)…');
    const summary = await result;
    return summary;
  } finally {
    if (readback) readback.dispose();
    setTimeout(() => { try { ws.close(); } catch (e) { /* already closed */ } }, 250);
    renderer.setSize(prevW || width, prevH || height);
    renderer.resetFeedback();
  }
}

// Index 0 is the default and the resolution used by batch export. 480p is the
// fast-test tier; lower resolution is the real export-speed lever (it cuts both
// render and readback cost), not the encoder CRF.
export const RESOLUTIONS = {
  '16:9': [
    { label: '1920 × 1080 (1080p, YouTube)', w: 1920, h: 1080 },
    { label: '2560 × 1440 (1440p, master)', w: 2560, h: 1440 },
    { label: '1280 × 720 (720p, draft)', w: 1280, h: 720 },
    { label: '854 × 480 (480p, fast test)', w: 854, h: 480 },
  ],
  '9:16': [
    { label: '1080 × 1920 (1080p, Shorts / Reels / TikTok)', w: 1080, h: 1920 },
    { label: '1440 × 2560 (1440p, master)', w: 1440, h: 2560 },
    { label: '720 × 1280 (720p, draft)', w: 720, h: 1280 },
    { label: '480 × 854 (480p, fast test)', w: 480, h: 854 },
  ],
  '1:1': [
    { label: '1080 × 1080 (1080p, square)', w: 1080, h: 1080 },
    { label: '1440 × 1440 (1440p, master)', w: 1440, h: 1440 },
    { label: '720 × 720 (720p, draft)', w: 720, h: 720 },
    { label: '480 × 480 (480p, fast test)', w: 480, h: 480 },
  ],
};
