# Lessonbeat

Music lesson planning for Australian classrooms. A teacher fills in a tick-box form (or types a request) and gets a
curriculum-aligned unit plus clap-alongs, sing-alongs and backing tracks made for those lessons.

**How it works:** the AI writes lesson text and music *data* (rhythms as beat values, melodies as solfa, chords as roman
numerals). Code checks the data, then draws the notation and makes the sound. The AI never produces audio.

- `index.html` – the built app, served by GitHub Pages at https://tashahud1705.github.io/lessonbeat/. The readable source modules are in the project zip (`js/`, `css/`); `build.py` bundles them into this one file.
- `supabase/schema.sql` – database tables, row level security and the Australian Curriculum v9 Music codes.
- `supabase/functions/generate/index.ts` – the Edge Function that calls the AI model and validates what comes back.

## Setup
1. Run `supabase/schema.sql` in the Supabase SQL editor.
2. Deploy `supabase/functions/generate` as an Edge Function named `generate`.
3. In Supabase → Edge Functions → Secrets add `DEEPSEEK_API_KEY`. Optional: `MOONSHOT_API_KEY` (Kimi fallback), or
   `AI_BASE_URL` + `AI_API_KEY` + `AI_MODEL` to use any OpenAI-compatible provider instead.
4. In Supabase → Authentication turn on anonymous sign-ins and turn off email confirmation.
5. Put the project URL and publishable key in `js/config.js` and rebuild.

Add `?mock` to the address to try the app with canned data and no server.

Curriculum codes are from the Australian Curriculum v9.0, © ACARA, CC BY 4.0. Not endorsed by ACARA.
