// Music rules shared by the notation, the players and the worksheets.
// The same checks run on the server before any AI-written music reaches the app.

export const YEARS = ["Foundation", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12"];
export const levelOf = (year) => { const i = YEARS.indexOf(year); return i <= 2 ? 1 : i <= 4 ? 2 : i <= 6 ? 3 : 4; };
export const bandOf = (year) => { const i = YEARS.indexOf(year); return i <= 0 ? "Foundation" : i <= 2 ? "Years 1-2" : i <= 4 ? "Years 3-4" : i <= 6 ? "Years 5-6" : i <= 8 ? "Years 7-8" : i <= 10 ? "Years 9-10" : "Senior"; };

const SOLFA_VAL = { "s,": -5, "l,": -3, "t,": -1, d: 0, r: 2, m: 4, f: 5, s: 7, l: 9, t: 11, "d'": 12, "r'": 14, "m'": 16 };
const DUR = { 1: [1, 0.5], 2: [1, 0.5, 2, 4, 0.25], 3: [1, 0.5, 2, 4, 0.25, 1.5, 3], 4: [1, 0.5, 2, 4, 0.25, 1.5, 3, 0.75] };
const REST = { 1: [1], 2: [1, 2, 4], 3: [1, 2, 4, 0.5], 4: [1, 2, 4, 0.5] };
const on = (pos, g) => Math.abs(pos / g - Math.round(pos / g)) < 1e-6;

/** Returns null when the bar is correct, or a plain-English reason when it is not. */
export function barProblem(durs, beats, level) {
  if (!Array.isArray(durs) || !durs.length) return "the bar is empty";
  let pos = 0;
  for (const raw of durs) {
    const d = Math.abs(raw), rest = raw < 0;
    if (!(rest ? REST[level] : DUR[level]).includes(d)) return `a ${rest ? "rest" : "note"} of ${d} beats isn't taught at this level`;
    if (d === 0.25 && !on(pos, 0.25)) return "a semiquaver is off the beat grid";
    if (d === 0.5 && !on(pos, 0.5)) return "a quaver is off the beat grid";
    if ((d === 0.75 || d === 1.5 || d === 3) && !on(pos, 1)) return "a dotted note must start on a beat";
    if ((d === 1 || d === 2 || d === 4) && !on(pos, level < 4 ? 1 : 0.5)) return "a long note must start on a beat";
    pos += d;
  }
  if (Math.abs(pos - beats) > 1e-6) return `it adds up to ${+pos.toFixed(2)} beats, not ${beats}`;
  return null;
}
export function pieceProblems(bars, beats, level) {
  const out = [];
  bars.forEach((b, i) => { const p = barProblem(b, beats, level); if (p) out.push(`Bar ${i + 1}: ${p}`); });
  return out;
}

/** Clap bars are arrays of numbers (negative = rest). Sing bars are arrays of {s, d, w}. Both become one note list. */
export function toNotes(bars, beats) {
  const notes = [];
  bars.forEach((bar, bi) => {
    let p = 0;
    bar.forEach((n) => {
      const obj = typeof n === "number" ? { d: Math.abs(n), rest: n < 0 } : { d: Math.abs(n.d), rest: n.s === "z", s: n.s, sv: SOLFA_VAL[n.s] ?? 0, w: n.w || "" };
      notes.push({ ...obj, bar: bi, inBar: p, pos: bi * beats + p });
      p += obj.d;
    });
  });
  nameRhythm(notes);
  return notes;
}
/** Kodaly-style time names, worked out from the durations. */
function nameRhythm(notes) {
  notes.forEach((n, i) => {
    if (n.rest) { n.name = "rest"; return; }
    const frac = n.inBar - Math.floor(n.inBar + 1e-6);
    const prev = notes[i - 1], sameBeat = prev && prev.bar === n.bar && Math.floor(prev.inBar + 1e-6) === Math.floor(n.inBar + 1e-6);
    if (n.d === 4) n.name = "ta-a-a-a";
    else if (n.d === 3) n.name = "ta-a-a";
    else if (n.d === 2) n.name = "ta-a";
    else if (n.d === 1.5) n.name = "tam";
    else if (n.d === 1) n.name = frac > 0.1 ? "ta" : "ta";
    else if (n.d === 0.75) n.name = "tim";
    else if (n.d === 0.5) n.name = "ti";
    else if (n.d === 0.25) n.name = sameBeat && prev.d === 0.75 ? "ka" : (Math.round(frac * 4) % 2 === 1 ? "ka" : "ti");
    else n.name = "";
  });
}

/* ---------- pitch ---------- */
export const SOLFA = SOLFA_VAL;
export const KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const PC = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, "F#": 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"], FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db"]);
export const keyPc = (k) => PC[k] ?? 0;
export const pretty = (name) => name.replace(/b/g, "♭").replace(/#/g, "♯");
export const noteName = (pc, key, forceFlat) => ((forceFlat || FLAT_KEYS.has(key)) ? FLAT : SHARP)[((pc % 12) + 12) % 12];
export const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Singable range (MIDI) for each level: young voices sit higher and narrower. */
const RANGE = { 1: [60, 72], 2: [60, 74], 3: [59, 76], 4: [57, 74] };
export function songSpan(bars) {
  let lo = 99, hi = -99;
  bars.forEach((b) => b.forEach((n) => { if (n.s !== "z" && SOLFA[n.s] != null) { lo = Math.min(lo, SOLFA[n.s]); hi = Math.max(hi, SOLFA[n.s]); } }));
  return lo > hi ? [0, 0] : [lo, hi];
}
/** Pick the key that puts the tune in the middle of the class's comfortable range. Returns { key, doMidi }. */
export function bestKey(bars, level) {
  const [lo, hi] = songSpan(bars), [rLo, rHi] = RANGE[level] || RANGE[2], mid = (rLo + rHi) / 2;
  let best = null;
  for (let doMidi = 53; doMidi <= 70; doMidi++) {
    const a = doMidi + lo, b = doMidi + hi;
    const out = Math.max(0, rLo - a) + Math.max(0, b - rHi);
    const key = KEYS[doMidi % 12];
    const easy = ["C", "D", "F", "G", "A"].includes(key) ? 0 : ["Eb", "E", "Bb"].includes(key) ? 0.6 : 1.5;
    const score = out * 10 + Math.abs((a + b) / 2 - mid) + easy;
    if (!best || score < best.score) best = { key, doMidi, score };
  }
  return { key: best.key, doMidi: best.doMidi };
}
export function doMidiFor(key, bars, level) {
  const [lo, hi] = songSpan(bars), [rLo, rHi] = RANGE[level] || RANGE[2];
  let best = null;
  for (const base of [48, 60]) { const doMidi = base + keyPc(key); const out = Math.max(0, rLo - (doMidi + lo)) + Math.max(0, doMidi + hi - rHi); if (!best || out < best.out) best = { doMidi, out }; }
  return best.doMidi;
}
export const midiName = (m, key) => pretty(noteName(m % 12, key)) + (Math.floor(m / 12) - 1);

/* ---------- chords ---------- */
const DEG = { i: 0, ii: 2, iii: 4, iv: 5, v: 7, vi: 9, vii: 11 };
export const NUMERAL = /^b?(I|II|III|IV|V|VI|VII|i|ii|iii|iv|v|vi|vii)7?$/;
export function parseNumeral(n) {
  const m = /^(b?)([IViv]+)(7?)$/.exec(n) || [null, "", "I", ""];
  const semis = (DEG[m[2].toLowerCase()] ?? 0) - (m[1] ? 1 : 0);
  return { semis: (semis + 12) % 12, minor: m[2] === m[2].toLowerCase(), seventh: !!m[3], flat: !!m[1] };
}
export function chord(numeral, key) {
  const c = parseNumeral(numeral), root = (keyPc(key) + c.semis) % 12;
  const third = c.minor ? 3 : 4;
  const name = pretty(noteName(root, key, c.flat)) + (c.minor ? "m" : "") + (c.seventh ? "7" : "");
  return { root, third, seventh: c.seventh, minor: c.minor, name, flat: c.flat };
}
/** Close-position voicing in the middle of the keyboard. */
export function voicing(numeral, key) {
  const c = chord(numeral, key), r = 48 + c.root;
  const tones = [r, r + c.third, r + 7]; if (c.seventh) tones.push(r + 10);
  return tones.map((m) => { while (m < 55) m += 12; while (m > 69) m -= 12; return m; }).sort((a, b) => a - b);
}
export const BASS_LEVELS = [
  { id: 1, name: "Roots", desc: "The root of each chord on every beat" },
  { id: 2, name: "Root and fifth", desc: "Root, root, fifth, fifth" },
  { id: 3, name: "Chord tones", desc: "Root, third, fifth, third" },
  { id: 4, name: "Walking", desc: "Root, third, fifth, then step into the next chord" },
];
/** Returns the bass notes for one bar as [{ midi, name }]. */
export function bassLine(bars, i, key, level, beats = 4) {
  const c = chord(bars[i], key), next = chord(bars[(i + 1) % bars.length], key);
  let iv;
  if (level === 1) iv = [0, 0, 0, 0];
  else if (level === 2) iv = [0, 0, 7, 7];
  else if (level === 3) iv = [0, c.third, 7, c.third];
  else {
    let gap = ((next.root - c.root) % 12 + 12) % 12; if (gap > 6) gap -= 12; // nearest direction to the next root
    const approach = gap === 0 ? c.third : gap > 0 ? gap - 1 : gap + 1;
    iv = [0, c.third, 7, approach === 7 ? 5 : approach];
  }
  if (beats === 3) iv = level === 4 ? [iv[0], iv[2], iv[3]] : [iv[0], iv[2], iv[2]];
  if (beats === 2) iv = [iv[0], iv[2]];
  let base = 36 + c.root; if (base > 45) base -= 12; // keep the bass between E1 and A2
  return iv.map((x) => { const midi = base + x; return { midi, name: pretty(noteName(((midi % 12) + 12) % 12, key, c.flat && x === 0)) }; });
}

export const STYLES = {
  pop: { name: "Pop", beats: 4, swing: false, kick: [0, 2, 2.5], snare: [1, 3], hat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], stab: [0, 1.5, 3], pad: true },
  rock: { name: "Rock", beats: 4, swing: false, kick: [0, 1.5, 2], snare: [1, 3], hat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], stab: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], pad: false },
  shuffle: { name: "Blues shuffle", beats: 4, swing: true, kick: [0, 2], snare: [1, 3], hat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], stab: [1, 1.5, 3, 3.5], pad: true },
  ballad: { name: "Ballad", beats: 4, swing: false, kick: [0, 2.5], snare: [2], hat: [0, 1, 2, 3], stab: [0, 2], pad: true },
  reggae: { name: "Reggae", beats: 4, swing: false, kick: [2], snare: [2], hat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], stab: [1, 3], pad: false },
  funk: { name: "Funk", beats: 4, swing: false, kick: [0, 1.5, 2.25], snare: [1, 3], hat: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75], stab: [0, 0.75, 2.5], pad: false },
  waltz: { name: "Waltz", beats: 3, swing: false, kick: [0], snare: [], hat: [1, 2], stab: [1, 2], pad: true },
};

