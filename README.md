# Kleen Resorts — Marketing Dashboard

Een wekelijks, mobiel-vriendelijk dashboard dat **leads**, **ad spend** en
**advertentie-performance** van de Kleen Resorts-projecten (Greenerwold, Fryske
Mar, Huis ter Huynen, Oysterduinen, WestonBay, …) samenbrengt en automatisch
slim duidt.

> **Status:** fundament staat. Het dashboard draait nu volledig op realistische
> **testdata** (geen credentials nodig). De live-koppelingen met Google Sheets,
> de Meta Marketing API en de AI-samenvatting zijn voorbereid en worden
> aangezet zodra de toegang geregeld is — zie [`docs/SETUP.md`](docs/SETUP.md).

## Wat het laat zien
- **KPI's per week:** leads, ad spend, kosten per lead (CPL), afspraken — met
  verandering t.o.v. vorige week.
- **Trend:** leads en spend per week in één grafiek.
- **Spend per platform:** Meta / Google / LinkedIn.
- **Best presterende advertenties:** gesorteerd op laagste kosten per lead.
- **Leads per project:** ranglijst over alle projecten.
- **Slimme samenvatting:** een korte, automatische duiding (door OpenAI) van wat
  er deze week opvalt.
- **Filter** op project, of bekijk alle projecten samen.

## Tech stack
- **Next.js 15** (App Router) + **React** + **TypeScript**
- **Tailwind CSS** (mobile-first)
- **Recharts** voor de grafieken
- Databronnen: **Google Sheets API**, **Meta Marketing API**, **OpenAI**
- Deploy-doel: **Vercel** (incl. wekelijkse cron-refresh)

## Lokaal draaien
```bash
npm install
cp .env.example .env.local   # standaard DATA_SOURCE=mock -> werkt direct
npm run dev                  # http://localhost:3000
```

## Scripts
| Script | Doel |
| --- | --- |
| `npm run dev` | Lokale ontwikkelserver |
| `npm run build` | Productie-build |
| `npm run typecheck` | TypeScript-controle |
| `npm run lint` | Linten |

## Projectstructuur
```
src/
  app/                 Next.js routes (dashboard + cron-endpoint)
  components/          UI-componenten (KPI's, grafieken, tabellen)
  data/
    index.ts           Provider: schakelt tussen mock en live
    mock.ts            Realistische testdata
    sources/           Live-bronnen: googleSheets, meta, insights (OpenAI)
  lib/                 Types, projectnaam-mapping, valuta, formatting, aggregatie
docs/
  SETUP.md             Stap-voor-stap: credentials koppelen
  ARCHITECTURE.md      Hoe de data stroomt + structuur van de sheets
```

## Van testdata naar live
Volg [`docs/SETUP.md`](docs/SETUP.md). Kort:
1. Google service-account aanmaken en beide sheets ermee delen.
2. Meta-app + long-lived token (`ads_read`) + ad-account-ID's.
3. (Optioneel) OpenAI API-key voor de wekelijkse samenvatting.
4. `DATA_SOURCE=live` zetten en de adapters in `src/data/sources/` afmaken.
