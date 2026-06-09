// frontend/config.js
// Diese beiden Werte sind OEFFENTLICH (anon key) — sie duerfen ins Frontend.
// Schreibrechte werden durch RLS in Supabase begrenzt. Niemals den
// service_role key hier eintragen!
window.PAINFINDER_CONFIG = {
  SUPABASE_URL: "https://DEIN-PROJEKT.supabase.co",
  SUPABASE_ANON_KEY: "DEIN_ANON_KEY",
};
