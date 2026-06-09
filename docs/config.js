// config.js — diese Werte sind OEFFENTLICH (anon key) und duerfen ins Frontend.
// Findest du in Supabase -> Project Settings -> API ("Project URL", "anon public").
window.PAINFINDER_CONFIG = {
  SUPABASE_URL: "https://rqupvcrmugfrmutcirlu.supabase.co",
  SUPABASE_ANON_KEY: "HIER_DEINEN_ANON_PUBLIC_KEY_EINFUEGEN",

  // Zugangs-Code (PAINFINDER_SECRET): hier eintragen -> die App fragt NICHT mehr danach.
  // Es ist derselbe Code, den du bisher in das Popup getippt hast.
  // Hinweis: steht damit oeffentlich im Frontend. Den Code ganz loswerden
  // koennen wir ueber Login-basierte Absicherung (JWT) – sag Bescheid.
  PAINFINDER_SECRET: "HIER_DEINEN_ZUGANGS_CODE_EINFUEGEN"
};
