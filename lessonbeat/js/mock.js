// Demo mode (add ?mock to the address). Returns canned data in the same shapes as the server so the app can be tried offline.
export const CODES = [
  { code: "AC9AMU4E01", band: "Years 3-4", strand: "Exploring and responding", description: "explore where, why and how music is composed and/or performed across cultures, times, places and/or other contexts", verbatim: true },
  { code: "AC9AMU4D01", band: "Years 3-4", strand: "Developing practices and skills", description: "develop listening skills and skills for manipulating elements of music when singing and playing instruments", verbatim: true },
  { code: "AC9AMU4C01", band: "Years 3-4", strand: "Creating and making", description: "manipulate elements of music to communicate ideas, perspectives and/or meaning when composing and practising for performance", verbatim: true },
  { code: "AC9AMU4P01", band: "Years 3-4", strand: "Presenting and performing", description: "sing and play music they have learnt and/or composed in informal settings", verbatim: true },
  { code: "AC9AMU8D01", band: "Years 7-8", strand: "Developing practices and skills", description: "Develop listening and aural skills and vocal or instrumental techniques for shaping the elements of music to achieve expressive effects", verbatim: false },
];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const store = { units: [], docs: [] };
let n = 1;
export const db = {
  list: () => store.units.map((u) => ({ id: u.id, title: u.title, form: u.form, is_shared: u.is_shared, updated_at: u.updated_at })),
  get: (id) => { const u = store.units.find((x) => x.id === id); if (!u) throw new Error("That unit could not be found."); return JSON.parse(JSON.stringify(u)); },
  create: (title, form, content) => { const u = { id: "u" + n++, user_id: "mock", title, form, content, is_shared: false, updated_at: new Date().toISOString() }; store.units.unshift(u); return JSON.parse(JSON.stringify(u)); },
  update: (id, patch) => { const u = store.units.find((x) => x.id === id); Object.assign(u, JSON.parse(JSON.stringify(patch)), { updated_at: new Date().toISOString() }); },
  remove: (id) => { store.units = store.units.filter((x) => x.id !== id); },
  docs: () => store.docs.map(({ content, ...d }) => d),
  docTexts: (ids) => store.docs.filter((d) => ids.includes(d.id)).map((d) => ({ name: d.name, purpose: d.purpose, text: d.content })),
  addDoc: (name, text, purpose) => { const d = { id: "d" + n++, name, purpose, chars: text.length, content: text, created_at: new Date().toISOString() }; store.docs.unshift(d); return d; },
  delDoc: (id) => { store.docs = store.docs.filter((d) => d.id !== id); },
};

