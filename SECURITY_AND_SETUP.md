# PainFinder · MVP 1 — Sicherheit & Setup (gehärtete Fassung)

## Sicherheitsmodell (warum so)
Die kostenverursachenden Functions (scrape-reddit, scrape-hn, import-mentions,
process-mentions) verlangen jetzt den Header **`x-painfinder-secret`**. Ohne
gültiges Secret: **401**. Das Secret liegt NUR als Supabase-Secret, **nie** im
öffentlichen Frontend-Repo.

Warum kein Secret in `config.js`: GitHub Pages ist öffentlich — alles dort ist
einsehbar. Ein dort hinterlegtes „Secret" wäre keins. Deshalb:
- **Frontend ist standardmäßig read-only** (liest die View, schreibt Notizen via RLS).
- **Auslöse-Buttons + CSV-Import** fragen das Secret zur Laufzeit ab und legen es
  nur in `sessionStorage` ab (weg beim Tab-Schließen, nie im Repo).
- **Routinebetrieb läuft serverseitig per Cron** (`supabase/cron.sql`) — da bleibt
  das Secret in der DB. Du brauchst das Frontend dann nur zum Ansehen/CSV-Import.

**Warum nicht Supabase Auth (Option B):** Auth bringt Login-UX, User-Verwaltung
und mehr Code für ein Single-User-Tool. Kein Mehrwert fürs MVP. Shared Secret ist
für „nur ich nutze es" die einfachste belastbare Lösung. Auth lohnt erst, wenn
mehrere Leute mit eigenen Rechten zugreifen.

## Setup
1. **DB:** SQL Editor → `supabase/mvp1_schema.sql` ausführen. Founder-Profil
   (`founder_profile`) an dich anpassen: `knowledge`, `reachable`, `can_build`.
2. **Secrets:**
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase secrets set PAINFINDER_SECRET=$(openssl rand -hex 16)   # merken!
   ```
3. **Functions deployen** (das _shared-Modul wird automatisch mitgebündelt):
   ```bash
   supabase functions deploy scrape-reddit
   supabase functions deploy scrape-hn
   supabase functions deploy import-mentions
   supabase functions deploy process-mentions
   ```
4. **Frontend:** `config.js` mit Project-URL + anon-Key (KEIN Secret!). Push → Pages.
5. **Automatik (empfohlen):** pg_cron + pg_net aktivieren, `supabase/cron.sql`
   mit URL + Secret ausführen.

## Bedienung
- Buttons im Dashboard fragen beim ersten Klick nach dem Secret (einmal pro Sitzung).
- **CSV ist die Kernquelle** (s. CSV_FIRST.md): kuratierte Reviews (trust=3)
  umgehen den Vorfilter und gehen immer an die KI.
