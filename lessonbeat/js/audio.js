// Every sound in Lessonbeat is made here from oscillators and filtered noise.
// Nothing is sampled or AI-generated audio, so a pattern always sounds exactly as it is written.
import { hz, voicing, bassLine, chord, STYLES, toNotes, SOLFA } from "./music.js";

let AC = null, NOISE = null, current = null;
export function ctx() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    NOISE = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (AC.state === "suspended") AC.resume();
  return AC;
}
export function stopAll() { if (current) { const c = current; current = null; c.stop(); } }
export const isPlaying = (id) => !!current && current.id === id;

function bus(recordTo) {
  const a = ctx(), master = a.createGain(), comp = a.createDynamicsCompressor();
  master.gain.value = 0.9; master.connect(comp); comp.connect(a.destination);
  if (recordTo) comp.connect(recordTo);
  const ch = (v) => { const g = a.createGain(); g.gain.value = v; g.connect(master); return g; };
  return { master, comp, ch, close() { try { master.gain.setTargetAtTime(0, a.currentTime, 0.02); setTimeout(() => { master.disconnect(); comp.disconnect(); }, 250); } catch (e) { /* already closed */ } } };
}

/* ---------- instruments ---------- */
function noise(t, dur, type, f, q, g, out) {
  const s = AC.createBufferSource(); s.buffer = NOISE;
  const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const e = AC.createGain(); e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(fl); fl.connect(e); e.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function clap(t, out, gain = 1) {
  const src = AC.createBufferSource(); src.buffer = NOISE;
  const bp = AC.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1250; bp.Q.value = 0.9;
  const hp = AC.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 600;
  const g = AC.createGain(); g.gain.setValueAtTime(0, t);
  [0, 0.011, 0.022].forEach((o) => { g.gain.setValueAtTime(0.9 * gain, t + o); g.gain.exponentialRampToValueAtTime(0.15 * gain, t + o + 0.009); });
  g.gain.setValueAtTime(0.7 * gain, t + 0.032); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(out); src.start(t); src.stop(t + 0.25);
}
function tick(t, out, f = 1000, gain = 0.3) {
  const o = AC.createOscillator(), g = AC.createGain(); o.type = "sine"; o.frequency.value = f;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.07);
}
function voice(t, dur, m, out) {
  const o = AC.createOscillator(), o2 = AC.createOscillator(), lfo = AC.createOscillator(), ld = AC.createGain(), lp = AC.createBiquadFilter(), g = AC.createGain(), g2 = AC.createGain();
  o.type = "triangle"; o.frequency.value = hz(m); o2.type = "sine"; o2.frequency.value = hz(m) * 2;
  lfo.frequency.value = 5.2; ld.gain.setValueAtTime(0, t); ld.gain.linearRampToValueAtTime(hz(m) * 0.006, t + Math.min(0.25, dur * 0.5)); lfo.connect(ld); ld.connect(o.frequency); ld.connect(o2.frequency);
  lp.type = "lowpass"; lp.frequency.value = 2200; g2.gain.value = 0.22;
  o2.connect(g2); g2.connect(lp); o.connect(lp); lp.connect(g); g.connect(out);
  const end = t + Math.max(0.09, dur * 0.94);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.34, t + 0.035); g.gain.setValueAtTime(0.3, Math.max(t + 0.04, end - 0.06)); g.gain.linearRampToValueAtTime(0, end);
  [o, o2, lfo].forEach((n) => { n.start(t); n.stop(end + 0.05); });
}
function kick(t, out) { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13); g.gain.setValueAtTime(0.95, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.34); }
function snare(t, out, g = 0.55) { noise(t, 0.17, "bandpass", 1900, 0.7, g, out); const o = AC.createOscillator(), e = AC.createGain(); o.frequency.value = 185; e.gain.setValueAtTime(0.25, t); e.gain.exponentialRampToValueAtTime(0.001, t + 0.08); o.connect(e); e.connect(out); o.start(t); o.stop(t + 0.1); }
function hat(t, out, g) { noise(t, 0.05, "highpass", 7200, 0.6, g, out); }
function stick(t, out, accent) { const o = AC.createOscillator(), g = AC.createGain(); o.type = "square"; o.frequency.value = accent ? 1800 : 1300; g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.06); }
function keys(t, notes, dur, g, out) {
  notes.forEach((m) => {
    const o = AC.createOscillator(), o2 = AC.createOscillator(), lp = AC.createBiquadFilter(), e = AC.createGain();
    o.type = "triangle"; o2.type = "sawtooth"; o.frequency.value = hz(m); o2.frequency.value = hz(m) * 1.003;
    lp.type = "lowpass"; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(700, t + dur);
    const sg = AC.createGain(); sg.gain.value = 0.35; o2.connect(sg); sg.connect(lp); o.connect(lp); lp.connect(e); e.connect(out);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + 0.008); e.gain.exponentialRampToValueAtTime(0.002, t + dur);
    o.start(t); o2.start(t); o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
  });
}
function pad(t, notes, dur, g, out) {
  notes.forEach((m) => { const o = AC.createOscillator(), e = AC.createGain(); o.type = "sine"; o.frequency.value = hz(m); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + 0.06); e.gain.setValueAtTime(g, Math.max(t + 0.07, t + dur - 0.1)); e.gain.linearRampToValueAtTime(0, t + dur); o.connect(e); e.connect(out); o.start(t); o.stop(t + dur + 0.02); });
}
function bass(t, m, dur, out) {
  const o = AC.createOscillator(), s = AC.createOscillator(), lp = AC.createBiquadFilter(), e = AC.createGain(), sg = AC.createGain();
  o.type = "sawtooth"; s.type = "sine"; o.frequency.value = hz(m); s.frequency.value = hz(m);
  lp.type = "lowpass"; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(380, t + dur); lp.Q.value = 3;
  sg.gain.value = 0.9; s.connect(sg); sg.connect(e); o.connect(lp); lp.connect(e);
  e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.42, t + 0.006); e.gain.exponentialRampToValueAtTime(0.18, t + dur * 0.6); e.gain.linearRampToValueAtTime(0, t + dur);
  e.connect(out); o.start(t); s.start(t); o.stop(t + dur + 0.02); s.stop(t + dur + 0.02);
}