export async function generate(task, form, ctx) {
  await wait(task === "outline" ? 700 : 500 + Math.random() * 600);
  const L = form.lessons || 4;
  if (task === "ping") return { ok: true, data: { ready: true } };
  if (task === "prefill") return { ok: true, data: { year: "Year 3", lessons: 4, length: 45, topic: "Beat versus rhythm with body percussion", focus: ["Beat and rhythm", "Singing"], clap: 2, sing: 1, backing: 1 }, meta: {} };
  if (task === "outline" || (task === "revise" && ctx.scope === "outline")) return { ok: true, meta: { provider: "mock", repaired: [] }, data: {
    title: "Feel the Beat, Find the Rhythm", summary: "Students move from keeping a steady beat to reading and performing four-bar rhythms with crotchets, quavers and rests, then compose their own.", bigIdea: "The beat stays steady while the rhythm changes on top of it.", priorKnowledge: "Students can keep a steady beat with a recording.",
    vocabulary: [{ term: "beat", meaning: "the steady pulse you can tap your foot to" }, { term: "rhythm", meaning: "the pattern of long and short sounds" }, { term: "crotchet", meaning: "a one-beat note, we say ta" }, { term: "quavers", meaning: "two sounds on one beat, we say ti-ti" }],
    lessons: Array.from({ length: L }, (_, i) => ({ title: ["Find the beat", "Rhythm rides on the beat", "Reading ta and ti-ti", "Compose and perform"][i % 4] + (i > 3 ? " " + (i + 1) : ""), focus: "Students keep a steady beat and compare it with the rhythm of the words.", codes: ["AC9AMU4D01"], li: "We are learning to keep a steady beat while we clap a rhythm.", sc: ["I can tap the beat on my knees.", "I can clap the rhythm of the words."], formative: "Thumbs check: beat or rhythm?" })),
  } };
  if (task === "lesson" || (task === "revise" && ctx.scope === "lesson")) return { ok: true, meta: { provider: "mock" }, data: {
    phases: [{ name: "Warm-up", minutes: 5, teacher: "Play the backing track and lead a copy-me beat game on knees, shoulders and head.", students: "Copy the teacher's movements in time." }, { name: "I do", minutes: 10, teacher: "Show the clap-along. Clap the first two bars while pointing to each note. Say ta and ti-ti aloud.", students: "Watch, listen and whisper the time names." }, { name: "We do", minutes: 15, teacher: "Clap the pattern together at 70 beats per minute, then 84. Split the class: half tap the beat, half clap the rhythm.", students: "Clap with the class, then swap parts." }, { name: "You do", minutes: (form.length || 50) - 35, teacher: "Hand out the worksheet. Circulate and listen to pairs.", students: "In pairs, clap bars 1 to 4 to each other and complete the worksheet." }, { name: "Reflect", minutes: 5, teacher: "Ask: what stayed the same, the beat or the rhythm?", students: "Answer with a partner, then share." }],
    materials: ["Screen and speakers", "Worksheet 1"], support: "Stay on bars 1 and 2 only and keep the tempo at 70.", extend: "Turn off the time names and read from notation alone.", notes: "Seat students so everyone can see the screen. Count in aloud every time.", search: [{ label: "A steady beat example", query: "steady beat songs for kids" }],
  } };
  if (task === "media") return { ok: true, meta: { provider: "mock", repaired: [] }, data: {
    clap: [{ title: "Ta and ti-ti", lesson: 2, tempo: 84, beats: 4, bars: [[1, 1, 0.5, 0.5, 1], [0.5, 0.5, 1, 1, -1], [1, 0.5, 0.5, 0.5, 0.5, 1], [1, 1, 2]], tip: "Start at 70 and speed up once everyone is together." }, { title: "Semiquaver challenge", lesson: 3, tempo: 76, beats: 4, bars: [[0.25, 0.25, 0.25, 0.25, 1, 0.5, 0.5, 1], [1, 0.5, 0.25, 0.25, 1, -1], [1.5, 0.5, 1, 1], [0.5, 0.5, 0.25, 0.25, 0.5, 2]], tip: "Say ti-ka ti-ka slowly first." }].slice(0, form.clap),
    sing: [{ title: "Feel the Beat", lesson: 1, tempo: 92, beats: 4, bars: [[{ s: "s", d: 1, w: "Feel" }, { s: "m", d: 1, w: "the" }, { s: "s", d: 1, w: "stea-" }, { s: "m", d: 1, w: "dy" }], [{ s: "l", d: 1, w: "beat" }, { s: "s", d: 1, w: "in" }, { s: "m", d: 2, w: "time" }], [{ s: "s", d: 0.5, w: "Clap" }, { s: "s", d: 0.5, w: "it" }, { s: "m", d: 1, w: "on" }, { s: "r", d: 1, w: "your" }, { s: "d", d: 1, w: "knees" }], [{ s: "r", d: 1, w: "one" }, { s: "m", d: 1, w: "two" }, { s: "d", d: 2, w: "three" }], [{ s: "s", d: 1, w: "Rhy-" }, { s: "m", d: 1, w: "thm" }, { s: "s", d: 1, w: "dan-" }, { s: "m", d: 1, w: "ces" }], [{ s: "l", d: 1, w: "on" }, { s: "s", d: 1, w: "the" }, { s: "m", d: 2, w: "top" }], [{ s: "s", d: 0.5, w: "Long" }, { s: "s", d: 0.5, w: "and" }, { s: "m", d: 1, w: "short" }, { s: "r", d: 1, w: "sounds" }, { s: "z", d: 1, w: "" }], [{ s: "r", d: 1, w: "ne-" }, { s: "m", d: 1, w: "ver" }, { s: "d", d: 2, w: "stop" }]], chords: ["I", "I", "I", "V", "I", "I", "IV", "I"], about: "A pentatonic song about beat and rhythm.", tip: "Sing it once with the guide voice, then turn the voice off." }].slice(0, form.sing),
    backing: [{ title: "Steady groove", lesson: 1, style: "pop", tempo: 96, key: "C", bars: ["I", "V", "vi", "IV"], use: "Keep the beat on body percussion, then improvise four-beat rhythms.", tip: "Mute the drums to check who is keeping time." }].slice(0, form.backing),
  } };
  if (task === "assessment" || (task === "revise" && ctx.scope === "assessment")) return { ok: true, meta: {}, data: {
    formative: [{ title: "Beat or rhythm?", lesson: 1, how: "Play four short examples. Students show one finger for beat, two for rhythm.", lookFor: "Most students identify all four correctly." }, { title: "Echo clap", lesson: 2, how: "Clap bar 1 of the clap-along; students echo in pairs.", lookFor: "Accurate ti-ti without rushing." }].slice(0, form.formative),
    summative: [{ title: "My four-bar rhythm", type: "Performance", task: "Students compose a four-bar rhythm using ta, ti-ti and one rest, notate it and perform it over the backing track.", student: "Write your own four-bar rhythm. Practise it with a partner, then perform it with the backing track.", criteria: [{ name: "Steady beat", levels: ["Loses the beat often", "Keeps the beat with teacher support", "Keeps a steady beat throughout", "Keeps the beat and helps others stay in time"] }, { name: "Notation", levels: ["Bars do not add up", "Some bars add up to four", "All bars add up to four beats", "Uses a rest and quavers accurately in every bar"] }, { name: "Performance", levels: ["Stops and restarts", "Performs with some hesitations", "Performs accurately", "Performs accurately with expression"] }] }].slice(0, form.summative),
  } };
  if (task === "worksheets" || (task === "revise" && ctx.scope === "worksheets")) return { ok: true, meta: {}, data: { worksheets: [
    { title: "Reading ta and ti-ti", lesson: 2, intro: "Say it, clap it, then write your own.", tasks: [{ kind: "read", prompt: "Say and clap this rhythm.", clap: 1, bars: 0, items: [] }, { kind: "complete", prompt: "One beat is missing in each bar. Draw a note so each bar adds up to 4.", clap: 1, bars: 0, items: [] }, { kind: "compose", prompt: "Write your own two-bar rhythm.", clap: 0, bars: 2, items: [] }] },
    { title: "Beat and rhythm words", lesson: 1, intro: "Show what you know.", tasks: [{ kind: "match", prompt: "Draw a line from each word to its meaning.", clap: 0, bars: 0, items: [["beat", "the steady pulse"], ["rhythm", "the pattern of long and short sounds"], ["rest", "a beat of silence"]] }, { kind: "questions", prompt: "Answer in a sentence.", clap: 0, bars: 0, items: ["What stays the same in a song, the beat or the rhythm?", "How many sounds are in ti-ti?"] }] },
  ].slice(0, form.worksheets) } };
  if (task === "revise") {
    const cur = JSON.parse(JSON.stringify(ctx.current || {}));
    if (ctx.scope === "clap") { cur.tempo = Math.max(50, (cur.tempo || 84) - 10); cur.bars = cur.bars.map((b) => b.map((d) => (d === 0.25 ? 0.25 : d))); cur.title = (cur.title || "Clap-along") + " (revised)"; }
    else cur.title = (cur.title || "Item") + " (revised)";
    return { ok: true, data: cur, meta: { repaired: [] } };
  }
  throw new Error("Unknown task");
}
