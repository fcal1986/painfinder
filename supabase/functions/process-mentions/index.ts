// supabase/functions/process-mentions/index.ts
// Gehärtet: Secret-Pflicht, Vorfilter (Kostenkontrolle), verschärftes Stage-4-Gate,
// Founder-Fit 2.0 (3 Dimensionen), schlankeres Scoring.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, json, requireSecret } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-sonnet-4-20250514";
const BATCH = 8;
const PREFILTER_MIN = 3;   // unter diesem Heuristik-Score: KEIN KI-Call

// ---------------------------------------------------------------------
// VORFILTER — billig (Regex), entscheidet, ob ein KI-Call sich lohnt.
// Kuratierte Manual-Importe (trust>=3) umgehen den Filter immer.
// ---------------------------------------------------------------------
const KNOWN_TOOLS = /(salesforce|hubspot|lexoffice|sevdesk|sap|datev|jira|asana|notion|airtable|quickbooks|xero|zendesk|intercom|stripe|docusign)/i;
function prefilterScore(text: string): number {
  let s = 0;
  if (/(\$|€|eur|usd)\s?\d|\d+\s?(€|\$|eur|usd)|\/mo\b|per month|monthly|pro monat/i.test(text)) s += 2; // Preis
  if (/(we pay|currently pay|paying|subscription|per seat|license|wir zahlen|kostet uns)/i.test(text)) s += 2; // Spending
  if (/(alternative to|switch(ing)? from|migrat|replace|alternative zu|wechsel)/i.test(text)) s += 2; // Alt/Switch
  if (KNOWN_TOOLS.test(text)) s += 1; // Toolname
  if (/(too expensive|overpriced|hate|frustrat|broken|waste|clunky|zu teuer|nervt|umständlich)/i.test(text)) s += 1; // Frust
  if (/(team|company|business|employees?|department|workflow|clients?|customers?|b2b|enterprise|ops|finance|unternehmen|abteilung|mitarbeiter|prozess)/i.test(text)) s += 1; // B2B
  return s;
}

