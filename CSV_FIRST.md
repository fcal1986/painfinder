# CSV-First-Strategie

Manuell kuratierte Reviews liefern stärkere Kaufsignale als Reddit. Deshalb ist
der CSV-Import die **primäre** Quelle, nicht eine Beigabe.

## Wie CSV-Daten priorisiert werden
- Import setzt `trust = 3` (kuratiert). Crawl-Funde (Reddit/HN) haben `trust = 1`.
- **trust=3 umgeht den Vorfilter** → jede importierte Review geht an die KI
  (du hast sie ja bewusst ausgewählt; kein KI-Call wird verschwendet).
- In der Korroboration zählt eine manuelle Quelle als eigene Plattform und der
  `has_manual`-Marker zeigt im Datensatz, dass echtes kuratiertes Signal dahinter steht.

## Workflow: 100 Reviews einer Nische → Opportunities
1. **Eine Nische** wählen, die du verstehst (z. B. Vertrags-/Rechnungssoftware).
2. Auf G2 / Capterra / Trustpilot die **negativen** Reviews der 2–3 Marktführer
   sammeln (genau dort steht „zu teuer", „wir wechseln", „fehlt Feature X").
3. In eine CSV mit Spalte **`body`** (Pflicht) + optional `title,url,author,source,posted_at`.
   `source` z. B. „capterra-lexoffice" — hilft später beim Nachvollziehen.
4. Im Dashboard **⤓ CSV-Import** → Datei → „Importieren & verarbeiten".
5. Das Clustering bündelt die 100 Reviews zu wenigen Themen. Sortiere nach Score;
   die **Stufe-4-Opportunities** sind deine Validierungs-Kandidaten.
6. Detailansicht öffnen → Evidenz-Zitate + „nächster Schritt" → 5 Betroffene ansprechen.

Faustregel: 100 gezielte Reviews einer Nische schlagen 1000 zufällige Reddit-Posts.
