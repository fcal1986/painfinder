// supabase/functions/_shared/auth.ts
// Einfaches Sicherheitsmodell (Option A): Shared-Secret-Header.
// Jede kostenverursachende Function ruft requireSecret() als ersten Schritt.
// Das Secret liegt NUR als Supabase-Secret (PAINFINDER_SECRET), nie im Frontend-Repo.

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-painfinder-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Gibt eine 401-Response zurueck, wenn das Secret fehlt/falsch ist; sonst null.
export function requireSecret(req: Request): Response | null {
  const expected = Deno.env.get("PAINFINDER_SECRET");
  const got = req.headers.get("x-painfinder-secret");
  if (!expected || got !== expected) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}