/** Beat cells a teacher can cycle through when editing a rhythm by hand. */
export function beatCells(level) {
  const cells = [[1], [0.5, 0.5], [-1]];
  if (level >= 2) cells.splice(2, 0, [0.25, 0.25, 0.25, 0.25]);
  if (level >= 3) cells.splice(3, 0, [0.5, 0.25, 0.25], [0.25, 0.25, 0.5]);
  return cells;
}
/** Change one beat of a bar to the next cell. Long notes that cover the beat are split into crotchets first. */
export function cycleBeat(bar, beat, beats, level) {
  const slots = [];
  let p = 0, cur = [];
  const flat = [];
  bar.forEach((d) => { flat.push({ d, p }); p += Math.abs(d); });
  for (let b = 0; b < beats; b++) {
    const inside = flat.filter((n) => n.p >= b - 1e-6 && n.p + Math.abs(n.d) <= b + 1 + 1e-6);
    const sum = inside.reduce((s, n) => s + Math.abs(n.d), 0);
    slots.push(Math.abs(sum - 1) < 1e-6 ? inside.map((n) => n.d) : [1]);
  }
  const cells = beatCells(level), key = JSON.stringify(slots[beat]);
  const at = cells.findIndex((c) => JSON.stringify(c) === key);
  slots[beat] = cells[(at + 1) % cells.length];
  return slots.flat();
}
