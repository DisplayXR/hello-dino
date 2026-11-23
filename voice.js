// Talk to Dino: OpenAI Realtime over WebRTC, voice in and voice out.
//
// The page never sees the API key: /api/session (api/session.js) mints a short-lived client secret
// with Dino's persona, voice and tools fixed server-side. The browser opens one WebRTC call with it,
// streams the microphone, plays Dino's voice, and listens on the "oai-events" data channel for the
// model's `animate` tool calls (wave / jump / greet), which drive the rig through `onAnimate`.
// `level()` is Dino's live voice loudness (0..1), for the talking head-bob.

export function createVoice({ onAnimate, onState }) {
  let pc = null, dc = null, mic = null, audioEl = null, analyser = null, buf = null;
  const state = (s, detail) => onState && onState(s, detail);

  async function start() {
    if (pc) return;
    state('connecting');
    try {
      const s = await fetch('/api/session', { method: 'POST' });
      const sj = await s.json().catch(() => ({}));
      if (!s.ok || !sj.value) throw new Error(sj.error || `session ${s.status}`);

      pc = new RTCPeerConnection();
      audioEl = new Audio();
      audioEl.autoplay = true;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
        // Loudness of Dino's voice for the head-bob.
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(e.streams[0]);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        buf = new Uint8Array(analyser.fftSize);
        src.connect(analyser);
      };
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      mic.getTracks().forEach((t) => pc.addTrack(t, mic));

      dc = pc.createDataChannel('oai-events');
      dc.onmessage = (m) => handleEvent(JSON.parse(m.data));
      dc.onopen = () => {
        state('listening');
        // Dino speaks first: hi + the child's name.
        dc.send(JSON.stringify({ type: 'response.create' }));
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const r = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(sj.model)}`, {
        method: 'POST',
        body: offer.sdp,
        headers: { Authorization: `Bearer ${sj.value}`, 'Content-Type': 'application/sdp' },
      });
      if (!r.ok) throw new Error(`call ${r.status}`);
      await pc.setRemoteDescription({ type: 'answer', sdp: await r.text() });
    } catch (err) {
      console.warn('dino voice: could not start', err);
      stop();
      state('error', String(err.message || err));
    }
  }

  function handleEvent(ev) {
    switch (ev.type) {
      case 'input_audio_buffer.speech_started': state('hearing'); break;
      case 'response.created': state('thinking'); break;
      case 'output_audio_buffer.started': state('speaking'); break;
      case 'output_audio_buffer.stopped': state('listening'); break;
      case 'response.function_call_arguments.done': {
        if (ev.name === 'animate') {
          let clip = null;
          try { clip = JSON.parse(ev.arguments || '{}').clip; } catch {}
          if (clip && onAnimate) onAnimate(clip);
          // Acknowledge the tool call so the model carries on talking.
          dc.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: ev.call_id, output: '{"ok":true}' } }));
          dc.send(JSON.stringify({ type: 'response.create' }));
        }
        break;
      }
      case 'error': console.warn('dino voice: server error', ev.error); break;
      default: break;
    }
  }

  function stop() {
    try { dc && dc.close(); } catch {}
    try { pc && pc.close(); } catch {}
    try { mic && mic.getTracks().forEach((t) => t.stop()); } catch {}
    if (audioEl) audioEl.srcObject = null;
    pc = dc = mic = analyser = null;
    state('idle');
  }

  function level() {
    if (!analyser) return 0;
    analyser.getByteTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; }
    return Math.min(1, Math.sqrt(s / buf.length) * 4);
  }

  return { start, stop, level, get active() { return !!pc; } };
}
