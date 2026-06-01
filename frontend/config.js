// frontend/config.js
// Diese beiden Werte sind OEFFENTLICH (anon key) — sie duerfen ins Frontend.
// Schreibrechte werden durch RLS in Supabase begrenzt. Niemals den
// service_role key hier eintragen!
window.PAINFINDER_CONFIG = {
  SUPABASE_URL: "https://rqupvcrmugfrmutcirlu.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdXB2Y3JtdWdmcm11dGNpcmx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMDEzNTksImV4cCI6MjA5NTg3NzM1OX0.ajmnedUdrt-xp9vp3g-04CCkMYnNYgaz5foUIAkN0T4",
};
