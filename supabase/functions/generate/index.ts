// Lessonbeat generation function.
// The model writes text and music *data*; this code checks the data before anything is returned.
// The API key never leaves the server. Provider can be swapped with environment variables.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (code: string, message: string, status = 400) => json({ ok: false, error: { code, message } }, status);

const env = (k: string) => Deno.env.get(k) ?? "";
const LIMIT_GUEST = Number(env("LIMIT_GUEST") || 120);
const LIMIT_USER = Number(env("LIMIT_USER") || 500);
const LIMIT_GLOBAL = Number(env("LIMIT_GLOBAL") || 5000);

type Provider = { name: string; url: string; model: string; key: string };
function providers(): Provider[] {
  const list: Provider[] = [];
  if (env("AI_BASE_URL") && env("AI_API_KEY")) {
    list.push({ name: "custom", url: env("AI_BASE_URL").replace(/\/$/, "") + "/chat/completions", model: env("AI_MODEL") || "gpt-4o-mini", key: env("AI_API_KEY") });
  }
  if (env("DEEPSEEK_API_KEY")) {
    list.push({ name: "deepseek", url: "https://api.deepseek.com/chat/completions", model: env("DEEPSEEK_MODEL") || "deepseek-chat", key: env("DEEPSEEK_API_KEY") });
  }
  if (env("MOONSHOT_API_KEY")) {
    list.push({ name: "kimi", url: "https://api.moonshot.ai/v1/chat/completions", model: env("MOONSHOT_MODEL") || "kimi-k2-0905-preview", key: env("MOONSHOT_API_KEY") });
  }
  return list;
}

