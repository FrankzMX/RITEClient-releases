"use strict";

// RITE Clips, the recorder: a hidden window of the client that films the game
// window and keeps only the last seconds, already compressed, so a key saves
// them as an .mp4 at once (src/main/clips.js). The video is encoded by the
// graphics card when it can (WebCodecs), never the game's own process.
//
// The buffer holds encoded chunks, not frames: from a keyframe at least
// `seconds` ago up to now. A keyframe every 2 s keeps that at most 2 s longer.

(() => {
  const api = window.riteClips;
  const KEY_EVERY = 2e6; // µs between keyframes
  const MAX_QUEUE = 4; // frames waiting for the encoder; past this a frame is dropped

  let run = null;

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
  function createRun(opts) {
    const state = {
      stopped: false,
      stream: null,
      video: { encoder: null, config: null, decoderConfig: null, chunks: [], width: 0, height: 0, lastKey: -Infinity, offset: null, dropped: 0 },
      audio: { encoder: null, mux: null, decoderConfig: null, chunks: [], offset: null, sampleRate: 0, channels: 0 },
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
      const start = v[0].ts;
      const a = state.audio.chunks;
      let drop = 0;
      while (drop < a.length && a[drop].ts < start) drop++;
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
          v.chunks.push({ type: chunk.type, ts: chunk.timestamp + v.offset, dur: chunk.duration || Math.round(1e6 / opts.fps), data: copy(chunk) });
          trim();
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
        try {
          const width = even(frame.displayWidth);
          const height = even(frame.displayHeight);
          if (width !== v.width || height !== v.height) await setupVideo(width, height);
          if (v.offset === null) v.offset = Math.round(now() - frame.timestamp);
          if (v.encoder.encodeQueueSize > MAX_QUEUE) {
            v.dropped++;
            continue;
          }
          const ts = Math.round(frame.timestamp + v.offset);
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
                a.chunks.push({ ts: chunk.timestamp + a.offset, dur: chunk.duration || 0, data: copy(chunk) });
              },
              error: () => {
                a.encoder = null;
              },
            });
            a.encoder.configure(found.config);
          }
          // Same clock as the video: each track's timestamps move by the offset of its first sample.
          if (a.offset === null) a.offset = Math.round(now() - data.timestamp);
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
      stop() {
        state.stopped = true;
        for (const track of state.stream?.getTracks() || []) track.stop();
        for (const enc of [state.video.encoder, state.audio.encoder]) {
          try {
            enc?.close();
          } catch {}
        }
        state.video.chunks = [];
        state.audio.chunks = [];
      },
      // The buffer as an .mp4 (H.264, and AAC or Opus when there is sound).
      save() {
        const v = state.video;
        const video = v.chunks.slice();
        if (!video.length || !v.decoderConfig) return null;
        const start = video[0].ts;
        const audio = state.audio.chunks.filter((c) => c.ts >= start);
        const a = state.audio;
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
          const t = Math.max(c.ts - start, prev + 1000);
          times.push(t);
          prev = t;
        }
        video.forEach((c, i) => {
          const dur = i + 1 < video.length ? times[i + 1] - times[i] : c.dur;
          muxer.addVideoChunkRaw(c.data, c.type, times[i], dur, i === 0 ? { decoderConfig: v.decoderConfig } : undefined);
        });
        if (withAudio) audio.forEach((c, i) => muxer.addAudioChunkRaw(c.data, "key", c.ts - start, c.dur, i === 0 ? { decoderConfig: a.decoderConfig } : undefined));
        muxer.finalize();
        const last = video[video.length - 1];
        return { buffer: target.buffer, seconds: Math.round((times[times.length - 1] + last.dur) / 1e6), width: v.width, height: v.height, audio: Boolean(withAudio) };
      },
    };
  }

  api.onStart(async ({ sourceId, ...opts }) => {
    run?.stop();
    run = createRun(opts);
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
    api.status({ state: "off" });
  });
  api.onSave((id) => {
    let result = null;
    try {
      result = run?.save() || null;
    } catch (e) {
      result = { error: String(e?.message || e) };
    }
    api.saved(id, result);
  });
  api.ready();
})();
