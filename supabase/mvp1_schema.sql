-- =====================================================================
-- PainFinder · MVP 1 (gehärtete Fassung) — konsolidiertes Schema
-- Optimiert auf: echte Geschäftschancen, Signalqualität, schnelle Validierung.
-- Weniger KI-Schätzungen, härteres Stage-4-Gate, Founder-Fit 2.0.
-- Komplett in den Supabase SQL Editor einfügen und ausführen.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- FOUNDER-PROFIL — jetzt 3 Dimensionen statt nur Keywords
-- ---------------------------------------------------------------------
create table if not exists founder_profile (
  id         int primary key default 1 check (id = 1),
  knowledge  text[] not null,   -- Wissensvorteil: Märkte/Domänen, die du verstehst
  reachable  text   not null,   -- Kundenzugang: wen du in 30 Tagen sprechen kannst
  can_build  text   not null    -- Umsetzbarkeit: was du realistisch als MVP baust
);
insert into founder_profile (id, knowledge, reachable, can_build) values
  (1,
   array['banking','finance','financing','contracts','contract process',
         'automation','ai agents','workflow','b2b','product management',
         'reconciliation','compliance','invoicing','procurement'],
   'Finanz-, Ops- und Procurement-Teams in Banken und im B2B-Mittelstand über mein Netzwerk',
   'Web-Apps und KI-Agenten-Workflows für strukturierte B2B-Prozesse')
on conflict (id) do update set
  knowledge = excluded.knowledge, reachable = excluded.reachable, can_build = excluded.can_build;

-- ---------------------------------------------------------------------
-- QUELLEN
-- ---------------------------------------------------------------------
create table if not exists problem_sources (
  id          uuid primary key default gen_random_uuid(),
  platform    text not null,
  handle      text,
  is_active   boolean not null default true,
  last_run_at timestamptz,
  created_at  timestamptz not null default now()
);
insert into problem_sources (platform, handle) values
  ('reddit','smallbusiness'), ('reddit','SaaS'),
  ('reddit','freelance'), ('reddit','Entrepreneur'),
  ('hackernews','i''d pay for'), ('hackernews','alternative to'),
  ('hackernews','too expensive'), ('hackernews','looking for a tool')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- ROHTEXTE — trust unterscheidet kuratierte CSV-Importe von Crawl-Funden
-- ---------------------------------------------------------------------
create table if not exists raw_mentions (
  id              uuid primary key default gen_random_uuid(),
  platform        text not null,
  external_id     text not null,
  source_label    text,
  author          text,
  title           text,
  body            text not null,
  url             text,
  matched_pattern text,
  trust           int not null default 1,   -- 1=crawl, 3=manueller CSV-Import (kuratiert)
  lang            text default 'en',
  posted_at       timestamptz,
  fetched_at      timestamptz not null default now(),
  processed       boolean not null default false,
  skipped         boolean not null default false,  -- vom Vorfilter aussortiert (kein KI-Call)
  unique (platform, external_id)
);
create index if not exists idx_mentions_processed on raw_mentions(processed);