/* ---------- finite pieces: clap-along and sing-along ---------- */
function runFinite(id, { spb, countIn, total, build, onFrame, onEnd, recordTo }) {
  stopAll();
  const a = ctx(), b = bus(recordTo), start = a.currentTime + 0.18;
  const click = b.ch(1);
  for (let i = 0; i < countIn; i++) stick(start + i * spb, click, i === 0);
  build(b, start + countIn * spb);
  let raf = 0, done = false;
  const session = { id, stop(finished) { if (done) return; done = true; cancelAnimationFrame(raf); clearInterval(timer); b.close(); if (current === session) current = null; onFrame && onFrame(null, null); onEnd && onEnd(!!finished); } };
  const step = () => {
    if (done) return;
    const beat = (a.currentTime - start) / spb - countIn;
    if (beat > total + 0.6) { session.stop(true); return; }
    onFrame && onFrame(beat >= 0 ? beat : null, beat < 0 ? Math.floor(beat + countIn) + 1 : null);
  };
  const loop = () => { step(); if (!done) raf = requestAnimationFrame(loop); };
  const timer = setInterval(() => { if (document.hidden) step(); }, 200); // keep time when the tab is in the background
  raf = requestAnimationFrame(loop);
  current = session;
  return session;
}

export function playClap(piece, o, hooks = {}) {
  const beats = piece.beats || 4, spb = 60 / o.tempo, reps = o.reps || 2, len = piece.bars.length * beats;
  const notes = toNotes(piece.bars, beats);
  return runFinite(o.id || "clap", {
    spb, countIn: o.countIn === false ? 0 : beats, total: len * reps, recordTo: o.recordTo,
    build(b, t0) {
      const main = b.ch(1), soft = b.ch(1);
      for (let r = 0; r < reps; r++) {
        if (o.clicks !== false) for (let i = 0; i < len; i++) tick(t0 + (r * len + i) * spb, soft, i % beats === 0 ? 900 : 700, 0.11);
        if (o.sound !== false) notes.forEach((n) => { if (!n.rest) clap(t0 + (r * len + n.pos) * spb, main); });
      }
    },
    onFrame: (beat, count) => hooks.onFrame && hooks.onFrame(beat == null ? null : beat % len, count, beat == null ? 0 : Math.floor(beat / len)),
    onEnd: hooks.onEnd,
  });
}

export function playSing(song, o, hooks = {}) {
  const beats = song.beats || 4, spb = 60 / o.tempo, len = song.bars.length * beats, reps = o.reps || 1;
  const notes = toNotes(song.bars, beats);
  return runFinite(o.id || "sing", {
    spb, countIn: beats, total: len * reps, recordTo: o.recordTo,
    build(b, t0) {
      const lead = b.ch(1), back = b.ch(0.9), soft = b.ch(1);
      for (let r = 0; r < reps; r++) {
        const off = r * len;
        if (o.voice !== false) notes.forEach((n) => { if (!n.rest) voice(t0 + (off + n.pos) * spb, n.d * spb, o.doMidi + (SOLFA[n.s] ?? 0), lead); });
        if (o.chords !== false && song.chords && song.chords.length === song.bars.length) song.chords.forEach((c, i) => {
          const v = voicing(c, o.key).map((m) => m - 12), t = t0 + (off + i * beats) * spb;
          let root = 36 + chord(c, o.key).root; if (root > 45) root -= 12;
          pad(t, v, beats * spb, 0.05, back); bass(t, root, beats * spb * 0.9, back);
        });
        for (let i = 0; i < len; i++) { if (o.clicks !== false) tick(t0 + (off + i) * spb, soft, i % beats === 0 ? 850 : 650, 0.07); if (o.claps) clap(t0 + (off + i) * spb, soft, 0.45); }
      }
    },
    onFrame: (beat, count) => hooks.onFrame && hooks.onFrame(beat == null ? null : beat % len, count),
    onEnd: hooks.onEnd,
  });
}

