// Options for the planning form. Ids here match what the server accepts.

export const STATES = [
  { id: "VIC", name: "Victoria", foundation: "Foundation (Prep)", authority: "VCAA", f10: "Victorian Curriculum F–10 Version 2.0", url: "https://f10.vcaa.vic.edu.au/", senior: "VCE",
    courses: ["VCE Music Units 1 and 2", "VCE Music Inquiry (Units 3 and 4)", "VCE Music Contemporary Performance (Units 3 and 4)", "VCE Music Repertoire Performance (Units 3 and 4)", "VCE Music Composition (Units 3 and 4)", "VCE VET Music"], seniorUrl: "https://www.vcaa.vic.edu.au/" },
  { id: "NSW", name: "New South Wales", foundation: "Kindergarten", authority: "NESA", f10: "NSW Creative Arts K–6 and Music 7–10 syllabuses", url: "https://curriculum.nsw.edu.au/", senior: "HSC",
    courses: ["Music 1 (Preliminary)", "Music 1 (HSC)", "Music 2 (Preliminary)", "Music 2 (HSC)", "Music Extension (HSC)"], seniorUrl: "https://curriculum.nsw.edu.au/" },
  { id: "QLD", name: "Queensland", foundation: "Prep", authority: "QCAA", f10: "Australian Curriculum v9.0 in Queensland", url: "https://www.qcaa.qld.edu.au/", senior: "QCE",
    courses: ["Music (General) Unit 1: Designs", "Music (General) Unit 2: Identities", "Music (General) Unit 3: Innovations", "Music (General) Unit 4: Narratives", "Music Extension", "Music in Practice (Applied)"], seniorUrl: "https://www.qcaa.qld.edu.au/" },
  { id: "WA", name: "Western Australia", foundation: "Pre-primary", authority: "SCSA", f10: "Western Australian Curriculum", url: "https://k10outline.scsa.wa.edu.au/", senior: "WACE",
    courses: ["Music ATAR Year 11", "Music ATAR Year 12", "Music General Year 11", "Music General Year 12"], seniorUrl: "https://senior-secondary.scsa.wa.edu.au/" },
  { id: "SA", name: "South Australia", foundation: "Reception", authority: "SACE Board", f10: "Australian Curriculum v9.0", url: "https://v9.australiancurriculum.edu.au/", senior: "SACE",
    courses: ["Stage 1 Music", "Stage 2 Music Explorations", "Stage 2 Music Studies", "Stage 2 Music Performance – Ensemble", "Stage 2 Music Performance – Solo"], seniorUrl: "https://www.sace.sa.edu.au/" },
  { id: "TAS", name: "Tasmania", foundation: "Prep", authority: "TASC", f10: "Australian Curriculum v9.0", url: "https://v9.australiancurriculum.edu.au/", senior: "TCE", courses: [], seniorUrl: "https://www.tasc.tas.gov.au/" },
  { id: "ACT", name: "Australian Capital Territory", foundation: "Kindergarten", authority: "BSSS", f10: "Australian Curriculum v9.0", url: "https://v9.australiancurriculum.edu.au/", senior: "ACT Senior Secondary Certificate", courses: [], seniorUrl: "https://www.bsss.act.edu.au/" },
  { id: "NT", name: "Northern Territory", foundation: "Transition", authority: "NT Board of Studies", f10: "Australian Curriculum v9.0", url: "https://v9.australiancurriculum.edu.au/", senior: "NTCET (SACE)",
    courses: ["Stage 1 Music", "Stage 2 Music Explorations", "Stage 2 Music Studies", "Stage 2 Music Performance – Ensemble", "Stage 2 Music Performance – Solo"], seniorUrl: "https://www.sace.sa.edu.au/" },
];
export const stateOf = (name) => STATES.find((s) => s.name === name) || STATES[0];
export const AC_URL = "https://v9.australiancurriculum.edu.au/";

export const MODELS = [
  { id: "gradual", name: "I Do, We Do, You Do", note: "Gradual release: model it, do it together, then students try alone." },
  { id: "explicit", name: "Explicit teaching", note: "Daily review, small steps, guided then independent practice." },
  { id: "hunter", name: "Madeline Hunter", note: "Seven-step direct instruction, from anticipatory set to closure." },
  { id: "kodaly", name: "Kodály sequence", note: "Prepare, present, practise through singing games." },
  { id: "orff", name: "Orff process", note: "Imitate, explore, improvise, create." },
  { id: "inquiry", name: "Student inquiry (5E)", note: "Engage, explore, explain, elaborate, evaluate." },
  { id: "fouras", name: "4 A's active learning", note: "Activity, analysis, abstraction, application." },
  { id: "choice", name: "Choice board", note: "A short mini-lesson, then students choose from a menu of tasks." },
];
export const FOCUS = ["Beat and rhythm", "Pitch and melody", "Singing", "Instruments", "Composing", "Listening and responding", "Notation and theory", "Aural skills", "Music technology", "Ensemble and performance", "Music history and styles"];
export const INSTRUMENTS = ["Body percussion", "Voices", "Untuned percussion", "Tuned percussion (xylophones, glockenspiels)", "Boomwhackers", "Bucket drums", "Ukuleles", "Recorders", "Keyboards", "Guitars", "Bass guitar", "Drum kit", "Band instruments", "iPads or laptops"];
export const AUDIENCE = [
  { id: "teacher", name: "Me", note: "Concise notes for the teacher who planned it." },
  { id: "crt", name: "A relief teacher (CRT)", note: "Step by step, nothing assumed, no music background needed." },
  { id: "students", name: "My students", note: "Written to students, in words they can read." },
];
export const ATYPES = ["Performance", "Composition", "Listening response", "Written task", "Portfolio"];
export const INCLUDES = [
  { id: "li", name: "Learning intentions" },
  { id: "sc", name: "Success criteria" },
  { id: "timings", name: "Timings for each part" },
  { id: "diff", name: "Support and extension" },
  { id: "vocab", name: "Key vocabulary" },
];
export const DOC_PURPOSES = ["Follow this scope and sequence", "Match this planning format", "Use our school's language", "Build on this unit"];

export const DEFAULT_FORM = () => ({
  state: "Victoria", year: "Year 3", lessons: 4, length: 50, topic: "", focus: [], instruments: ["Body percussion", "Voices"],
  model: "gradual", include: { li: true, sc: true, timings: true, diff: true, vocab: true }, audience: "teacher",
  codes: [], formative: 2, summative: 1, atype: ["Performance"], worksheets: 2, clap: 2, sing: 1, backing: 1,
  songs: "", avoid: "", notes: "", senior: { course: "", unit: "", outcomes: "" }, docIds: [],
});

export const EXAMPLES = [
  "Year 2, four 45-minute lessons on beat versus rhythm with body percussion and a new song to sing",
  "Year 5 ukulele unit, 6 lessons, C F and G chords, finishing with a class performance",
  "Year 8 twelve-bar blues, 8 lessons, keyboards and bass, students improvise over a backing track",
  "One 30-minute relief lesson for Foundation: high and low sounds, no instruments",
];
