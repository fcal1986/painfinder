// supabase/functions/scrape-reddit/index.ts — Secret-geschützt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, json, requireSecret } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UA = "painfinder/0.2 (research mvp)";

const PATTERNS: RegExp[] = [
  /i hate/i, /so frustrating/i, /is there no better/i, /i('| woul)?d pay/i,
  /alternative to/i, /why is it so hard/i, /i need(?: a)? tool/i,
  /anyone know a tool/i, /losing money/i, /waste of time/i, /desperately need/i,
  /we (currently )?pay/i, /too expensive/i, /switching (away )?from/i,
  /ich zahle gerne/i, /alternative zu/i, /ich brauche dringend/i, /kennt jemand ein tool/i,
];
function match(t: string) { for (const re of PATTERNS) if (re.test(t)) return re.source; return null; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const denied = requireSecret(req); if (denied) return denied;

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: sources, error } = await db.from("problem_sources")
    .select("*").eq("platform", "reddit").eq("is_active", true);
  if (error) return json({ error: error.message }, 500);

  let inserted = 0; const per: Record<string, number> = {};
  for (const src of sources ?? []) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${src.handle}/new.json?limit=50`, { headers: { "User-Agent": UA } });
      if (!res.ok) { per[src.handle] = -1; continue; }
      const data = await res.json();
      const rows: any[] = [];
      for (const p of data?.data?.children ?? []) {
        const d = p.data; const text = `${d.title ?? ""}\n${d.selftext ?? ""}`.trim();
        const hit = match(text); if (!hit) continue;
        rows.push({ platform: "reddit", external_id: d.id, source_label: src.handle,
          author: d.author, title: d.title, body: text.slice(0, 4000), trust: 1,
          url: `https://www.reddit.com${d.permalink}`, matched_pattern: hit, lang: "en",
          posted_at: new Date(d.created_utc * 1000).toISOString() });
      }
      if (rows.length) {
        const { error: e, count } = await db.from("raw_mentions")
          .upsert(rows, { onConflict: "platform,external_id", ignoreDuplicates: true, count: "exact" });
        if (!e) inserted += count ?? rows.length;
      }
      per[src.handle] = rows.length;
      await db.from("problem_sources").update({ last_run_at: new Date().toISOString() }).eq("id", src.id);
    } catch { per[src.handle] = -1; }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return json({ ok: true, inserted, perSubreddit: per });
});