-- ---------------------------------------------------------------------
-- OPPORTUNITIES — bewertete Einheit. cond_*-Flags treiben das Stage-4-Gate.
-- ---------------------------------------------------------------------
create table if not exists opportunities (
  id            uuid primary key default gen_random_uuid(),
  cluster_key   text not null unique,
  title         text not null,
  category      text,
  audience      text,
  b2b_context   boolean not null default false,  -- C: klarer B2B-Kontext
  named_provider text,                            -- B: bekannter bezahlter Anbieter
  -- Stage-4-Bedingungen (vom Prozessor gesetzt, OR über den Cluster)
  cond_spending boolean not null default false,   -- A: Zahlungs-Evidenz
  cond_provider boolean not null default false,   -- B: Anbieter+Preis bekannt
  cond_b2b      boolean not null default false,   -- C
  cond_loss     boolean not null default false,   -- D: Zeit-/Umsatzverlust
  mention_count  int not null default 0,
  source_count   int not null default 0,
  evidence_count int not null default 0,
  has_manual     boolean not null default false,  -- mind. eine kuratierte Quelle
  stage          int not null default 1 check (stage between 1 and 4),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists opportunity_mentions (
  opportunity_id uuid references opportunities(id) on delete cascade,
  mention_id     uuid references raw_mentions(id) on delete cascade,
  primary key (opportunity_id, mention_id)
);

-- ---------------------------------------------------------------------
-- VALIDATION_EVIDENCE — Herzstück, unverändert hart
-- ---------------------------------------------------------------------
create table if not exists validation_evidence (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete cascade,
  mention_id     uuid references raw_mentions(id) on delete set null,
  evidence_type  text not null check (evidence_type in (
                   'spending_disclosed','paid_alternative_named',
                   'alternative_hunting','switching_frustration',
                   'urgent_need','loss_disclosed','hiring_for_problem')),
  quote          text not null,
  amount_value   numeric,
  amount_currency text,
  amount_period  text,
  confidence     int not null default 5 check (confidence between 1 and 10),
  created_at     timestamptz not null default now()
);
create index if not exists idx_evidence_opp on validation_evidence(opportunity_id);

-- ---------------------------------------------------------------------
-- JOBS-TO-BE-DONE
-- ---------------------------------------------------------------------
create table if not exists jobs_to_be_done (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete cascade,
  job            text not null,
  workaround     text,
  workaround_pain text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- SCORES — RADIKAL VEREINFACHT.
-- 3 Evidenz-Signale + 3 Founder-Fit-Dimensionen. Keine Scheingenauigkeit mehr.
-- Entfernt ggü. v1: search_intent, competition_quality, automation_potential,
-- market_accessibility, separate frequency (jetzt aus mention_count abgeleitet),
-- alternative_hunting+switching zu incumbent_frustration verschmolzen.
-- ---------------------------------------------------------------------
create table if not exists opportunity_scores (
  opportunity_id uuid primary key references opportunities(id) on delete cascade,
  -- Evidenz-Signale (KI-gestützt, aber durch Evidence-Zeilen gedeckt)
  spending_evidence     int not null default 0 check (spending_evidence     between 0 and 10),
  incumbent_frustration int not null default 0 check (incumbent_frustration between 0 and 10),
  business_value        int not null default 0 check (business_value        between 0 and 10),
  -- Founder Fit 2.0 (3 Dimensionen)
  fit_knowledge         int not null default 0 check (fit_knowledge between 0 and 10),
  fit_access            int not null default 0 check (fit_access    between 0 and 10),
  fit_buildability      int not null default 0 check (fit_buildability between 0 and 10),
  monetization_idea     text,
  next_step             text,
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- VIEW — schlanker Score + verschärfte Aktion.
--   Evidenz-Block (0-50): spending*3 + frustration*1 + business_value*1
--   Founder-Block (0-30): knowledge + access + buildability
--   Korroboration (0-20): aus ECHTEN Clusterfakten, nicht aus KI-Schätzung
--   GATE: ohne Evidenz Deckel 25.
-- ---------------------------------------------------------------------
create or replace view dashboard_opportunities as
with calc as (
  select
    o.id, o.cluster_key, o.title, o.category, o.audience,
    o.b2b_context, o.named_provider, o.has_manual,
    o.cond_spending, o.cond_provider, o.cond_b2b, o.cond_loss,
    o.mention_count, o.source_count, o.evidence_count, o.stage,
    o.created_at, o.updated_at,
    s.spending_evidence, s.incumbent_frustration, s.business_value,
    s.fit_knowledge, s.fit_access, s.fit_buildability,
    s.monetization_idea, s.next_step,
    (s.spending_evidence*3 + s.incumbent_frustration*1 + s.business_value*1) as evidence_block,
    (s.fit_knowledge + s.fit_access + s.fit_buildability)                    as founder_block,
    (least(o.mention_count,5)*2 + least(o.source_count,2)*5)                 as corroboration,
    round((s.fit_knowledge + s.fit_access + s.fit_buildability)/3.0)         as founder_fit
  from opportunities o
  join opportunity_scores s on s.opportunity_id = o.id
)
select
  c.*,
  round(least(c.evidence_block + c.founder_block + c.corroboration,
              case when c.evidence_count = 0 then 25 else 100 end), 0) as opportunity_score,
  case
    when c.stage = 4 and c.founder_fit >= 6 then 'test_now'
    when c.stage = 4                        then 'validate'
    when c.stage = 3                        then 'research'
    when c.stage = 2                        then 'observe'
    else 'ignore'
  end as recommended_action
from calc c;

-- ---------------------------------------------------------------------
-- NOTIZEN
-- ---------------------------------------------------------------------
create table if not exists user_notes (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete cascade,
  note           text,
  priority       text check (priority in ('ignore','observe','research','validate','test_now')),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS — anon liest alles + schreibt Notizen. Schreiben sonst nur service_role.
-- ---------------------------------------------------------------------
alter table founder_profile      enable row level security;
alter table problem_sources      enable row level security;
alter table raw_mentions         enable row level security;
alter table opportunities        enable row level security;
alter table opportunity_mentions enable row level security;
alter table validation_evidence  enable row level security;
alter table jobs_to_be_done      enable row level security;
alter table opportunity_scores   enable row level security;
alter table user_notes           enable row level security;

create policy "r_founder"  on founder_profile      for select using (true);
create policy "r_sources"  on problem_sources      for select using (true);
create policy "r_mentions" on raw_mentions         for select using (true);
create policy "r_opps"     on opportunities        for select using (true);
create policy "r_oppment"  on opportunity_mentions for select using (true);
create policy "r_evid"     on validation_evidence  for select using (true);
create policy "r_jtbd"     on jobs_to_be_done      for select using (true);
create policy "r_scores"   on opportunity_scores   for select using (true);
create policy "r_notes"    on user_notes           for select using (true);
create policy "w_notes"    on user_notes           for insert with check (true);
create policy "u_notes"    on user_notes           for update using (true);
