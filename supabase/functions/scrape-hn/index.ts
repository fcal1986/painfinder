// supabase/functions/scrape-hn/index.ts — Secret-geschützt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, json, requireSecret } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const QUERIES = ["i'd pay for","we currently pay","alternative to","too expensive",
  "looking for a tool","anyone know a tool","switching from","wish there was a tool"];
const PATTERNS: RegExp[] = [/i('| woul)?d pay/i,/we (currently )?pay/i,/alternative to/i,
  /too expensive/i,/looking for a tool/i,/wish there was/i,/anyone know a tool/i,
  /waste(s)? (hours|time|money)/i,/switching (away )?from/i,/cancel(led|ing)? .* because/i];
function match(t: string){for(const re of PATTERNS)if(re.test(t))return re.source;return null;}
function stripHtml(s: string){return (s||"").replace(/<[^>]+>/g," ").replace(/&#x2F;/g,"/")
  .replace(/&gt;/g,">").replace(/&lt;/g,"<").replace(/&quot;/g,'"').replace(/&#x27;/g,"'")
  .replace(/&amp;/g,"&").replace(/\s+/g," ").trim();}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const denied = requireSecret(req); if (denied) return denied;

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  let inserted = 0; const per: Record<string, number> = {};
  for (const q of QUERIES) {
    try {
      const res = await fetch(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=comment&hitsPerPage=25`);
      if (!res.ok) { per[q] = -1; continue; }
      const data = await res.json();
      const rows: any[] = [];
      for (const h of data.hits ?? []) {
        const body = stripHtml(h.comment_text || ""); if (body.length < 40) continue;
        const hit = match(body); if (!hit) continue;
        rows.push({ platform: "hackernews", external_id: String(h.objectID), source_label: q,
          author: h.author, title: h.story_title ?? null, body: body.slice(0, 4000), trust: 1,
          url: `https://news.ycombinator.com/item?id=${h.objectID}`, matched_pattern: hit,
          lang: "en", posted_at: h.created_at ?? null });
      }
      if (rows.length) {
        const { error, count } = await db.from("raw_mentions")
          .upsert(rows, { onConflict: "platform,external_id", ignoreDuplicates: true, count: "exact" });
        if (!error) inserted += count ?? rows.length;
      }
      per[q] = rows.length;
    } catch { per[q] = -1; }
    await new Promise((r) => setTimeout(r, 600));
  }
  await db.from("problem_sources").update({ last_run_at: new Date().toISOString() }).eq("platform", "hackernews");
  return json({ ok: true, inserted, perQuery: per });
});