/* ---------- looping backing track ---------- */
export class Backing {
  constructor(track, state, hooks = {}) { this.track = track; this.s = state; this.hooks = hooks; this.id = state.id || "backing"; this.on = false; }
  start() {
    stopAll();
    const a = ctx(); this.bus = bus();
    this.mix = { drums: this.bus.ch(this.s.drums ? 0.9 : 0), chords: this.bus.ch(this.s.chords ? 0.85 : 0), bass: this.bus.ch(this.s.bass ? 1 : 0), click: this.bus.ch(0.8) };
    const beats = this.beats();
    this.b = this.s.countIn ? -beats : 0; this.next = a.currentTime + 0.14; this.q = []; this.on = true;
    this.pump(); this.timer = setInterval(() => this.pump(), 25);
    const loop = () => { if (!this.on) return; let cur = null; while (this.q.length && this.q[0].t <= AC.currentTime) cur = this.q.shift(); if (cur) this.emit(cur.b); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
    current = this;
  }
  beats() { return (STYLES[this.s.style] || STYLES.pop).beats; }
  emit(b) { const beats = this.beats(), n = this.track.bars.length; if (b < 0) this.hooks.onBeat && this.hooks.onBeat({ count: b + beats + 1 }); else this.hooks.onBeat && this.hooks.onBeat({ bar: Math.floor(b / beats) % n, beat: b % beats, round: Math.floor(b / (beats * n)) + 1 }); }
  pump() { const spb = 60 / this.s.tempo; while (this.next < AC.currentTime + 0.18) { this.schedule(this.b, this.next, spb); this.q.push({ t: this.next, b: this.b }); this.next += spb; this.b++; } }
  setMix() { if (!this.mix) return; const t = AC.currentTime; this.mix.drums.gain.setTargetAtTime(this.s.drums ? 0.9 : 0, t, 0.02); this.mix.chords.gain.setTargetAtTime(this.s.chords ? 0.85 : 0, t, 0.02); this.mix.bass.gain.setTargetAtTime(this.s.bass ? 1 : 0, t, 0.02); }
  schedule(b, t, spb) {
    const st = STYLES[this.s.style] || STYLES.pop, beats = st.beats, bars = this.track.bars, m = this.mix;
    if (b < 0) { stick(t, m.click, b === -beats); return; }
    const bar = Math.floor(b / beats) % bars.length, beat = b % beats, numeral = bars[bar], key = this.s.key;
    const at = (p) => { const whole = Math.floor(p), frac = p - whole; return t + (st.swing && Math.abs(frac - 0.5) < 0.01 ? 2 / 3 : frac) * spb; };
    const here = (list) => list.filter((p) => Math.floor(p) === beat);
    here(st.kick).forEach((p) => kick(at(p), m.drums));
    here(st.snare).forEach((p) => snare(at(p), m.drums));
    here(st.hat).forEach((p) => hat(at(p), m.drums, p % 1 === 0 ? 0.26 : 0.15));
    const v = voicing(numeral, key);
    if (beat === 0 && st.pad) pad(t, v, beats * spb, 0.024, m.chords);
    here(st.stab).forEach((p) => keys(at(p), v, spb * (st.pad ? 0.5 : 0.32), 0.05, m.chords));
    const line = bassLine(bars, bar, key, this.s.level, beats);
    bass(t, line[beat].midi, spb * 0.92, m.bass);
  }
  stop() { if (!this.on) return; this.on = false; clearInterval(this.timer); cancelAnimationFrame(this.raf); this.bus.close(); if (current === this) current = null; this.hooks.onBeat && this.hooks.onBeat(null); this.hooks.onStop && this.hooks.onStop(); }
}

/* ---------- video export ---------- */
export function canRecord() { return typeof MediaRecorder !== "undefined" && !!HTMLCanvasElement.prototype.captureStream; }
/** Records one play-through of a canvas plus its sound. start(recordTo) must begin playback and return a session. */
export function recordVideo(canvas, start) {
  return new Promise((resolve, reject) => {
    try {
      const a = ctx(), dest = a.createMediaStreamDestination();
      const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const type = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2500000 }), chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      let cancelled = false;
      rec.onstop = () => (cancelled ? reject(new Error("stopped")) : resolve({ blob: new Blob(chunks, { type: type.split(";")[0] }), ext: type.includes("mp4") ? "mp4" : "webm" }));
      rec.start(250);
      start(dest, (finished) => { cancelled = !finished; setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, finished ? 350 : 0); });
    } catch (e) { reject(e); }
  });
}