function systemPrompt(p: { knowledge: string[]; reachable: string; can_build: string }) {
  return `Du bist ein nuechterner VC-Analyst, der sein eigenes Geld investiert.
Aus einem Rohtext extrahierst du EINE potenzielle Geschaeftsmoeglichkeit — oder lehnst streng ab.
Blosses Jammern ohne Geld-/Bedarfs-/B2B-Signal => is_opportunity:false.
Antworte AUSSCHLIESSLICH mit gueltigem JSON, ohne Markdown.

FOUNDER-PROFIL fuer den 3-Dimensionen-Founder-Fit:
- Wissensvorteil (fit_knowledge): versteht der Founder den Markt? Felder: ${p.knowledge.join(", ")}.
- Kundenzugang (fit_access): kann er die Zielgruppe in 30 Tagen sprechen? Zugang: ${p.reachable}.
- Umsetzbarkeit (fit_buildability): kann er ein MVP bauen? Kann bauen: ${p.can_build}.
Jede Dimension 0-10.

named_provider: falls ein bezahltes Tool genannt wird (z.B. Salesforce, Lexoffice), sonst null.
b2b_context: true, wenn klar Unternehmen/Team/Abteilung/Prozess betroffen ist.

evidence: nur echte Belege. evidence_type:
spending_disclosed | paid_alternative_named | alternative_hunting | switching_frustration |
urgent_need | loss_disclosed | hiring_for_problem

cluster_key: kurzer stabiler englischer Themen-Slug (gleiche Themen => gleicher Slug).

Schema:
{
 "is_opportunity": true,
 "cluster_key": "slug",
 "title": "1 Zeile",
 "category": "Finance|SaaS|Productivity|...",
 "audience": "wer",
 "b2b_context": true,
 "named_provider": "Lexoffice" ,
 "jtbd": { "job": "...", "workaround": "... | null", "workaround_pain": "... | null" },
 "evidence": [ { "evidence_type": "spending_disclosed", "quote": "...", "amount_value": 500, "amount_currency": "EUR", "amount_period": "month", "confidence": 8 } ],
 "scores": { "spending_evidence": 0-10, "incumbent_frustration": 0-10, "business_value": 0-10, "fit_knowledge": 0-10, "fit_access": 0-10, "fit_buildability": 0-10 },
 "monetization_idea": "kurz",
 "next_step": "konkreter Validierungsschritt"
}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const denied = requireSecret(req); if (denied) return denied;

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: prof } = await db.from("founder_profile").select("*").eq("id", 1).single();
  const sys = systemPrompt({ knowledge: prof?.knowledge ?? [], reachable: prof?.reachable ?? "", can_build: prof?.can_build ?? "" });

  const { data: mentions, error } = await db.from("raw_mentions")
    .select("*").eq("processed", false).limit(BATCH);
  if (error) return json({ error: error.message }, 500);
  if (!mentions?.length) return json({ ok: true, processed: 0, msg: "nichts zu tun" });

  const touched = new Set<string>();
  let opportunities = 0, skipped = 0, sentToAI = 0;

  for (const m of mentions) {
    // Vorfilter: kuratierte Importe (trust>=3) immer durchlassen
    if ((m.trust ?? 1) < 3 && prefilterScore(`${m.title ?? ""} ${m.body}`) < PREFILTER_MIN) {
      await db.from("raw_mentions").update({ processed: true, skipped: true }).eq("id", m.id);
      skipped++; continue;
    }
    try {
      sentToAI++;
      const ai = await callClaude(sys, m.title ? `${m.title}\n${m.body}` : m.body);
      await db.from("raw_mentions").update({ processed: true }).eq("id", m.id);
      if (!ai?.is_opportunity || !ai?.cluster_key) continue;

      // Opportunity clustern
      let oppId: string | null = null;
      const { data: ex } = await db.from("opportunities").select("id").eq("cluster_key", ai.cluster_key).maybeSingle();
      if (ex) {
        oppId = ex.id;
        // B2B/Provider hochziehen (OR / coalesce)
        await db.from("opportunities").update({
          b2b_context: ai.b2b_context === true ? true : undefined,
          named_provider: ai.named_provider ?? undefined,
        }).eq("id", oppId);
      } else {
        const { data: cr, error: cErr } = await db.from("opportunities").insert({
          cluster_key: ai.cluster_key, title: ai.title, category: ai.category,
          audience: ai.audience, b2b_context: ai.b2b_context === true,
          named_provider: ai.named_provider ?? null,
        }).select("id").single();
        if (cErr || !cr) continue;
        oppId = cr.id; opportunities++;
      }
      if (!oppId) continue;

      await db.from("opportunity_mentions").upsert(
        { opportunity_id: oppId, mention_id: m.id },
        { onConflict: "opportunity_id,mention_id", ignoreDuplicates: true });

      for (const e of ai.evidence ?? []) {
        if (!e?.quote || !e?.evidence_type) continue;
        await db.from("validation_evidence").insert({
          opportunity_id: oppId, mention_id: m.id, evidence_type: e.evidence_type,
          quote: String(e.quote).slice(0, 600), amount_value: num(e.amount_value),
          amount_currency: e.amount_currency ?? null, amount_period: e.amount_period ?? null,
          confidence: clamp(e.confidence, 1, 10),
        });
      }

      const { count: jc } = await db.from("jobs_to_be_done")
        .select("*", { count: "exact", head: true }).eq("opportunity_id", oppId);
      if ((jc ?? 0) === 0 && ai.jtbd?.job) {
        await db.from("jobs_to_be_done").insert({
          opportunity_id: oppId, job: ai.jtbd.job,
          workaround: ai.jtbd.workaround ?? null, workaround_pain: ai.jtbd.workaround_pain ?? null });
      }

      await blendScores(db, oppId, ai.scores ?? {}, ai.monetization_idea, ai.next_step);
      touched.add(oppId);
    } catch {
      await db.from("raw_mentions").update({ processed: true }).eq("id", m.id);
    }
  }

  for (const oppId of touched) await recompute(db, oppId);
  return json({ ok: true, processed: mentions.length, sentToAI, skipped, newOpportunities: opportunities, updated: touched.size });
});

async function blendScores(db: any, oppId: string, s: any, mon?: string, next?: string) {
  const fields = ["spending_evidence","incumbent_frustration","business_value","fit_knowledge","fit_access","fit_buildability"];
  const { data: prev } = await db.from("opportunity_scores").select("*").eq("opportunity_id", oppId).maybeSingle();
  const row: any = { opportunity_id: oppId, updated_at: new Date().toISOString() };
  for (const f of fields) row[f] = Math.max(prev?.[f] ?? 0, clamp(s[f], 0, 10));
  row.monetization_idea = mon ?? prev?.monetization_idea ?? null;
  row.next_step = next ?? prev?.next_step ?? null;
  await db.from("opportunity_scores").upsert(row, { onConflict: "opportunity_id" });
}

async function recompute(db: any, oppId: string) {
  const { data: links } = await db.from("opportunity_mentions")
    .select("raw_mentions(platform,trust)").eq("opportunity_id", oppId);
  const mention_count = links?.length ?? 0;
  const platforms = new Set((links ?? []).map((l: any) => l.raw_mentions?.platform).filter(Boolean));
  const has_manual = (links ?? []).some((l: any) => (l.raw_mentions?.trust ?? 1) >= 3);
  const source_count = platforms.size;

  const { data: evRows } = await db.from("validation_evidence")
    .select("evidence_type, amount_value").eq("opportunity_id", oppId);
  const ev = evRows?.length ?? 0;
  const hasSpending = (evRows ?? []).some((e: any) => e.evidence_type === "spending_disclosed" || e.amount_value != null);
  const hasProvider = (evRows ?? []).some((e: any) => e.evidence_type === "paid_alternative_named");
  const hasLoss     = (evRows ?? []).some((e: any) => e.evidence_type === "loss_disclosed");

  const { data: opp } = await db.from("opportunities")
    .select("b2b_context, named_provider").eq("id", oppId).single();
  const { data: sc } = await db.from("opportunity_scores")
    .select("business_value").eq("opportunity_id", oppId).maybeSingle();

  const cond_spending = hasSpending;
  const cond_provider = hasProvider || !!opp?.named_provider;
  const cond_b2b      = opp?.b2b_context === true;
  const cond_loss     = hasLoss || (sc?.business_value ?? 0) >= 7;

  // VERSCHÄRFTES STAGE-4-GATE:
  // money-grade Bedingung (A | B | D) UND B2B-Kontext (C) UND Evidenz vorhanden.
  // Reines Beschwerdevolumen reicht NICHT mehr.
  // (Zum Lockern auf "mind. eine Bedingung": condStage4 = ev>=1 && (cond_spending||cond_provider||cond_b2b||cond_loss))
  const condMoney = cond_spending || cond_provider || cond_loss;
  let stage = 1;
  if (ev >= 1 && condMoney && cond_b2b) stage = 4;
  else if (ev >= 1) stage = 3;
  else if (mention_count >= 3 || source_count >= 2) stage = 2;

  await db.from("opportunities").update({
    mention_count, source_count, evidence_count: ev, has_manual,
    cond_spending, cond_provider, cond_b2b, cond_loss, stage,
    updated_at: new Date().toISOString(),
  }).eq("id", oppId);
}

async function callClaude(system: string, text: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 900, system,
      messages: [{ role: "user", content: `Rohtext:\n"""${text.slice(0, 3000)}"""` }] }),
  });
  const data = await res.json();
  const raw = data?.content?.find((c: any) => c.type === "text")?.text ?? "{}";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

const clamp = (n: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));
const num = (n: unknown) => { const v = Number(n); return Number.isFinite(v) ? v : null; };
