// config.js — diese Werte sind OEFFENTLICH (anon key) und duerfen ins Frontend.
// Findest du in Supabase -> Project Settings -> API ("Project URL", "anon public").
window.PAINFINDER_CONFIG = {
  SUPABASE_URL: "https://rqupvcrmugfrmutcirlu.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdXB2Y3JtdWdmcm11dGNpcmx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMDEzNTksImV4cCI6MjA5NTg3NzM1OX0.ajmnedUdrt-xp9vp3g-04CCkMYnNYgaz5foUIAkN0T4",

  // Zugangs-Code (PAINFINDER_SECRET): hier eintragen -> die App fragt NICHT mehr danach.
  // Es ist derselbe Code, den du bisher in das Popup getippt hast.
  // Hinweis: steht damit oeffentlich im Frontend. Den Code ganz loswerden
  // koennen wir ueber Login-basierte Absicherung (JWT) – sag Bescheid.
  PAINFINDER_SECRET: "6ce9b5502b2e4fe5888fce79cd5de0b9"
};