async function callModel(system: string, user: string, maxTokens: number, temperature = 0.7) {
  const list = providers();
  if (!list.length) throw new Error("NO_KEY");
  let lastErr = "";
  for (const p of list.flatMap((x) => [x, x])) { // each provider gets two tries
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 120000);
    try {
      const r = await fetch(p.url, {
        method: "POST",
        signal: ctl.signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + p.key },
        body: JSON.stringify({
          model: p.model,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          response_format: { type: "json_object" },
          max_tokens: maxTokens,
          temperature,
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        lastErr = `${p.name} ${r.status}: ${t.slice(0, 200)}`;
        if (r.status === 401) lastErr = "AUTH " + lastErr;
        if (r.status === 402) lastErr = "CREDIT " + lastErr;
        continue;
      }
      const j = await r.json();
      const text: string = j?.choices?.[0]?.message?.content ?? "";
      const data = parseJson(text);
      if (!data) { lastErr = `${p.name}: reply was not valid JSON`; continue; }
      return { data, provider: p.name, tin: j?.usage?.prompt_tokens ?? 0, tout: j?.usage?.completion_tokens ?? 0 };
    } catch (e) {
      lastErr = `${p.name}: ${(e as Error).name === "AbortError" ? "timed out" : (e as Error).message}`;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastErr || "MODEL_FAILED");
}
function parseJson(text: string) {
  let t = (text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { return null; }
}

/* ---------- helpers ---------- */
const S = (v: unknown, max = 400) => (typeof v === "string" ? v : v == null ? "" : String(v)).replace(/\s+/g, " ").trim().slice(0, max);
const L = (v: unknown, max = 3000) => (typeof v === "string" ? v : v == null ? "" : String(v)).trim().slice(0, max);
const A = (v: unknown, n = 12, max = 200) => (Array.isArray(v) ? v : []).slice(0, n).map((x) => S(x, max)).filter(Boolean);
const N = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

const YEARS = ["Foundation", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12"];
function levelOf(year: string) { const i = YEARS.indexOf(year); return i <= 2 ? 1 : i <= 4 ? 2 : i <= 6 ? 3 : 4; }
function bandOf(year: string) {
  const i = YEARS.indexOf(year);
  return i <= 0 ? "Foundation" : i <= 2 ? "Years 1-2" : i <= 4 ? "Years 3-4" : i <= 6 ? "Years 5-6" : i <= 8 ? "Years 7-8" : i <= 10 ? "Years 9-10" : "Senior";
}
const MODELS: Record<string, { name: string; phases: string[] }> = {
  gradual: { name: "I Do, We Do, You Do (gradual release)", phases: ["Warm-up", "I do", "We do", "You do", "Reflect"] },
  hunter: { name: "Madeline Hunter direct instruction", phases: ["Anticipatory set", "Objective and purpose", "Input and modelling", "Check for understanding", "Guided practice", "Independent practice", "Closure"] },
  explicit: { name: "Explicit teaching with daily review", phases: ["Daily review", "Explain and model", "Guided practice", "Independent practice", "Review"] },
  inquiry: { name: "Student inquiry (5E)", phases: ["Engage", "Explore", "Explain", "Elaborate", "Evaluate"] },
  fouras: { name: "4 A's active learning cycle", phases: ["Activity", "Analysis", "Abstraction", "Application"] },
  choice: { name: "Choice board", phases: ["Warm-up", "Mini-lesson", "Choice board work", "Share and reflect"] },
  orff: { name: "Orff process (imitate, explore, improvise, create)", phases: ["Warm-up", "Imitate", "Explore", "Improvise and create", "Share and reflect"] },
  kodaly: { name: "Kodály sequence (prepare, present, practise)", phases: ["Greeting and warm-up", "Prepare", "Present", "Practise", "Game or song", "Close"] },
};

type Form = ReturnType<typeof cleanForm>;
function cleanForm(f: any) {
  f = f || {};
  const year = YEARS.includes(f.year) ? f.year : "Year 3";
  const senior = f.senior || {};
  const inc = f.include || {};
  return {
    state: S(f.state, 40) || "Victoria",
    year,
    level: levelOf(year),
    band: bandOf(year),
    lessons: N(f.lessons, 1, 12, 4),
    length: N(f.length, 20, 120, 50),
    topic: S(f.topic, 600),
    focus: A(f.focus, 10, 60),
    instruments: A(f.instruments, 12, 60),
    model: MODELS[f.model] ? f.model : "gradual",
    include: { li: inc.li !== false, sc: inc.sc !== false, timings: inc.timings !== false, diff: inc.diff !== false, vocab: inc.vocab !== false },
    audience: ["teacher", "crt", "students"].includes(f.audience) ? f.audience : "teacher",
    codes: A(f.codes, 12, 20),
    formative: N(f.formative, 0, 6, 2),
    summative: N(f.summative, 0, 3, 1),
    atype: A(f.atype, 6, 60),
    worksheets: N(f.worksheets, 0, 6, 2),
    clap: N(f.clap, 0, 4, 2),
    sing: N(f.sing, 0, 3, 1),
    backing: N(f.backing, 0, 2, 1),
    songs: S(f.songs, 300),
    avoid: S(f.avoid, 300),
    notes: S(f.notes, 600),
    senior: { course: S(senior.course, 120), unit: S(senior.unit, 120), outcomes: L(senior.outcomes, 1500) },
    amounts: f.amounts === "custom" ? "custom" : "auto",
    listening: N(f.listening, 0, 6, 2),
    wants: S(f.wants, 400),
    ccp: A(f.ccp, 10, 80),
    memory: L(f.memory, 1800),
    framework: S(f.state, 40) === "Victoria" ? "VC2" : "AC9",
    docs: (Array.isArray(f.docs) ? f.docs : []).slice(0, 4).map((d: any) => ({ name: S(d?.name, 120), purpose: S(d?.purpose, 120), text: L(d?.text, 2500) })).filter((d: any) => d.text),
  };
}

function classBrief(f: Form, codeRows: { code: string; description: string }[]) {
  const who = { teacher: "the planning teacher (concise professional notes)", crt: "a casual relief teacher who may not be a music specialist (step-by-step, nothing assumed)", students: "students to read themselves (friendly second person, age-appropriate words)" }[f.audience];
  const lines = [
    `State or territory: ${f.state}, Australia. Year level: ${f.year}.`,
    f.lessons === 1 ? `This is a single lesson of ${f.length} minutes.` : `Unit of ${f.lessons} lessons, each ${f.length} minutes.`,
    `Topic or focus from the teacher: ${f.topic || "teacher did not specify; choose a sensible, engaging focus for this year level"}.`,
    f.focus.length ? `Musical focus areas: ${f.focus.join(", ")}.` : "",
    f.instruments.length ? `Available in the room: ${f.instruments.join(", ")}. Do not require anything else.` : "Assume voices and body percussion only unless the topic implies otherwise.",
    `Lesson structure: ${MODELS[f.model].name}.`,
    `Written for: ${who}.`,
    f.songs ? `Songs or repertoire the teacher wants to use: ${f.songs}.` : "",
    f.avoid ? `Avoid: ${f.avoid}.` : "",
    f.notes ? `Other notes from the teacher: ${f.notes}.` : "",
    f.memory ? `CLASS MEMORY. This is what this exact class has already been taught and how it went. Build on it: do not re-teach what went well, revisit what was hard, and reuse songs and rhythms they already know as warm-ups.\n${f.memory}` : "",
    f.wants ? `Resources the teacher specifically asked for: ${f.wants}.` : "",
    f.ccp.length ? `Weave in these cross-curriculum priorities or capabilities where they genuinely fit (name them in the plan): ${f.ccp.join("; ")}.` : "",
  ];
  if (f.band === "Senior") {
    lines.push(`Senior secondary course: ${f.senior.course || "state senior music course"}${f.senior.unit ? ", " + f.senior.unit : ""}.`);
    if (f.senior.outcomes) lines.push(`Outcomes or key knowledge supplied by the teacher (use these exact ideas, do not invent official codes): ${f.senior.outcomes}`);
    lines.push("Do not quote or invent wording or codes from the official study design or syllabus. Refer to areas of study in general terms only.");
  } else if (codeRows.length) {
    lines.push(f.framework === "VC2" ? "Victorian Curriculum F-10 Version 2.0 Music content descriptions (summarised) you may align to (use ONLY these codes, exactly as written):" : "Australian Curriculum v9 Music content descriptions you may align to (use ONLY these codes, exactly as written):");
    codeRows.forEach((c) => lines.push(`- ${c.code}: ${c.description}`));
  }
  if (f.docs.length) {
    lines.push("The teacher uploaded these school documents. Follow their terminology, sequence and format where relevant:");
    f.docs.forEach((d) => lines.push(`--- ${d.name}${d.purpose ? " (" + d.purpose + ")" : ""} ---\n${d.text}`));
  }
  return lines.filter(Boolean).join("\n");
}

const SYSTEM = `You are an expert Australian classroom music teacher and curriculum writer with Kodály, Orff and contemporary band experience. You write practical, specific plans a real teacher can run tomorrow.
Rules:
- Australian English spelling. Year levels use Australian terms. Rhythm names are crotchet, quaver, minim, semibreve (ta, ti-ti, too).
- Be concrete: name the actual activity, what the teacher says or does, what students do. No filler, no generic advice.
- Never include lyrics or melodies from commercial or copyrighted songs. Use original material you write, or name traditional public-domain songs by title only.
- Never include URLs or invent video titles. Suggest search phrases instead.
- For First Nations Australian music, never invent cultural material; direct the teacher to locally endorsed resources and community consultation.
- Return ONLY one JSON object that matches the requested shape. No commentary.`;

/* ---------- music data validation ---------- */
function durations(level: number) { return level === 1 ? [1, 0.5] : level === 2 ? [1, 0.5, 2, 4, 0.25] : level === 3 ? [1, 0.5, 2, 4, 0.25, 1.5, 3] : [1, 0.5, 2, 4, 0.25, 1.5, 3, 0.75]; }
function rests(level: number) { return level === 1 ? [1] : level === 2 ? [1, 2, 4] : [1, 2, 4, 0.5]; }
// Try to rescue a bar whose durations don't add up: trim from the end, then pad with a rest.
function snapBar(durs: number[], beats: number, level: number): number[] {
  const out: number[] = []; let sum = 0;
  for (const d of durs) { if (!isFinite(d) || !d) continue; const a = Math.abs(d); if (sum + a > beats + 1e-6) break; out.push(d); sum += a; }
  const gap = Math.round((beats - sum) * 4) / 4;
  if (gap > 0 && out.length) { const fills = rests(level).filter((r: number) => r <= gap).sort((x: number, y: number) => y - x); let left = gap; for (const r of fills) { while (left - r >= -1e-6 && left > 1e-6) { out.push(-r); left -= r; } } }
  return out;
}
function barProblem(durs: number[], beats: number, level: number): string | null {
  if (!Array.isArray(durs) || !durs.length) return "empty bar";
  const ok = durations(level), okRest = rests(level);
  let pos = 0;
  for (const raw of durs) {
    const d = Math.abs(raw), rest = raw < 0;
    if (!(rest ? okRest : ok).includes(d)) return `value ${raw} is not allowed at this level`;
    const eps = 1e-6, on = (g: number) => Math.abs(pos / g - Math.round(pos / g)) < eps;
    if (d === 0.25 && !on(0.25)) return "semiquaver off the grid";
    if (d === 0.5 && !on(0.5)) return "quaver off the grid";
    if ((d === 0.75 || d === 1.5 || d === 3) && !on(1)) return "dotted note must start on a beat";
    if (d >= 1 && d !== 1.5 && d !== 3) { if (level < 4 ? !on(1) : !on(0.5)) return "long note must start on a beat"; }
    if (d === 2 && level < 4 && !on(1)) return "minim must start on a beat";
    pos += d;
  }
  if (Math.abs(pos - beats) > 1e-6) return `adds up to ${pos} beats, expected ${beats}`;
  if (level < 4) { // sub-beat notes must complete their beat
    let p = 0;
    for (const raw of durs) { const d = Math.abs(raw); if (d < 1) { const end = p + d; const frac = end - Math.floor(end + 1e-6); if (frac > 1e-6) { /* fine if next continues */ } } p += d; }
  }
  return null;
}
const SAFE: Record<number, number[][]> = {
  2: [[1, 1], [0.5, 0.5, 1], [1, -1]],
  3: [[1, 1, 1], [1, 0.5, 0.5, 1], [1, 1, -1]],
  4: [[1, 1, 0.5, 0.5, 1], [0.5, 0.5, 1, 0.5, 0.5, 1], [1, 0.5, 0.5, 1, -1], [1, 1, 1, -1]],
};
function fixClap(c: any, f: Form, i: number, repaired: string[]) {
  const beats = [2, 3, 4].includes(Number(c?.beats)) ? Number(c.beats) : 4;
  let bars: number[][] = (Array.isArray(c?.bars) ? c.bars : []).slice(0, 8).map((b: any) => (Array.isArray(b) ? b.map(Number) : []));
  if (bars.length < 2) bars = [...bars, ...SAFE[beats]].slice(0, 4);
  if (bars.length % 2 && bars.length < 8) bars.push(SAFE[beats][bars.length % SAFE[beats].length]);
  bars = bars.map((b, k) => { if (barProblem(b, beats, f.level)) { const sn = snapBar(b, beats, f.level); if (!barProblem(sn, beats, f.level) && sn.some((x) => x > 0)) b = sn; } const p = barProblem(b, beats, f.level); if (p) { repaired.push(`Clap-along ${i + 1} bar ${k + 1}: ${p}`); return SAFE[beats][k % SAFE[beats].length]; } return b; });
  return { title: S(c?.title, 80) || `Clap-along ${i + 1}`, lesson: N(c?.lesson, 1, f.lessons, Math.min(f.lessons, i + 1)), tempo: N(c?.tempo, 50, 160, 84), beats, bars, tip: S(c?.tip, 400) };
}
const SOLFA: Record<string, number> = { "s,": -5, "l,": -3, "t,": -1, d: 0, r: 2, m: 4, f: 5, s: 7, l: 9, t: 11, "d'": 12, "r'": 14, "m'": 16 };
function solfaSet(level: number) { return level === 1 ? ["d", "r", "m", "s", "l"] : level === 2 ? ["s,", "l,", "d", "r", "m", "s", "l", "d'"] : Object.keys(SOLFA); }
const NUMERAL = /^b?(I|II|III|IV|V|VI|VII|i|ii|iii|iv|v|vi|vii)7?$/;
function fixSing(s: any, f: Form, i: number, repaired: string[]) {
  const beats = [2, 3, 4].includes(Number(s?.beats)) ? Number(s.beats) : 4;
  const allowed = solfaSet(f.level);
  let bars: any[][] = (Array.isArray(s?.bars) ? s.bars : []).slice(0, 16);
  bars = bars.map((bar, k) => {
    let notes = (Array.isArray(bar) ? bar : []).map((n: any) => ({ s: S(n?.s, 3), d: Math.abs(Number(n?.d)) || 1, w: S(n?.w, 18) }));
    notes = notes.map((n) => (n.s === "z" || allowed.includes(n.s) ? n : { ...n, s: allowed.includes(n.s.replace(/[,']/g, "")) ? n.s.replace(/[,']/g, "") : "d" }));
    const lv = Math.max(2, f.level), sgn = (n: any) => (n.s === "z" ? -n.d : n.d);
    if (barProblem(notes.map(sgn), beats, lv)) { const keep: any[] = []; let sum = 0; for (const n of notes) { if (sum + n.d > beats + 1e-6) break; keep.push(n); sum += n.d; } const gap = Math.round((beats - sum) * 4) / 4; if (keep.length && gap > 0 && [0.5, 1, 2, 3].includes(gap)) keep.push({ s: "z", d: gap, w: "" }); if (keep.length && !barProblem(keep.map(sgn), beats, lv)) notes = keep; }
    const p = barProblem(notes.map(sgn), beats, lv);
    if (p) { repaired.push(`Sing-along ${i + 1} bar ${k + 1}: ${p}`); const fill = beats === 3 ? ["d", "m", "s"] : beats === 2 ? ["m", "d"] : ["d", "m", "s", "m"]; notes = fill.map((x) => ({ s: x, d: 1, w: "la" })); }
    return notes;
  }).filter((b) => b.length);
  if (bars.length < 4) return null;
  if (bars.length % 2) bars.pop();
  const last = bars[bars.length - 1]; const lastNote = [...last].reverse().find((n) => n.s !== "z"); if (lastNote && f.level <= 2) lastNote.s = "d";
  let chords = A(s?.chords, 16, 6).filter((c) => NUMERAL.test(c)); if (chords.length !== bars.length) chords = [];
  return { title: S(s?.title, 80) || `Sing-along ${i + 1}`, lesson: N(s?.lesson, 1, f.lessons, 1), tempo: N(s?.tempo, 56, 150, 92), beats, bars, chords, about: S(s?.about, 300), tip: S(s?.tip, 400) };
}
const STYLES = ["pop", "rock", "shuffle", "ballad", "reggae", "waltz", "funk"];
function fixBacking(b: any, f: Form, i: number, repaired: string[]) {
  let bars = A(b?.bars, 16, 6).map((x) => (NUMERAL.test(x) ? x : null));
  if (bars.some((x) => !x)) { repaired.push(`Backing track ${i + 1}: unknown chord replaced with I`); bars = bars.map((x) => x || "I"); }
  if (bars.length < 4) bars = ["I", "V", "vi", "IV"];
  const style = STYLES.includes(b?.style) ? b.style : "pop";
  return { title: S(b?.title, 80) || `Backing track ${i + 1}`, lesson: N(b?.lesson, 1, f.lessons, 1), style, tempo: N(b?.tempo, 56, 170, 96), key: ["C", "D", "E", "F", "G", "A", "Bb", "Eb"].includes(b?.key) ? b.key : "C", bars: bars as string[], use: S(b?.use, 400), tip: S(b?.tip, 400) };
}

/* ---------- tasks ---------- */
/* ---------- resources the unit makes ---------- */
const PTYPES = ["worksheet", "listening-grid", "cards", "word-bank", "poster", "rhythm-cards"];
const PTYPE_HELP = `Printable types Lessonbeat can make (nothing else can be printed):
- "worksheet": a student worksheet (questions, writing about music, matching, fill-the-gap, listening responses, and rhythm tasks only if the lesson teaches rhythm reading/writing)
- "listening-grid": a table students fill in while listening (rows are things to listen for, columns are excerpts)
- "cards": cut-out cards for sorting, matching or games (word cards, or picture cards that use one emoji symbol each, e.g. instrument families)
- "word-bank": a sheet of key terms with short meanings
- "poster": a display poster with a heading and a few short points
- "rhythm-cards": cut-out flash cards, one bar each, made from a clap-along`;
function cleanPrintables(v: any) {
  return (Array.isArray(v) ? v : []).slice(0, 3).map((p: any) => ({ type: PTYPES.includes(p?.type) ? p.type : "worksheet", title: S(p?.title, 80), purpose: S(p?.purpose, 200) })).filter((p: any) => p.title);
}
function cleanPlan(p: any, f: Form) {
  return { clap: N(p?.clap, 0, 4, 1), sing: N(p?.sing, 0, 3, 1), backing: N(p?.backing, 0, 2, 1), listening: N(p?.listening, 0, 6, 1), formative: N(p?.formative, 0, 6, Math.min(2, f.lessons)), summative: N(p?.summative, 0, 3, 1) };
}
/** Custom amounts: the number of worksheets across the unit is exactly what the teacher asked for. */
function fitWorksheets(lessons: any[], f: Form, plan: any) {
  lessons.forEach((l) => { if (!plan.clap) l.printables = l.printables.filter((p: any) => p.type !== "rhythm-cards"); });
  if (f.amounts !== "custom") return;
  let n = 0;
  lessons.forEach((l) => { l.printables = l.printables.filter((p: any) => p.type !== "worksheet" || ++n <= f.worksheets); });
  for (let i = 0; n < f.worksheets && i < lessons.length * 2; i++) {
    const l = lessons[(lessons.length - 1 - (i % lessons.length) + lessons.length) % lessons.length];
    if (l.printables.length < 3) { l.printables.push({ type: "worksheet", title: `${l.title} worksheet`.slice(0, 80), purpose: "Practise and show understanding of this lesson's focus" }); n++; }
  }
}
/** Spoken rhythm names for a bar of durations, so prose can describe the exact pattern. */
function rhythmWords(bar: number[]): string {
  const out: string[] = []; let pos = 0, group: number[] = [];
  const flush = () => {
    if (!group.length) return;
    if (group.length === 2 && group.every((d) => d === 0.5)) out.push("ti-ti");
    else if (group.length === 4 && group.every((d) => d === 0.25)) out.push("ti-ri-ti-ri");
    else out.push(group.map((d) => (d === 0.5 ? "ti" : d === 0.25 ? "ri" : "tim")).join("-"));
    group = [];
  };
  for (const raw of bar) {
    const d = Math.abs(raw);
    if (!isFinite(d) || !d) continue;
    if (raw < 0) { flush(); out.push(d === 1 ? "rest" : `${d}-beat rest`); pos += d; continue; }
    if (d < 1) { group.push(d); pos += d; if (Math.abs(pos - Math.round(pos)) < 1e-6) flush(); continue; }
    flush();
    out.push(d === 1 ? "ta" : d === 2 ? "too (2 beats)" : d === 3 ? "dotted minim (3 beats)" : d === 4 ? "semibreve (4 beats)" : d === 1.5 ? "dotted crotchet" : `${d} beats`);
    pos += d;
  }
  flush();
  return out.join(" ");
}
function mediaText(md: any): string {
  if (!md || typeof md !== "object") return "";
  const lines: string[] = [];
  (Array.isArray(md.clap) ? md.clap : []).slice(0, 4).forEach((c: any, i: number) => {
    const bars = (Array.isArray(c?.bars) ? c.bars : []).slice(0, 8).map((b: any) => (Array.isArray(b) ? rhythmWords(b.map(Number)) : "")).filter(Boolean);
    lines.push(`Clap-along ${i + 1} "${S(c?.title, 80)}" (lesson ${N(c?.lesson, 1, 12, 1)}): ${bars.map((b: string, k: number) => `bar ${k + 1} = ${b}`).join(" | ")}`);
  });
  (Array.isArray(md.sing) ? md.sing : []).slice(0, 3).forEach((s: any) => lines.push(`Sing-along "${S(s?.title, 80)}" (lesson ${N(s?.lesson, 1, 12, 1)}), words: "${S(s?.words, 300)}"`));
  (Array.isArray(md.backing) ? md.backing : []).slice(0, 2).forEach((b: any) => lines.push(`Backing track "${S(b?.title, 80)}" (lesson ${N(b?.lesson, 1, 12, 1)}): chords ${A(b?.bars, 16, 6).join(" ")}`));
  (Array.isArray(md.listening) ? md.listening : []).slice(0, 6).forEach((x: any) => lines.push(`Listening piece "${S(x?.title, 100)}"${x?.composer ? " by " + S(x.composer, 80) : ""} (lesson ${N(x?.lesson, 1, 12, 1)}): listen for ${A(x?.listenFor, 4, 120).join("; ")}`));
  return lines.length ? "Ready-made media in this unit. When you mention a pattern, song or piece, describe it exactly as written here and never invent a different one:\n" + lines.join("\n") : "";
}
const PRINT_WORDS = /work ?sheet|handout|hand-out|\bcards?\b|flash ?card|poster|\bgrid\b|chart|template|print|word bank|booklet|\bsheet\b|clap-along|sing-along|backing track/i;

async function taskOutline(f: Form, codeRows: any[]) {
  const n = f.lessons;
  const user = `${classBrief(f, codeRows)}

Write the ${n === 1 ? "lesson overview" : "unit outline"}. JSON shape:
{"title": string (max 60 chars, specific, no colon),
 "summary": string (2-3 sentences on what students will do and learn),
 "bigIdea": string (one sentence),
 "priorKnowledge": string (one sentence),
 "vocabulary": [{"term": string, "meaning": string (student-friendly)}] (4-8 items),
 "lessons": [ exactly ${n} items: {"title": string, "focus": string (one sentence), "codes": [curriculum codes from the list, 1-3 per lesson, or [] if none supplied], "li": string (learning intention starting "We are learning to"), "sc": [2-3 success criteria each starting "I can"], "formative": string (one quick check for this lesson, or "" ), "printables": [0-3 items: {"type": string, "title": string, "purpose": string}]} ]${f.amounts === "auto" ? `,
 "plan": {"clap": 0-4, "sing": 0-3, "backing": 0-2, "listening": 0-6, "formative": 0-6, "summative": 0-3}` : ""}}
Sequence the lessons so each builds on the last, moving from experiencing to reading/notating to creating/performing.
The title must describe only what the lessons actually do (no promises the lessons don't keep).

${PTYPE_HELP}
"printables" lists every printed or handed-out item a lesson uses. Lessonbeat makes each one, so list only what a student or teacher will really hold or display (support materials included, e.g. picture cards for EAL students). Lessons may not use any printed item that is not listed here.
${f.amounts === "auto" ? `"plan" is how many on-screen resources this unit needs. Decide from the nature of the lessons: clap-alongs (rhythm patterns with notation and sound), sing-alongs (an original song), backing tracks (chord loops to play, sing or improvise over), listening pieces (real, well-known recordings to analyse), formative checks, summative tasks. Use 0 for anything the lessons do not need. A listening and analysis unit needs listening pieces and may need no clap-alongs; a rhythm unit needs clap-alongs.` : `The teacher wants ${f.worksheets} worksheet(s) across the ${n === 1 ? "lesson" : "unit"} in total (type "worksheet"). Other printable types only where a lesson genuinely needs one.`}`;
  const r = await callModel(SYSTEM, user, 3200);
  const d = r.data, allowed = new Set(codeRows.map((c) => c.code));
  let lessons = (Array.isArray(d.lessons) ? d.lessons : []).slice(0, n).map((x: any, i: number) => ({
    title: S(x?.title, 90) || `Lesson ${i + 1}`, focus: S(x?.focus, 300),
    codes: A(x?.codes, 4, 20).filter((c) => allowed.has(c)),
    li: S(x?.li, 300), sc: A(x?.sc, 4, 220), formative: S(x?.formative, 300), printables: cleanPrintables(x?.printables),
  }));
  if (lessons.length < n) throw new Error("The outline came back with too few lessons. Try again.");
  if (allowed.size) lessons.forEach((l: any) => { if (!l.codes.length) l.codes = [codeRows[0].code]; });
  const plan = f.amounts === "auto" ? cleanPlan(d.plan, f) : { clap: f.clap, sing: f.sing, backing: f.backing, listening: f.listening, formative: f.formative, summative: f.summative };
  fitWorksheets(lessons, f, plan);
  return { ...r, data: { plan, title: S(d.title, 80) || "Music unit", summary: S(d.summary, 600), bigIdea: S(d.bigIdea, 300), priorKnowledge: S(d.priorKnowledge, 300), vocabulary: (Array.isArray(d.vocabulary) ? d.vocabulary : []).slice(0, 10).map((v: any) => ({ term: S(v?.term, 40), meaning: S(v?.meaning, 200) })).filter((v: any) => v.term), lessons } };
}

function cleanLesson(d: any, f: Form) {
  let phases = (Array.isArray(d?.phases) ? d.phases : []).slice(0, 9).map((p: any) => ({ name: S(p?.name, 50), minutes: N(p?.minutes, 1, 90, 5), teacher: L(p?.teacher, 900), students: L(p?.students, 600), screen: S(p?.screen, 140), say: S(p?.say, 500), media: S(p?.media, 120) })).filter((p: any) => p.name && (p.teacher || p.students));
  if (phases.length < 2) throw new Error("The lesson came back incomplete. Try again.");
  let total = phases.reduce((s: number, p: any) => s + p.minutes, 0);
  if (total !== f.length) { // rescale, then put the remainder on the longest phase
    phases.forEach((p: any) => (p.minutes = Math.max(2, Math.round((p.minutes * f.length) / total))));
    total = phases.reduce((s: number, p: any) => s + p.minutes, 0);
    const longest = phases.reduce((a: any, b: any) => (b.minutes > a.minutes ? b : a));
    longest.minutes = Math.max(2, longest.minutes + (f.length - total));
  }
  return {
    phases,
    prep: A(d?.prep, 5, 260),
    materials: A(d?.materials, 10, 120).filter((x) => !PRINT_WORDS.test(x)),
    support: S(d?.support, 500), extend: S(d?.extend, 500),
    notes: S(d?.notes, 600),
    search: (Array.isArray(d?.search) ? d.search : []).slice(0, 3).map((x: any) => ({ label: S(x?.label, 80), query: S(x?.query, 100) })).filter((x: any) => x.query),
  };
}
async function taskLesson(f: Form, codeRows: any[], ctx: any) {
  const idx = N(ctx?.index, 0, 11, 0);
  const outline = (Array.isArray(ctx?.outline) ? ctx.outline : []).slice(0, 12).map((l: any, i: number) => `${i + 1}. ${S(l?.title, 90)} - ${S(l?.focus, 200)}`).join("\n");
  const me = ctx?.lesson || {};
  const media = A(ctx?.media, 12, 160);
  const prints = cleanPrintables(ctx?.printables);
  const m = MODELS[f.model];
  const user = `${classBrief(f, codeRows)}

Unit: ${S(ctx?.unitTitle, 90)}
All lessons:
${outline}

Write the full plan for lesson ${idx + 1}: "${S(me.title, 90)}".
Focus: ${S(me.focus, 300)}
Learning intention: ${S(me.li, 300)}
Success criteria: ${A(me.sc, 4, 220).join("; ")}
${media.length ? "On-screen media for this lesson (refer to them by exact name where they fit): " + media.join(" | ") : "There is no on-screen media for this lesson."}
${mediaText(ctx?.mediaData)}
${ctx?.instruction ? "The teacher asked for this change: " + S(ctx.instruction, 400) : ""}

RESOURCES RULE (important): the only printed or handed-out materials that exist for this lesson are: ${prints.length ? prints.map((p) => `${p.type} "${p.title}" (${p.purpose})`).join("; ") : "none"}.
Refer to them by exact title. Never mention any other worksheet, handout, card, chart, poster, grid, template or printed item, including in Support and Extend. For extra visual support use the board, gestures, modelling or the listed resources.
For recordings, refer only to the listening pieces named above, or say "a recording of your choice".

Use these phases in order: ${m.phases.join(", ")}. Minutes must add up to exactly ${f.length}.
JSON shape:
{"phases": [{"name": string, "minutes": integer, "teacher": string (what the teacher does and says, 2-4 specific sentences), "students": string (what students do, 1-3 sentences),
   "screen": string (ONE short instruction shown to students on the classroom screen during this phase, written to them, 12 words or fewer, e.g. "Clap the rhythm with me. Keep your feet on the beat."),
   "say": string (the exact words the teacher can read aloud to start this phase, 1-3 plain sentences a non-musician could say),
   "media": string (the exact title of the ONE on-screen media item used in this phase, copied from the list above, or "" if none)}],
 "prep": [3-5 short points for a teacher with NO music training to read two minutes before class: what the musical words in this lesson mean in plain language, exactly how to do anything musical they must model (e.g. how to count in "1, 2, 3, 4" at a steady walking pace), and what "good" looks and sounds like],
 "materials": [short strings: ONLY everyday things the teacher supplies (instruments, whiteboard, speakers, device, space). Never printed resources or media],
 "support": string (how to support students who need it),
 "extend": string (how to extend confident students),
 "notes": string (one or two practical tips: behaviour, transitions, common mistakes),
 "search": [{"label": string, "query": string}] (0-2 optional YouTube search phrases for a listening example; never a URL)}`;
  const r = await callModel(SYSTEM, user, 3200);
  const data = cleanLesson(r.data, f);
  const titles = media.map((x) => (x.match(/"(.+)"/) || [])[1] || x);
  data.phases.forEach((p: any) => { const hit = titles.find((t) => t.toLowerCase() === p.media.toLowerCase()) || titles.find((t) => p.media && (t.toLowerCase().includes(p.media.toLowerCase()) || p.media.toLowerCase().includes(t.toLowerCase()))); p.media = hit || ""; });
  return { ...r, data };
}

function mediaShape(f: Form) {
  const dl = durations(f.level).join(", "), rl = rests(f.level).map((x) => -x).join(", ");
  const sol = solfaSet(f.level).join(" ");
  return `Music data rules (a program checks these and rejects mistakes):
- Rhythm values are numbers of beats. Allowed notes: ${dl}. Allowed rests (negative): ${rl}. Each bar must add up to exactly "beats" (use 4 unless the topic needs 3 or 2).
- Quavers (0.5) come in pairs starting on a beat. Semiquavers (0.25) come in fours starting on a beat${f.level >= 3 ? ", or 0.5 + 0.25 + 0.25" : ""}.${f.level >= 3 ? " 1.5 starts on a beat and is followed by 0.5." : ""}${f.level >= 4 ? " 0.75 starts on a beat and is followed by 0.25. Syncopation 0.5, 1, 0.5 is allowed." : ""}
- Pitches are movable-do solfa. Allowed: ${sol} (comma = below do, apostrophe = above), "z" = rest. Mostly steps and small skips, end on d. Keep the range within an octave.
- Chords are roman numerals relative to the major scale: I ii iii IV V vi, optional 7 (I7, V7), and bIII bVI bVII, i iv v for minor colour.`;
}
async function taskMedia(f: Form, codeRows: any[], ctx: any) {
  const outline = (Array.isArray(ctx?.outline) ? ctx.outline : []).slice(0, 12).map((l: any, i: number) => `${i + 1}. ${S(l?.title, 90)} - ${S(l?.focus, 200)}`).join("\n");
  const user = `${classBrief(f, [])}

Unit: ${S(ctx?.unitTitle, 90)}
Lessons:
${outline}

Create practice media for this unit as DATA (code will draw the notation and make the sound):
- ${f.clap} clap-along rhythm pattern(s), 4 bars each, increasing in difficulty and matched to the lessons that teach them.
- ${f.sing} original sing-along song(s), 8 bars each, with words about the unit's content or a fun theme for ${f.year}. One syllable per note; end a syllable with "-" when the word continues on the next note.
- ${f.backing} backing track(s) students can play, sing or improvise over (chord loop of 4, 8 or 12 bars).
- ${f.listening} listening piece(s): real, well-known recorded works that fit the lessons (for example orchestral, film, jazz, popular or world music). Only choose works you are certain exist, with the correct composer or performer. Never invent a title. For First Nations Australian music, choose widely available published recordings by named First Nations artists and add that the teacher should preview and follow local protocols.
${mediaShape(f)}
JSON shape:
{"clap": [{"title": string, "lesson": integer, "tempo": integer bpm, "beats": 4, "bars": [[numbers]], "tip": string (how to use it in class)}],
 "sing": [{"title": string, "lesson": integer, "tempo": integer, "beats": 4, "bars": [[{"s": solfa, "d": beats, "w": syllable}]], "chords": [one numeral per bar], "about": string, "tip": string}],
 "backing": [{"title": string, "lesson": integer, "style": one of ${STYLES.join("|")}, "tempo": integer, "key": one of C|D|E|F|G|A|Bb|Eb, "bars": [numerals, one per bar], "use": string (what students do over it), "tip": string}],
 "listening": [{"title": string (the real work's title), "composer": string (composer or songwriter), "performer": string (a well-known performer or ensemble, or ""), "lesson": integer, "excerpt": string (which part to play, e.g. "the opening 90 seconds"), "why": string (one sentence on why it fits), "listenFor": [2-4 short things to listen for], "query": string (a YouTube search phrase that finds it)}]}
RHYTHM RULES (checked by code, wrong bars are thrown away):
- Durations are in BEATS: crotchet=1, quaver=0.5, semiquaver=0.25, minim=2, dotted crotchet=1.5. A rest is the same number made negative (-1).
- Every bar must add up to exactly "beats" (4 for 4/4). Add each bar up before writing it. Good 4/4 bars: [1,1,1,1] [0.5,0.5,1,2] [0.25,0.25,0.25,0.25,1,1,1] [1,-1,1,1].
- A sing-along "d" is also in beats, so a bar of four crotchets is four notes with d 1, never d 4.
Use empty arrays for anything with a count of 0.`;
  const r = await callModel(SYSTEM, user, 5000, 0.6);
  const repaired: string[] = [];
  const d = r.data;
  const clap = (Array.isArray(d.clap) ? d.clap : []).slice(0, f.clap).map((c: any, i: number) => fixClap(c, f, i, repaired));
  while (clap.length < f.clap) clap.push(fixClap({}, f, clap.length, repaired));
  const sing = (Array.isArray(d.sing) ? d.sing : []).slice(0, f.sing).map((s: any, i: number) => fixSing(s, f, i, repaired)).filter(Boolean);
  const backing = (Array.isArray(d.backing) ? d.backing : []).slice(0, f.backing).map((b: any, i: number) => fixBacking(b, f, i, repaired));
  while (backing.length < f.backing) backing.push(fixBacking({}, f, backing.length, repaired));
  const listening = (Array.isArray(d.listening) ? d.listening : []).slice(0, f.listening).map((x: any) => ({
    title: S(x?.title, 120), composer: S(x?.composer, 100), performer: S(x?.performer, 100), lesson: N(x?.lesson, 1, f.lessons, 1),
    excerpt: S(x?.excerpt, 140), why: S(x?.why, 300), listenFor: A(x?.listenFor, 4, 140), query: S(x?.query, 120) || S(`${x?.title} ${x?.composer}`, 120),
  })).filter((x: any) => x.title);
  return { ...r, data: { clap, sing, backing, listening }, repaired };
}

function cleanAssessment(d: any, f: Form) {
  return {
    formative: (Array.isArray(d?.formative) ? d.formative : []).slice(0, f.formative).map((x: any) => ({ title: S(x?.title, 80), lesson: N(x?.lesson, 1, f.lessons, 1), how: S(x?.how, 500), lookFor: S(x?.lookFor, 400) })).filter((x: any) => x.title),
    summative: (Array.isArray(d?.summative) ? d.summative : []).slice(0, f.summative).map((x: any) => ({
      title: S(x?.title, 90), type: S(x?.type, 40), task: S(x?.task, 800), student: S(x?.student, 600),
      criteria: (Array.isArray(x?.criteria) ? x.criteria : []).slice(0, 5).map((c: any) => ({ name: S(c?.name, 60), levels: A(c?.levels, 4, 260) })).filter((c: any) => c.name && c.levels.length === 4),
    })).filter((x: any) => x.title),
  };
}
async function taskAssessment(f: Form, codeRows: any[], ctx: any) {
  const outline = (Array.isArray(ctx?.outline) ? ctx.outline : []).slice(0, 12).map((l: any, i: number) => `${i + 1}. ${S(l?.title, 90)} - LI: ${S(l?.li, 200)}`).join("\n");
  const user = `${classBrief(f, codeRows)}

Unit: ${S(ctx?.unitTitle, 90)}
Lessons:
${outline}
${mediaText(ctx?.mediaData)}
${ctx?.instruction ? "The teacher asked for this change: " + S(ctx.instruction, 400) : ""}
Do not require any printed resource that the unit does not make; a task sheet is part of this assessment only if you write its full text in "student".

Write the assessment: ${f.formative} formative check(s) and ${f.summative} summative task(s).${f.atype.length ? " Preferred summative types: " + f.atype.join(", ") + "." : ""}
Rubric levels are, in order: Beginning, Developing, Achieving, Excelling. Describe observable evidence, not adjectives.
JSON shape:
{"formative": [{"title": string, "lesson": integer, "how": string (what the teacher does, under 2 minutes of class time where possible), "lookFor": string}],
 "summative": [{"title": string, "type": string, "task": string (teacher-facing description), "student": string (instructions to read to students), "criteria": [{"name": string, "levels": [4 strings]}] (3-4 criteria)}]}`;
  const r = await callModel(SYSTEM, user, 2600);
  return { ...r, data: cleanAssessment(r.data, f) };
}

const WS_KINDS = ["read", "complete", "compose", "questions", "match", "listen"];
function cleanWorksheets(d: any, f: Form, nClap: number) {
  return {
    worksheets: (Array.isArray(d?.worksheets) ? d.worksheets : []).slice(0, f.worksheets).map((w: any) => ({
      title: S(w?.title, 80), lesson: N(w?.lesson, 1, f.lessons, 1), intro: S(w?.intro, 300),
      tasks: (Array.isArray(w?.tasks) ? w.tasks : []).slice(0, 5).map((t: any) => {
        const kind = WS_KINDS.includes(t?.kind) ? t.kind : "questions";
        const needsClap = kind === "read" || kind === "complete";
        if (needsClap && nClap === 0) return null;
        return { kind, prompt: S(t?.prompt, 260), clap: needsClap ? N(t?.clap, 1, Math.max(1, nClap), 1) : 0, bars: kind === "compose" ? N(t?.bars, 1, 4, 2) : 0, items: kind === "match" ? (Array.isArray(t?.items) ? t.items : []).slice(0, 6).map((p: any) => [S(p?.[0], 40), S(p?.[1], 120)]).filter((p: string[]) => p[0] && p[1]) : A(t?.items, 6, 200) };
      }).filter(Boolean),
    })).filter((w: any) => w.title && w.tasks.length),
  };
}
async function taskWorksheets(f: Form, codeRows: any[], ctx: any) {
  const outline = (Array.isArray(ctx?.outline) ? ctx.outline : []).slice(0, 12).map((l: any, i: number) => `${i + 1}. ${S(l?.title, 90)} - ${S(l?.focus, 160)}`).join("\n");
  const claps = A(ctx?.claps, 4, 100);
  const user = `${classBrief(f, [])}

Unit: ${S(ctx?.unitTitle, 90)}
Lessons:
${outline}
Vocabulary: ${A(ctx?.vocab, 10, 40).join(", ")}
Clap-along patterns available (numbered from 1): ${claps.length ? claps.map((c, i) => `${i + 1}. ${c}`).join("; ") : "none"}
${ctx?.instruction ? "The teacher asked for this change: " + S(ctx.instruction, 400) : ""}

Write ${f.worksheets} printable student worksheet(s) for ${f.year}. Each has 3-4 tasks. Task kinds:
- "read": students say and clap a clap-along pattern (set "clap" to its number). The notation is drawn for them.
- "complete": the same pattern is shown with one beat missing in each bar for students to fill in (set "clap").
- "compose": blank bars for students to write their own rhythm (set "bars" 1-4).
- "questions": short written questions (put them in "items", 2-4).
- "match": match terms to meanings ("items" is a list of [term, meaning] pairs, 3-5).
- "listen": listening response prompts ("items", 2-4 prompts).
JSON shape: {"worksheets": [{"title": string, "lesson": integer, "intro": string (one friendly sentence to students), "tasks": [{"kind": string, "prompt": string, "clap": integer, "bars": integer, "items": []}]}]}`;
  const r = await callModel(SYSTEM, user, 2400);
  return { ...r, data: cleanWorksheets(r.data, f, claps.length) };
}

/* ---------- printables for one lesson ---------- */
const WS_KINDS2 = ["read", "complete", "compose", "questions", "describe", "match", "listen", "fill"];
const RHYTHM_LESSON = /rhythm|beat|crotchet|quaver|minim|semiquaver|\bta\b|ti-ti|notat|compos|ostinato|clap/i;
function cleanTask(t: any, nClap: number, rhythmOk: boolean) {
  const kind = WS_KINDS2.includes(t?.kind) ? t.kind : "questions";
  if ((kind === "read" || kind === "complete" || kind === "compose") && !rhythmOk) return null;
  if ((kind === "read" || kind === "complete") && nClap === 0) return null;
  const DEF: Record<string, string> = { read: "Say the rhythm names, then clap the rhythm.", complete: "Fill in the missing beat in each bar.", compose: "Write your own rhythm. Every bar must add up.", questions: "Answer in short sentences.", describe: "Describe the music in full sentences.", match: "Draw a line from each word to its meaning.", listen: "Listen carefully and write what you hear.", fill: "Fill in the gaps using the word bank." };
  const base = { kind, prompt: S(t?.prompt, 260) || DEF[kind], clap: kind === "read" || kind === "complete" ? N(t?.clap, 1, Math.max(1, nClap), 1) : 0, bars: kind === "compose" ? N(t?.bars, 1, 4, 2) : 0, items: [] as any[], bank: [] as string[] };
  if (kind === "match") { base.items = (Array.isArray(t?.items) ? t.items : []).slice(0, 6).map((p: any) => [S(Array.isArray(p) ? p[0] : p?.term, 40), S(Array.isArray(p) ? p[1] : p?.meaning, 120)]).filter((p: string[]) => p[0] && p[1]); if (base.items.length < 3) return null; }
  else if (kind === "fill") { base.items = A(t?.items, 6, 200).filter((x) => x.includes("___")); base.bank = A(t?.bank, 8, 30); if (!base.items.length) return null; }
  else if (kind !== "read" && kind !== "complete" && kind !== "compose") { base.items = A(t?.items, 5, 220); if (!base.items.length) return null; }
  return base;
}
function cleanOnePrintable(p: any, want: any, nClap: number, rhythmOk: boolean) {
  const type = want.type, title = S(p?.title, 80) || want.title, intro = S(p?.intro, 300);
  if (type === "worksheet") { const tasks = (Array.isArray(p?.tasks) ? p.tasks : []).slice(0, 5).map((t: any) => cleanTask(t, nClap, rhythmOk)).filter(Boolean); return tasks.length ? { type, title, intro, tasks } : null; }
  if (type === "listening-grid") { const columns = A(p?.columns, 4, 60), rows = A(p?.rows, 8, 120); return columns.length && rows.length ? { type, title, intro, columns, rows } : null; }
  if (type === "cards") { const cards = (Array.isArray(p?.cards) ? p.cards : []).slice(0, 16).map((c: any) => ({ front: S(c?.front, 40), back: S(c?.back, 120), symbol: ((S(c?.symbol, 8).match(/\p{Extended_Pictographic}(️)?/u) || [""])[0]) })).filter((c: any) => c.front); return cards.length >= 4 ? { type, title, intro, cards } : null; }
  if (type === "word-bank") { const groups = (Array.isArray(p?.groups) ? p.groups : []).slice(0, 4).map((g: any) => ({ heading: S(g?.heading, 50), words: (Array.isArray(g?.words) ? g.words : []).slice(0, 10).map((w: any) => ({ term: S(w?.term, 40), meaning: S(w?.meaning, 140) })).filter((w: any) => w.term) })).filter((g: any) => g.words.length); return groups.length ? { type, title, intro, groups } : null; }
  if (type === "poster") { const points = A(p?.points, 6, 160); return points.length ? { type, title, subtitle: S(p?.subtitle, 120), points } : null; }
  if (type === "rhythm-cards") return nClap ? { type, title, intro, clap: N(p?.clap, 1, nClap, 1) } : null;
  return null;
}
async function taskPrintables(f: Form, ctx: any) {
  const items = cleanPrintables(ctx?.items);
  if (!items.length) return { data: { printables: [] }, provider: "", tin: 0, tout: 0 };
  const les = ctx?.lesson || {};
  const nClap = Array.isArray(ctx?.mediaData?.clap) ? Math.min(4, ctx.mediaData.clap.length) : 0;
  const lessonText = `${S(les.title, 90)} ${S(les.focus, 300)} ${S(les.li, 300)} ${L(ctx?.planText, 2500)}`;
  const rhythmOk = RHYTHM_LESSON.test(`${S(les.title, 90)} ${S(les.focus, 300)} ${S(les.li, 300)}`);
  const vocab = (Array.isArray(ctx?.vocab) ? ctx.vocab : []).slice(0, 10).map((v: any) => `${S(v?.term, 40)}: ${S(v?.meaning, 120)}`).join("; ");
  const user = `${classBrief(f, [])}

Unit: ${S(ctx?.unitTitle, 90)}
Lesson ${N(ctx?.index, 0, 11, 0) + 1}: ${S(les.title, 90)}
Focus: ${S(les.focus, 300)}
Learning intention: ${S(les.li, 300)}
What happens in the lesson: ${L(ctx?.planText, 2500) || "not written yet"}
Vocabulary: ${vocab || "none listed"}
${mediaText(ctx?.mediaData)}
${ctx?.instruction ? "The teacher asked for this change: " + S(ctx.instruction, 400) : ""}

Write these printables, in this order, for ${f.year} students. Each must match exactly how the lesson uses it:
${items.map((p, i) => `${i + 1}. ${p.type} "${p.title}": ${p.purpose}`).join("\n")}

Shapes by type:
- worksheet: {"type":"worksheet","title","intro" (one friendly sentence to students),"tasks":[2-4 tasks, each {"kind","prompt" (the instruction students read, e.g. "Listen to Excerpt 1 and describe what you hear"),"items":[...],"bank":[...],"clap","bars"}]}. Task kinds:
  "describe": writing about music in sentences, items = 2-4 prompts (e.g. "Describe the tempo and how it makes you feel");
  "questions": short answers, items = 2-4 questions;
  "match": draw-a-line matching, items = 3-5 [term, meaning] pairs;
  "fill": fill-the-gap sentences, items = 3-6 sentences each with ___ for the missing word, "bank" = the missing words;
  "listen": listening response boxes, items = 2-4 prompts;
  ${rhythmOk ? `"read" (set "clap" to a clap-along number: students say and clap it), "complete" (same clap-along with beats missing to fill in), "compose" (blank bars, set "bars" 1-4). Use rhythm tasks only if this lesson actually reads or writes rhythms.` : `Do NOT use rhythm tasks; this lesson does not read or write rhythms.`}
  Every task must practise what this lesson teaches. Use the teacher's exact wording of the task (e.g. writing to describe music means "describe" tasks).
- listening-grid: {"type":"listening-grid","title","intro","columns":[1-4 excerpt names],"rows":[3-7 things to listen for, e.g. "Instrument families heard"]}
- cards: {"type":"cards","title","intro" (how to use them),"cards":[6-16 {"front": short word or phrase, "back": short meaning or hint, "symbol": one emoji that pictures it, or ""}]}
- word-bank: {"type":"word-bank","title","intro","groups":[1-4 {"heading","words":[{"term","meaning"}]}]}
- poster: {"type":"poster","title","subtitle","points":[3-6 short points]}
- rhythm-cards: {"type":"rhythm-cards","title","intro","clap": clap-along number}
JSON shape: {"printables": [one object per item above, same order]}`;
  const r = await callModel(SYSTEM, user, 3600, 0.5);
  const got = Array.isArray(r.data?.printables) ? r.data.printables : [];
  const out = items.map((want, i) => {
    const match = got.find((g: any) => g?.type === want.type && S(g?.title, 80) === want.title) || got[i];
    return cleanOnePrintable(match && match.type === want.type ? match : { ...match, type: want.type }, want, nClap, rhythmOk) || { type: "missing", title: want.title, intro: "This printable did not come back properly. Ask for a change to rewrite it." };
  });
  return { ...r, data: { printables: out } };
}

/* ---------- report comments from what was taught ---------- */
async function taskReport(f: Form, ctx: any) {
  const lessons = (Array.isArray(ctx?.outline) ? ctx.outline : []).slice(0, 12).map((l: any, i: number) => `${i + 1}. ${S(l?.title, 90)}: ${S(l?.li, 200)} Success criteria: ${A(l?.sc, 4, 200).join("; ")}`).join("\n");
  const user = `Year level: ${f.year}. State: ${f.state}, Australia.
Unit: ${S(ctx?.unitTitle, 90)}
Lessons and success criteria:
${lessons}
${ctx?.log ? "What actually happened when it was taught:\n" + L(ctx.log, 1500) : "The unit has not been logged as taught yet; write from the plan."}
${ctx?.codes ? "Curriculum codes covered: " + S(ctx.codes, 300) : ""}

Write a bank of school report comments for Music for this unit. Use the placeholder {name} for the student's name and "they/their" pronouns. Each comment is 2-3 sentences, specific to what was taught (name the actual skills), positive and honest, in the plain professional style Australian parents read in reports. No jargon without a plain explanation. Never invent events.
JSON shape: {"levels": [{"level": "Working towards the standard", "comments": [two different comments]}, {"level": "At the standard", "comments": [two]}, {"level": "Above the standard", "comments": [two]}], "next": string (one sentence a teacher can add about what the class will learn next)}`;
  const r = await callModel(SYSTEM, user, 1400, 0.5);
  const levels = (Array.isArray(r.data?.levels) ? r.data.levels : []).slice(0, 3).map((x: any) => ({ level: S(x?.level, 60), comments: A(x?.comments, 3, 600).filter((c) => c.length > 20) })).filter((x: any) => x.level && x.comments.length);
  if (levels.length < 3) throw new Error("The report comments came back incomplete. Try again.");
  return { ...r, data: { levels, next: S(r.data?.next, 300) } };
}

/* ---------- help questions about Lessonbeat ---------- */
const HELP = `You answer questions about Lessonbeat, a free pilot website made by an Australian music teacher. Facts:
- Teachers fill in a planning form (year level Foundation to Year 12, state, curriculum codes, topic, lesson structure, who reads the plan, resources, school documents) and Lessonbeat writes a unit: overview, lesson plans, assessment with rubrics, and the resources those lessons use.
- Resources: clap-alongs (rhythm notation with sound), sing-alongs (original songs in a key that suits the class), backing tracks (any key, several styles, four bass-line levels), listening pieces with search links, printable worksheets, listening grids, cards, word banks, posters and rhythm cards.
- Curriculum: Australian Curriculum v9.0 Music codes for every state; Victorian teachers see Victorian Curriculum 2.0 (VC2) codes. Years 11-12 teachers type or paste their study design outcomes. Cross-curriculum priorities can be ticked.
- Teachers can click any sentence to edit it, ask for a change in plain words, print or save as PDF, download for Word, share a view-only link, and save media as video.
- Teach mode: press "Teach this lesson" and Lessonbeat runs the lesson on the classroom screen step by step, with a timer, words to say, and the music ready to play. It is designed so a teacher with no music training can run it.
- Class memory: after teaching, a 20-second check-in records how it went. Lessonbeat remembers what each class has done and builds the next unit on it. Report comments can be written from what was actually taught.
- Calendar packs: ready-to-run lessons for ANZAC Day, NAIDOC Week, Harmony Week, concerts and assemblies.
- Guest use works without an account; a free account keeps units across devices. Uploaded documents are private to the teacher. Don't upload student names.
- It uses AI, so teachers should check plans against school requirements.
Answer in 1-4 short sentences, plain Australian English. If the question is not about Lessonbeat or teaching with it, say you can only help with questions about Lessonbeat. If you don't know, say so and suggest the "Tell us what you think" link. Return JSON {"answer": string}.`;
async function taskHelp(body: any) {
  const q = S(body?.question, 400);
  if (q.length < 3) throw new Error("Type a question first.");
  const r = await callModel(HELP, q, 400, 0.3);
  return { ...r, data: { answer: S(r.data?.answer, 900) || "Sorry, I couldn't answer that. Try asking another way." } };
}

async function taskPrefill(body: any) {
  const prompt = L(body?.prompt, 800);
  if (prompt.length < 4) throw new Error("Tell me a little more about what you want to teach.");
  const user = `A teacher typed this request for a music lesson planner:
"""${prompt}"""
Fill in a planning form from it. Only include a field when the request states or clearly implies it.
JSON shape (all fields optional):
{"state": one of Victoria|New South Wales|Queensland|Western Australia|South Australia|Tasmania|Australian Capital Territory|Northern Territory,
 "year": one of ${YEARS.join("|")},
 "lessons": integer 1-12, "length": integer minutes,
 "topic": string (the musical topic in the teacher's words, tidied),
 "focus": subset of ["Beat and rhythm","Pitch and melody","Singing","Instruments","Composing","Listening and responding","Notation and theory","Aural skills","Music technology","Ensemble and performance","Music history and styles"],
 "instruments": subset of ["Body percussion","Voices","Untuned percussion","Tuned percussion (xylophones, glockenspiels)","Ukuleles","Recorders","Keyboards","Guitars","Bass guitar","Drum kit","Band instruments","Boomwhackers","Bucket drums","iPads or laptops"],
 "model": one of ${Object.keys(MODELS).join("|")},
 "audience": one of teacher|crt|students,
 "clap": integer 0-4, "sing": integer 0-3, "backing": integer 0-2,
 "formative": integer 0-6, "summative": integer 0-3, "worksheets": integer 0-6,
 "songs": string, "avoid": string}`;
  const r = await callModel("You turn a teacher's request into structured form values. Return only JSON.", user, 600, 0.2);
  const d = r.data, out: any = {};
  if (YEARS.includes(d.year)) out.year = d.year;
  ["state", "topic", "songs", "avoid"].forEach((k) => { if (S(d[k], 600)) out[k] = S(d[k], 600); });
  if (!out.topic) out.topic = S(prompt, 600);
  [["lessons", 1, 12], ["length", 20, 120], ["clap", 0, 4], ["sing", 0, 3], ["backing", 0, 2], ["formative", 0, 6], ["summative", 0, 3], ["worksheets", 0, 6]].forEach(([k, lo, hi]: any) => { if (d[k] != null && Number.isFinite(Number(d[k]))) out[k] = N(d[k], lo, hi, lo); });
  if (MODELS[d.model]) out.model = d.model;
  if (["teacher", "crt", "students"].includes(d.audience)) out.audience = d.audience;
  if (Array.isArray(d.focus)) out.focus = A(d.focus, 10, 60);
  if (Array.isArray(d.instruments)) out.instruments = A(d.instruments, 12, 60);
  return { ...r, data: out };
}

async function taskRevise(f: Form, codeRows: any[], ctx: any) {
  const scope = S(ctx?.scope, 20), instruction = S(ctx?.instruction, 500);
  if (!instruction) throw new Error("Type what you would like changed.");
  if (scope === "lesson") return taskLesson(f, codeRows, ctx);
  if (scope === "assessment") return taskAssessment(f, codeRows, ctx);
  if (scope === "worksheets") return taskWorksheets(f, codeRows, ctx);
  if (scope === "printables") return taskPrintables(f, ctx);
  if (scope === "clap" || scope === "sing" || scope === "backing") {
    const cur = JSON.stringify(ctx?.current ?? {}).slice(0, 3000);
    const shape = scope === "clap" ? `{"title": string, "lesson": integer, "tempo": integer, "beats": integer, "bars": [[numbers]], "tip": string}`
      : scope === "sing" ? `{"title": string, "lesson": integer, "tempo": integer, "beats": integer, "bars": [[{"s": solfa, "d": beats, "w": syllable}]], "chords": [numerals], "about": string, "tip": string}`
      : `{"title": string, "lesson": integer, "style": one of ${STYLES.join("|")}, "tempo": integer, "key": string, "bars": [numerals], "use": string, "tip": string}`;
    const user = `${classBrief(f, [])}

Here is the current ${scope === "clap" ? "clap-along rhythm" : scope === "sing" ? "sing-along song" : "backing track"} as data:
${cur}

The teacher asked: "${instruction}"
Return the revised version in the same shape, changing only what is needed.
${mediaShape(f)}
JSON shape: ${shape}`;
    const r = await callModel(SYSTEM, user, 2200, 0.5);
    const repaired: string[] = [];
    const data = scope === "clap" ? fixClap(r.data, f, 0, repaired) : scope === "sing" ? fixSing(r.data, f, 0, repaired) : fixBacking(r.data, f, 0, repaired);
    if (!data) throw new Error("The revised song did not pass the music check. Try wording the change differently.");
    return { ...r, data, repaired };
  }
  if (scope === "outline") {
    const cur = JSON.stringify(ctx?.current ?? {}).slice(0, 5000);
    const user = `${classBrief(f, codeRows)}

Current unit outline as JSON:
${cur}

The teacher asked: "${instruction}"
Return the full revised outline in the same JSON shape with exactly ${f.lessons} lessons: {"title","summary","bigIdea","priorKnowledge","vocabulary":[{"term","meaning"}],"lessons":[{"title","focus","codes":[],"li","sc":[],"formative","printables":[{"type","title","purpose"}]}]}
${PTYPE_HELP}`;
    const r = await callModel(SYSTEM, user, 2800);
    const d = r.data, allowed = new Set(codeRows.map((c) => c.code));
    const lessons = (Array.isArray(d.lessons) ? d.lessons : []).slice(0, f.lessons).map((x: any, i: number) => ({ title: S(x?.title, 90) || `Lesson ${i + 1}`, focus: S(x?.focus, 300), codes: A(x?.codes, 4, 20).filter((c) => allowed.has(c)), li: S(x?.li, 300), sc: A(x?.sc, 4, 220), formative: S(x?.formative, 300), printables: cleanPrintables(x?.printables) }));
    if (lessons.length < f.lessons) throw new Error("The revised outline came back with too few lessons. Try again.");
    fitWorksheets(lessons, f, ctx?.current?.plan || { clap: f.clap });
    if (allowed.size) lessons.forEach((l: any) => { if (!l.codes.length) l.codes = [codeRows[0].code]; });
    return { ...r, data: { plan: ctx?.current?.plan, title: S(d.title, 80), summary: S(d.summary, 600), bigIdea: S(d.bigIdea, 300), priorKnowledge: S(d.priorKnowledge, 300), vocabulary: (Array.isArray(d.vocabulary) ? d.vocabulary : []).slice(0, 10).map((v: any) => ({ term: S(v?.term, 40), meaning: S(v?.meaning, 200) })).filter((v: any) => v.term), lessons } };
  }
  throw new Error("Unknown change type.");
}

/* ---------- handler ---------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("METHOD", "Use POST.", 405);
  const url = env("SUPABASE_URL"), service = env("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth?.user) return fail("AUTH", "Please sign in again.", 401);
  const user = auth.user;

  let body: any;
  try { body = await req.json(); } catch { return fail("BODY", "Bad request."); }
  const task = S(body?.task, 20);
  if (task === "ping") return json({ ok: true, data: { ready: providers().length > 0, providers: providers().map((p) => p.name) } });
  if (!providers().length) return fail("NO_KEY", "The AI key has not been added yet. Add DEEPSEEK_API_KEY in Supabase under Edge Functions, Secrets.", 503);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ count: mine }, { count: all }] = await Promise.all([
    admin.from("generations").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since),
    admin.from("generations").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);
  const cap = user.is_anonymous ? LIMIT_GUEST : LIMIT_USER;
  if ((mine ?? 0) >= cap) return fail("LIMIT", user.is_anonymous ? "You have reached today's limit for guest use. Create a free account to keep going." : "You have reached today's limit. It resets within 24 hours.", 429);
  if ((all ?? 0) >= LIMIT_GLOBAL) return fail("BUSY", "Lessonbeat has reached its daily limit for the pilot. Please try again tomorrow.", 429);

  const f = cleanForm(body?.form);
  let codeRows: any[] = [];
  if (f.band !== "Senior") {
    const q = admin.from("curriculum_codes").select("code, description, band").eq("band", f.band).eq("framework", f.framework).order("sort");
    const { data } = await q;
    codeRows = data ?? [];
    if (f.codes.length) { const pick = codeRows.filter((c) => f.codes.includes(c.code)); if (pick.length) codeRows = pick; }
  }

  let out: any, ok = true, message = "";
  try {
    const ctx = body?.context || {};
    if (task === "prefill") out = await taskPrefill(body);
    else if (task === "outline") out = await taskOutline(f, codeRows);
    else if (task === "lesson") out = await taskLesson(f, codeRows, ctx);
    else if (task === "media") out = await taskMedia(f, codeRows, ctx);
    else if (task === "assessment") out = await taskAssessment(f, codeRows, ctx);
    else if (task === "worksheets") out = await taskWorksheets(f, codeRows, ctx);
    else if (task === "printables") out = await taskPrintables(f, ctx);
    else if (task === "help") out = await taskHelp(body);
    else if (task === "report") out = await taskReport(f, ctx);
    else if (task === "revise") out = await taskRevise(f, codeRows, ctx);
    else return fail("TASK", "Unknown task.");
  } catch (e) {
    ok = false; message = (e as Error).message || "Something went wrong.";
  }
  await admin.from("generations").insert({ user_id: user.id, task, provider: out?.provider ?? "", tokens_in: out?.tin ?? 0, tokens_out: out?.tout ?? 0, ok });
  if (!ok) {
    if (message.startsWith("AUTH")) return fail("AI_AUTH", "The AI provider rejected the key. Check DEEPSEEK_API_KEY in Supabase secrets.", 502);
    if (message.startsWith("CREDIT")) return fail("AI_CREDIT", "The AI account is out of credit. Top up at platform.deepseek.com.", 502);
    if (/timed out|\d{3}:|not valid JSON|MODEL_FAILED/.test(message)) return fail("AI_FAILED", "The AI did not respond properly. Please try again. (" + message.slice(0, 140) + ")", 502);
    return fail("FAILED", message, 422);
  }
  return json({ ok: true, data: out.data, meta: { provider: out.provider, repaired: out.repaired ?? [] } });
});
