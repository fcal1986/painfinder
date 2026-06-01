-- =====================================================================
-- Automatischer Betrieb OHNE Frontend — Secret bleibt serverseitig.
-- Voraussetzung: Extensions pg_cron + pg_net im Supabase-Dashboard aktivieren
-- (Database -> Extensions). DEIN.supabase.co und DEIN_SECRET ersetzen.
-- =====================================================================

-- Reddit + HN 1x pro Stunde sammeln
select cron.schedule('pf-scrape-hourly', '0 * * * *', $$
  select net.http_post(
    url := 'https://DEIN.supabase.co/functions/v1/scrape-reddit',
    headers := '{"Content-Type":"application/json","x-painfinder-secret":"DEIN_SECRET"}'::jsonb
  );
  select net.http_post(
    url := 'https://DEIN.supabase.co/functions/v1/scrape-hn',
    headers := '{"Content-Type":"application/json","x-painfinder-secret":"DEIN_SECRET"}'::jsonb
  );
$$);

-- Verarbeiten alle 15 Min (BATCH=8 pro Lauf, Vorfilter spart KI-Calls)
select cron.schedule('pf-process-q15', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://DEIN.supabase.co/functions/v1/process-mentions',
    headers := '{"Content-Type":"application/json","x-painfinder-secret":"DEIN_SECRET"}'::jsonb
  );
$$);

-- Zum Stoppen:  select cron.unschedule('pf-scrape-hourly');
