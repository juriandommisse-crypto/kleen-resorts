# Setup — credentials koppelen

Dit is de checklist om van **testdata** naar **live data** te gaan. Je hoeft
niets te kunnen programmeren; volg de stappen en deel de gevraagde gegevens.
Bewaar alle geheimen in `.env.local` (lokaal) of in de Vercel-omgevingsvariabelen
— **nooit** in de code of in git.

---

## 1. Google Sheets (leads + ad spend)

Doel: de app mag de twee sheets **lezen**.

1. Ga naar <https://console.cloud.google.com/> en maak (of kies) een project.
2. Activeer de **Google Sheets API** (APIs & Services → Library → "Google Sheets API" → Enable).
3. Maak een **service-account** aan (APIs & Services → Credentials → Create
   credentials → Service account). Geef het een naam, bv. `dashboard-reader`.
4. Maak bij dat service-account een **JSON-key** aan (Keys → Add key → JSON).
   Er wordt een `.json`-bestand gedownload.
5. Open beide sheets in Google Sheets en klik **Delen**. Deel met het
   service-account-e-mailadres (staat in de JSON, eindigt op
   `…iam.gserviceaccount.com`), rol **Viewer**.
6. Vul in `.env.local` in:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = `client_email` uit de JSON
   - `GOOGLE_PRIVATE_KEY` = `private_key` uit de JSON (met de `\n`'s, tussen quotes)

De sheet-ID's staan al ingevuld in `.env.example`:
- Ad Spend: `1Ti9fqrGCMzROHXzNuiBH1qACsZTwPWxHKSGMw_pNsL0`
- Leads: `1vVdNk9gsKZ2PwK5ZQX3K1RqDy_1JsqWwcX_ff_K6iVk`

> **Wat ik nodig heb van jou:** alleen dat je de sheets deelt met het
> service-account-adres. De JSON-key zet jij zelf in `.env.local` / Vercel.

---

## 2. Meta Marketing API (advertentie-performance)

Doel: per advertentie de echte cijfers ophalen (spend, impressions, clicks,
CTR, leads, CPL) — per dag/week. Dit staat niet in de sheet en is nodig voor
"welke advertentie loopt het best".

1. Ga naar <https://developers.facebook.com/> en maak een **app** (type
   *Business*). Koppel hem aan het Business-account van Kleen Resorts.
2. Voeg het product **Marketing API** toe.
3. Maak in **Business Settings → System users** een *system user* aan met
   toegang tot de ad-accounts, en genereer een **long-lived access token** met
   minimaal de permissie **`ads_read`**.
4. Verzamel de **ad-account-ID's** (Business Settings → Accounts → Ad Accounts).
   Ze beginnen met `act_` (bv. `act_1234567890`).
5. Vul in `.env.local`:
   - `META_ACCESS_TOKEN` = het long-lived token
   - `META_AD_ACCOUNT_IDS` = komma-gescheiden, bv. `act_123,act_456`

> **Wat ik nodig heb van jou:** het token + de lijst ad-account-ID's. Uit je
> huidige sheet bleek je ~6 Facebook-accounts te gebruiken (o.a. Fryske Mar
> Verkoop, Oysterduinen, Kleen Resorts Verkoop). Die wil ik allemaal.

---

## 3. Anthropic (slimme wekelijkse samenvatting) — optioneel

1. Maak een API-key aan op <https://console.anthropic.com/>.
2. Vul `ANTHROPIC_API_KEY` in `.env.local`. (`ANTHROPIC_MODEL` heeft een
   verstandige standaard.)

Zonder key werkt het dashboard gewoon, alleen zonder de tekstuele duiding.

---

## 4. Live zetten

1. Maak de adapters in `src/data/sources/` af (de structuur staat er al; dit doe
   ik in de volgende stap samen met jou).
2. Zet `DATA_SOURCE=live` in `.env.local`.
3. `npm run dev` en controleer of de echte cijfers verschijnen.

---

## 5. Deploy naar Vercel

1. Maak een gratis account op <https://vercel.com/> (kan met je Google-account).
2. Koppel deze GitHub-repo en importeer hem (framework wordt automatisch
   herkend als Next.js).
3. Zet alle variabelen uit `.env.local` als **Environment Variables** in Vercel.
4. Deploy. Je krijgt een niet-te-raden URL die perfect op je iPhone werkt.
5. De wekelijkse refresh (maandag 06:00) loopt automatisch via `vercel.json`.
   Zet `CRON_SECRET` om de endpoint te beschermen.

### Later een wachtwoord aanzetten
Zet `DASHBOARD_PASSWORD` in Vercel → het dashboard vraagt dan om een wachtwoord.
Leeg laten = open via de geheime URL (huidige keuze).
