# Architectuur & datamodel

## Dataflow
```
Google Sheets ─┐
 (Leads)       │   src/data/sources/googleSheets.ts ─┐
 (Ad Spend)    │                                      │
               │                                      ├─► src/data/index.ts ─► UI
Meta Marketing─┘   src/data/sources/meta.ts ──────────┤   (getDashboardData)
 API                                                  │
                   src/data/sources/insights.ts ──────┘
                   (Claude: wekelijkse samenvatting)
```

`getDashboardData()` is het enige aanspreekpunt voor de UI. Met
`DATA_SOURCE=mock` levert het testdata; met `DATA_SOURCE=live` combineert het de
echte bronnen. De UI weet niet welke bron actief is — dat maakt live-gaan
risicoloos.

Alle bronnen leveren data in de gedeelde domeintypes uit `src/lib/types.ts`
(`WeeklyLeads`, `WeeklySpend`, `AdPerformance`, `WeeklyInsight`).

## Twee aandachtspunten uit de huidige sheets

### 1. Week vs. maand
- **Leads** zijn per **ISO-week** (`WeekKey`, bv. `2026-W24`).
- **Ad spend** in de sheet is grotendeels per **maand** (`YYYY-MM`).

Voor een wekelijks dashboard met kosten-per-lead is spend per week nodig. Daarom
halen we ad-spend en -performance bij voorkeur rechtstreeks uit de **Meta
Marketing API** (`time_increment=7`), die dag/week-granulariteit én extra
metrics (impressions, clicks, CTR, results) levert die niet in de sheet staan.

### 2. Projectnamen
Parken heten verschillend per bron:
| Bron | Voorbeeld |
| --- | --- |
| Ad Spend (funnel) | `FM`, `HTH`, `GW`, `OYS` |
| Leads | `Fryske Mar - Resort Balk` |
| Meta/Google account | `Fryske Mar (Kleen) - Verkoop` |

`src/lib/parks.ts` (`normalizeProject`) mapt alles naar één canonieke naam, zodat
leads en spend op elkaar matchen. Breid de aliassen uit bij nieuwe accounts.

### Valuta
De Ad Spend-sheet mengt `€` en `$` (Dutch-notatie). `src/lib/currency.ts`
(`parseSheetAmount`) normaliseert naar EUR. Meta-data komt al numeriek binnen.

## Structuur van de bronsheets (referentie)

### Leads-sheet
- **Lead-niveau:** `DealID, Park, Status (open/won/lost), StageId, StageName,
  StageRank, WeekKey, MonthKey, Betrokken Verkoper, In contact, Afspraak gepland`.
- **Aggregaties per park:** week- en maandtabellen met
  `Leads, In contact %, Afspraak gepland %, Lost %`.

### Ad Spend-sheet (gevoed door Windsor.ai, dagelijks)
- **Meta (ad-niveau):** `Month, Account name, Amount spent, Campaign name, Ad
  Name, Adset Name`.
- **Google Ads:** `Month, Cost, Account (Customer), Ad group, Clicks, Avg. CPC`.
- **Per park × platform (maand):** `Maand, Park, Spend Google, Spend META, Spend
  LinkedIn, Spend Totaal`.
- **Funnel per park (maand):** `Maand, Park, Ad budget, Leads, Afspraken,
  Akkoorden, Getekend, Spend per lead/afspraak/akkoord/getekend`.
- **Dagreeks:** `Date, Spend`.

## Beslissingen
- **Hosting:** Vercel (gratis tier, Next.js-native, ingebouwde cron).
- **Refresh:** wekelijks via Vercel Cron (`vercel.json`, maandag 06:00) →
  `/api/refresh`. Homepage rendert nu live (`force-dynamic`); bij duurdere
  live-bronnen cachen we het cron-resultaat.
- **Beveiliging:** standaard open via geheime URL; `DASHBOARD_PASSWORD` zet met
  één variabele een simpele login aan (`src/middleware.ts`).
- **Fase 1:** Meta + leads. **Fase 2:** Google Ads + LinkedIn erbij.
