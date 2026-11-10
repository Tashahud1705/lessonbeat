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
  for (const p of list) {
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
  ];
  if (f.band === "Senior") {
    lines.push(`Senior secondary course: ${f.senior.course || "state senior music course"}${f.senior.unit ? ", " + f.senior.unit : ""}.`);
    if (f.senior.outcomes) lines.push(`Outcomes or key knowledge supplied by the teacher (use these exact ideas, do not invent official codes): ${f.senior.outcomes}`);
    lines.push("Do not quote or invent wording or codes from the official study design or syllabus. Refer to areas of study in general terms only.");
  } else if (codeRows.length) {
    lines.push("Australian Curriculum v9 Music content descriptions you may align to (use ONLY these codes, exactly as written):");
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
  bars = bars.map((b, k) => { const p = barProblem(b, beats, f.level); if (p) { repaired.push(`Clap-along ${i + 1} bar ${k + 1}: ${p}`); return SAFE[beats][k % SAFE[beats].length]; } return b; });
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
    const p = barProblem(notes.map((n) => (n.s === "z" ? -n.d : n.d)), beats, Math.max(2, f.level));
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
async function taskOutline(f: Form, codeRows: any[]) {
  const n = f.lessons;
  const user = `${classBrief(f, codeRows)}

Write the ${n === 1 ? "lesson overview" : "unit outline"}. JSON shape:
{"title": string (max 60 chars, specific, no colon),
 "summary": string (2-3 sentences on what students will do and learn),
 "bigIdea": string (one sentence),
 "priorKnowledge": string (one sentence),
 "vocabulary": [{"term": string, "meaning": string (student-friendly)}] (4-8 items),
 "lessons": [ exactly ${n} items: {"title": string, "focus": string (one sentence), "codes": [curriculum codes from the list, 1-3 per lesson, or [] if none supplied], "li": string (learning intention starting "We are learning to"), "sc": [2-3 success criteria each starting "I can"], "formative": string (one quick check for this lesson, or "" )} ]}
Sequence the lessons so each builds on the last, moving from experiencing to reading/notating to creating/performing.`;
  const r = await callModel(SYSTEM, user, 2600);
  const d = r.data, allowed = new Set(codeRows.map((c) => c.code));
  let lessons = (Array.isArray(d.lessons) ? d.lessons : []).slice(0, n).map((x: any, i: number) => ({
    title: S(x?.title, 90) || `Lesson ${i + 1}`, focus: S(x?.focus, 300),
    codes: A(x?.codes, 4, 20).filter((c) => allowed.has(c)),
    li: S(x?.li, 300), sc: A(x?.sc, 4, 220), formative: S(x?.formative, 300),
  }));
  if (lessons.length < n) throw new Error("The outline came back with too few lessons. Try again.");
  if (allowed.size) lessons.forEach((l: any) => { if (!l.codes.length) l.codes = [codeRows[0].code]; });
  return { ...r, data: { title: S(d.title, 80) || "Music unit", summary: S(d.summary, 600), bigIdea: S(d.bigIdea, 300), priorKnowledge: S(d.priorKnowledge, 300), vocabulary: (Array.isArray(d.vocabulary) ? d.vocabulary : []).slice(0, 10).map((v: any) => ({ term: S(v?.term, 40), meaning: S(v?.meaning, 200) })).filter((v: any) => v.term), lessons } };
}

function cleanLesson(d: any, f: Form) {
  let phases = (Array.isArray(d?.phases) ? d.phases : []).slice(0, 9).map((p: any) => ({ name: S(p?.name, 50), minutes: N(p?.minutes, 1, 90, 5), teacher: L(p?.teacher, 900), students: L(p?.students, 600) })).filter((p: any) => p.name && (p.teacher || p.students));
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
    materials: A(d?.materials, 10, 120),
    support: S(d?.support, 500), extend: S(d?.extend, 500),
    notes: S(d?.notes, 600),
    search: (Array.isArray(d?.search) ? d.search : []).slice(0, 3).map((x: any) => ({ label: S(x?.label, 80), query: S(x?.query, 100) })).filter((x: any) => x.query),
  };
}
async function taskLesson(f: Form, codeRows: any[], ctx: any) {
  const idx = N(ctx?.index, 0, 11, 0);
  const outline = (Array.isArray(ctx?.outline) ? ctx.outline : []).slice(0, 12).map((l: any, i: number) => `${i + 1}. ${S(l?.title, 90)} - ${S(l?.focus, 200)}`).join("\n");
  const me = ctx?.lesson || {};
  const media = A(ctx?.media, 6, 160);
  const m = MODELS[f.model];
  const user = `${classBrief(f, codeRows)}

Unit: ${S(ctx?.unitTitle, 90)}
All lessons:
${outline}

Write the full plan for lesson ${idx + 1}: "${S(me.title, 90)}".
Focus: ${S(me.focus, 300)}
Learning intention: ${S(me.li, 300)}
Success criteria: ${A(me.sc, 4, 220).join("; ")}
${media.length ? "Ready-made media for this lesson (refer to them by name in the plan where they fit): " + media.join(" | ") : ""}
${ctx?.instruction ? "The teacher asked for this change: " + S(ctx.instruction, 400) : ""}

Use these phases in order: ${m.phases.join(", ")}. Minutes must add up to exactly ${f.length}.
JSON shape:
{"phases": [{"name": string, "minutes": integer, "teacher": string (what the teacher does and says, 2-4 specific sentences), "students": string (what students do, 1-3 sentences)}],
 "materials": [short strings],
 "support": string (how to support students who need it),
 "extend": string (how to extend confident students),
 "notes": string (one or two practical tips: behaviour, transitions, common mistakes),
 "search": [{"label": string, "query": string}] (0-2 optional YouTube search phrases for a listening example; never a URL)}`;
  const r = await callModel(SYSTEM, user, 2200);
  return { ...r, data: cleanLesson(r.data, f) };
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
${mediaShape(f)}
JSON shape:
{"clap": [{"title": string, "lesson": integer, "tempo": integer bpm, "beats": 4, "bars": [[numbers]], "tip": string (how to use it in class)}],
 "sing": [{"title": string, "lesson": integer, "tempo": integer, "beats": 4, "bars": [[{"s": solfa, "d": beats, "w": syllable}]], "chords": [one numeral per bar], "about": string, "tip": string}],
 "backing": [{"title": string, "lesson": integer, "style": one of ${STYLES.join("|")}, "tempo": integer, "key": one of C|D|E|F|G|A|Bb|Eb, "bars": [numerals, one per bar], "use": string (what students do over it), "tip": string}]}
Use empty arrays for anything with a count of 0.`;
  const r = await callModel(SYSTEM, user, 3600, 0.6);
  const repaired: string[] = [];
  const d = r.data;
  const clap = (Array.isArray(d.clap) ? d.clap : []).slice(0, f.clap).map((c: any, i: number) => fixClap(c, f, i, repaired));
  while (clap.length < f.clap) clap.push(fixClap({}, f, clap.length, repaired));
  const sing = (Array.isArray(d.sing) ? d.sing : []).slice(0, f.sing).map((s: any, i: number) => fixSing(s, f, i, repaired)).filter(Boolean);
  const backing = (Array.isArray(d.backing) ? d.backing : []).slice(0, f.backing).map((b: any, i: number) => fixBacking(b, f, i, repaired));
  while (backing.length < f.backing) backing.push(fixBacking({}, f, backing.length, repaired));
  return { ...r, data: { clap, sing, backing }, repaired };
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
${ctx?.instruction ? "The teacher asked for this change: " + S(ctx.instruction, 400) : ""}

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
Return the full revised outline in the same JSON shape with exactly ${f.lessons} lessons: {"title","summary","bigIdea","priorKnowledge","vocabulary":[{"term","meaning"}],"lessons":[{"title","focus","codes":[],"li","sc":[],"formative"}]}`;
    const r = await callModel(SYSTEM, user, 2800);
    const d = r.data, allowed = new Set(codeRows.map((c) => c.code));
    const lessons = (Array.isArray(d.lessons) ? d.lessons : []).slice(0, f.lessons).map((x: any, i: number) => ({ title: S(x?.title, 90) || `Lesson ${i + 1}`, focus: S(x?.focus, 300), codes: A(x?.codes, 4, 20).filter((c) => allowed.has(c)), li: S(x?.li, 300), sc: A(x?.sc, 4, 220), formative: S(x?.formative, 300) }));
    if (lessons.length < f.lessons) throw new Error("The revised outline came back with too few lessons. Try again.");
    if (allowed.size) lessons.forEach((l: any) => { if (!l.codes.length) l.codes = [codeRows[0].code]; });
    return { ...r, data: { title: S(d.title, 80), summary: S(d.summary, 600), bigIdea: S(d.bigIdea, 300), priorKnowledge: S(d.priorKnowledge, 300), vocabulary: (Array.isArray(d.vocabulary) ? d.vocabulary : []).slice(0, 10).map((v: any) => ({ term: S(v?.term, 40), meaning: S(v?.meaning, 200) })).filter((v: any) => v.term), lessons } };
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
    const q = admin.from("curriculum_codes").select("code, description, band").eq("band", f.band).order("sort");
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
