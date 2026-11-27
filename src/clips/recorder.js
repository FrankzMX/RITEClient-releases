"use strict";

// RITE Clips, the recorder: a hidden window of the client that films the game
// window and keeps only the last seconds, already compressed, so a key saves
// them as an .mp4 at once (src/main/clips.js). The video is encoded by the
// graphics card when it can (WebCodecs), never the game's own process.
//
// The buffer holds encoded chunks, not frames: from a keyframe at least
// `seconds` ago up to now. A keyframe every 2 s keeps that at most 2 s longer.
//
// Sync: the video and the sound come with timestamps on different clocks. Each
// track keeps its own timestamps, and `offset` turns them into this page's
// clock: the smallest (arrival − timestamp) seen so far, taken the moment the
// sample arrives. The smallest is the one that waited least on the way, and
// nothing slow (setting up an encoder) can move it. Saving applies it.

(() => {
  const api = window.riteClips;
  const KEY_EVERY = 2e6; // µs between keyframes
  const MAX_QUEUE = 4; // frames waiting for the encoder; past this a frame is dropped
  const WARM_US = 3e6; // a new recording saves itself only from 3 s on; before, the paused one

  let run = null;
  // "Only during the match": out of a match the filming stops, but what it had
  // stays here so F8 on the results screen still saves the end of the match.
  let paused = null;

  const now = () => performance.now() * 1000;
  const even = (n) => Math.max(2, Math.floor(n / 2) * 2);
  const copy = (chunk) => {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    return data;
  };

  async function capture(sourceId, opts, withAudio) {
    const video = {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
        maxHeight: opts.height,
        maxWidth: Math.round((opts.height * 16) / 9),
        maxFrameRate: opts.fps,
      },
    };
    const audio = withAudio ? { mandatory: { chromeMediaSource: "desktop" } } : false;
    return navigator.mediaDevices.getUserMedia({ audio, video });
  }

  async function videoConfig(width, height, opts) {
    for (const hardwareAcceleration of ["prefer-hardware", "no-preference"]) {
      // H.264 level 4.2 tops out near 1080p; 1440p needs 5.1 or 5.2.
      for (const codec of ["avc1.64002A", "avc1.640033", "avc1.640034", "avc1.4D402A", "avc1.4D4033", "avc1.42E02A", "avc1.42E033"]) {
        const config = {
          codec,
          width,
          height,
          bitrate: opts.bitrate,
          framerate: opts.fps,
          hardwareAcceleration,
          latencyMode: "realtime",
          avc: { format: "avc" },
        };
        try {
          const { supported } = await VideoEncoder.isConfigSupported(config);
          if (supported) return config;
        } catch {}
      }
    }
    return null;
  }

  async function audioConfig(sampleRate, numberOfChannels) {
    for (const [codec, mux] of [
      ["mp4a.40.2", "aac"],
      ["opus", "opus"],
    ]) {
      const config = { codec, sampleRate, numberOfChannels, bitrate: 160000 };
      try {
        const { supported } = await AudioEncoder.isConfigSupported(config);
        if (supported) return { config, mux };
      } catch {}
    }
    return null;
  }

  // One recording: the capture, its encoders and the buffer.
  function createRun(opts, onWarm) {
    const state = {
      stopped: false,
      stream: null,
      video: { encoder: null, config: null, decoderConfig: null, chunks: [], width: 0, height: 0, lastKey: -Infinity, offset: Infinity, dropped: 0 },
      audio: { encoder: null, mux: null, decoderConfig: null, chunks: [], offset: Infinity, sampleRate: 0, channels: 0 },
    };
    const keepUs = opts.seconds * 1e6;

    function trim() {
      const v = state.video.chunks;
      if (!v.length) return;
      const cutoff = v[v.length - 1].ts - keepUs;
      let from = 0;
      for (let i = 0; i < v.length; i++) {
        if (v[i].ts > cutoff) break;
        if (v[i].type === "key") from = i;
      }
      if (from) v.splice(0, from);
      const start = v[0].ts + state.video.offset;
      const a = state.audio.chunks;
      let drop = 0;
      while (drop < a.length && a[drop].ts + state.audio.offset < start) drop++;
      if (drop) a.splice(0, drop);
    }

    async function setupVideo(width, height) {
      const v = state.video;
      try {
        v.encoder?.close();
      } catch {}
      v.chunks = [];
      state.audio.chunks = [];
      v.decoderConfig = null;
      v.lastKey = -Infinity;
      v.width = width;
      v.height = height;
      v.config = await videoConfig(width, height, opts);
      if (!v.config) throw new Error("Esta PC no puede codificar H.264.");
      v.encoder = new VideoEncoder({
        output: (chunk, meta) => {
          if (meta?.decoderConfig) v.decoderConfig = meta.decoderConfig;
          v.chunks.push({ type: chunk.type, ts: chunk.timestamp, dur: chunk.duration || Math.round(1e6 / opts.fps), data: copy(chunk) });
          trim();
          if (onWarm && v.chunks[v.chunks.length - 1].ts - v.chunks[0].ts >= WARM_US) {
            onWarm();
            onWarm = null;
          }
        },
        error: (e) => api.status({ state: "error", message: String(e?.message || e) }),
      });
      v.encoder.configure(v.config);
      api.status({ state: "recording", width, height, fps: opts.fps, hardware: v.config.hardwareAcceleration === "prefer-hardware", audio: Boolean(state.audio.encoder) });
    }

    async function pumpVideo(track) {
      const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
      const v = state.video;
      for (;;) {
        const { value: frame, done } = await reader.read();
        if (done || state.stopped) {
          frame?.close();
          break;
        }
        v.offset = Math.min(v.offset, now() - frame.timestamp);
        try {
          const width = even(frame.displayWidth);
          const height = even(frame.displayHeight);
          if (width !== v.width || height !== v.height) await setupVideo(width, height);
          if (v.encoder.encodeQueueSize > MAX_QUEUE) {
            v.dropped++;
            continue;
          }
          const ts = frame.timestamp;
          const keyFrame = ts - v.lastKey >= KEY_EVERY;
          if (keyFrame) v.lastKey = ts;
          v.encoder.encode(frame, { keyFrame });
        } catch (e) {
          // Said once: with no encoder every later frame would fail the same way.
          api.status({ state: "error", message: String(e?.message || e) });
          break;
        } finally {
          frame.close();
        }
      }
    }

    async function pumpAudio(track) {
      const a = state.audio;
      const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
      for (;;) {
        const { value: data, done } = await reader.read();
        if (done || state.stopped) {
          data?.close();
          break;
        }
        a.offset = Math.min(a.offset, now() - data.timestamp);
        try {
          if (!a.encoder) {
            const found = await audioConfig(data.sampleRate, data.numberOfChannels);
            if (!found) break;
            a.mux = found.mux;
            a.sampleRate = data.sampleRate;
            a.channels = data.numberOfChannels;
            a.encoder = new AudioEncoder({
              output: (chunk, meta) => {
                if (meta?.decoderConfig) a.decoderConfig = meta.decoderConfig;
                a.chunks.push({ ts: chunk.timestamp, dur: chunk.duration || 0, data: copy(chunk) });
              },
              error: () => {
                a.encoder = null;
              },
            });
            a.encoder.configure(found.config);
          }
          a.encoder?.encode(data);
        } catch {
        } finally {
          data.close();
        }
      }
    }

    return {
      async start(sourceId) {
        let stream;
        try {
          stream = await capture(sourceId, opts, opts.audio);
        } catch {
          stream = await capture(sourceId, opts, false);
        }
        state.stream = stream;
        const [videoTrack] = stream.getVideoTracks();
        const [audioTrack] = stream.getAudioTracks();
        if (!videoTrack) throw new Error("No se pudo capturar la ventana del juego.");
        videoTrack.contentHint = "motion";
        if (audioTrack) pumpAudio(audioTrack);
        pumpVideo(videoTrack);
      },
      // Stops filming; with `keep` what was recorded stays, to save later.
      stop(keep = false) {
        state.stopped = true;
        for (const track of state.stream?.getTracks() || []) track.stop();
        for (const enc of [state.video.encoder, state.audio.encoder]) {
          try {
            enc?.close();
          } catch {}
        }
        if (keep) return;
        state.video.chunks = [];
        state.audio.chunks = [];
      },
      // Microseconds of video in the buffer.
      length() {
        const v = state.video.chunks;
        return v.length ? v[v.length - 1].ts - v[0].ts : 0;
      },
      // The buffer as an .mp4 (H.264, and AAC or Opus when there is sound).
      save() {
        const v = state.video;
        const video = v.chunks.slice();
        if (!video.length || !v.decoderConfig) return null;
        // Both tracks on this page's clock (see «Sync» above).
        const start = video[0].ts + v.offset;
        const a = state.audio;
        const audio = a.chunks.filter((c) => c.ts + a.offset >= start);
        const withAudio = audio.length > 0 && a.decoderConfig;
        const target = new Mp4Muxer.ArrayBufferTarget();
        const muxer = new Mp4Muxer.Muxer({
          target,
          fastStart: "in-memory",
          firstTimestampBehavior: "cross-track-offset",
          video: { codec: "avc", width: v.width, height: v.height, frameRate: opts.fps },
          audio: withAudio ? { codec: a.mux, numberOfChannels: a.channels, sampleRate: a.sampleRate } : undefined,
        });
        // Two frames can land on the same microsecond (or millisecond, in the
        // file): each one goes at least 1 ms after the one before, and lasts
        // until the next.
        const times = [];
        let prev = -Infinity;
        for (const c of video) {
          const t = Math.max(Math.round(c.ts + v.offset - start), prev + 1000);
          times.push(t);
          prev = t;
        }
        video.forEach((c, i) => {
          const dur = i + 1 < video.length ? times[i + 1] - times[i] : c.dur;
          muxer.addVideoChunkRaw(c.data, c.type, times[i], dur, i === 0 ? { decoderConfig: v.decoderConfig } : undefined);
        });
        if (withAudio) audio.forEach((c, i) => muxer.addAudioChunkRaw(c.data, "key", Math.round(c.ts + a.offset - start), c.dur, i === 0 ? { decoderConfig: a.decoderConfig } : undefined));
        muxer.finalize();
        const last = video[video.length - 1];
        return { buffer: target.buffer, seconds: Math.round((times[times.length - 1] + last.dur) / 1e6), width: v.width, height: v.height, audio: Boolean(withAudio) };
      },
    };
  }

  // Keeps the current recording (if it has anything) as the paused one.
  function shelve() {
    if (!run) return;
    if (run.length() > 0) {
      run.stop(true);
      paused = run;
    } else run.stop();
    run = null;
  }

  api.onStart(async ({ sourceId, ...opts }) => {
    shelve();
    const mine = createRun(opts, () => {
      // The new one is long enough: the old match is no longer needed.
      if (run === mine) paused = null;
    });
    run = mine;
    try {
      await run.start(sourceId);
    } catch (e) {
      run = null;
      api.status({ state: "error", message: String(e?.message || e) });
    }
  });
  api.onStop(() => {
    run?.stop();
    run = null;
    paused = null;
    api.status({ state: "off" });
  });
  api.onPause(() => {
    shelve();
    api.status({ state: "paused", saved: Boolean(paused) });
  });
  api.onSave((id) => {
    let result = null;
    try {
      // The current recording once it has a few seconds; before that, the last match.
      const pick = run && (run.length() >= WARM_US || !paused) ? run : paused;
      result = pick?.save() || (pick !== paused && paused?.save()) || null;
    } catch (e) {
      result = { error: String(e?.message || e) };
    }
    api.saved(id, result);
  });
  api.ready();
})();
