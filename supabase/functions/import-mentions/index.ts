// supabase/functions/import-mentions/index.ts — Secret-geschützt, trust=3 (kuratiert)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, json, requireSecret } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function hash(s: string) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const denied = requireSecret(req); if (denied) return denied;

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  let payload: any; try { payload = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const incoming = Array.isArray(payload?.rows) ? payload.rows : [];
  const label = payload?.source_label ?? "csv-import";
  if (!incoming.length) return json({ error: "no rows" }, 400);

  const rows: any[] = [];
  for (const r of incoming) {
    const body = String(r.body ?? r.text ?? r.review ?? "").trim();
    if (body.length < 10) continue;
    rows.push({ platform: "manual", external_id: await hash(body), source_label: r.source ?? label,
      author: r.author ?? null, title: r.title ?? null, body: body.slice(0, 4000), url: r.url ?? null,
      matched_pattern: "manual_import", trust: 3, lang: r.lang ?? "en", posted_at: r.posted_at ?? null });
  }
  if (!rows.length) return json({ error: "no valid rows (body fehlt?)" }, 400);

  const { error, count } = await db.from("raw_mentions")
    .upsert(rows, { onConflict: "platform,external_id", ignoreDuplicates: true, count: "exact" });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, received: incoming.length, inserted: count ?? rows.length });
});
