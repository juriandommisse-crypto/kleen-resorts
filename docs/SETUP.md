# Setup — credentials koppelen

Dit is de checklist om van **testdata** naar **live data** te gaan. Je hoeft
niets te kunnen programmeren; volg de stappen en deel de gevraagde gegevens.
Bewaar alle geheimen in `.env.local` (lokaal) of in de Vercel-omgevingsvariabelen
— **nooit** in de code of in git.

---

## 1. Google Sheets (leads + ad spend)

Doel: de app mag de twee sheets **lezen**.

We gebruiken het **bestaande** service-account:
`jurian30102002@civil-density-472414-n3.iam.gserviceaccount.com`
(project `civil-density-472414-n3`, "My Project 13924"). Dit e-mailadres staat
al ingevuld in `.env.example`.

Drie acties (alleen jij kunt deze doen):

1. **Sheets API aanzetten** in dít project: ga in Google Cloud naar
   APIs & Services → Library → zoek "Google Sheets API" → **Enable**.
   (Project `civil-density-472414-n3` moet bovenin geselecteerd staan.)
2. **Beide sheets delen** met het service-account-adres hierboven, rol
   **Viewer** (knop *Delen* in Google Sheets, plak het e-mailadres).
3. **JSON-sleutel** voor het account: IAM & Admin → Service Accounts → klik het
   account → **Keys** → *Add key* → *Create new key* → **JSON**. Er wordt een
   bestand gedownload. Open het en zet:
   - `GOOGLE_PRIVATE_KEY` = de `private_key`-waarde (begint met
     `-----BEGIN PRIVATE KEY-----`)
   in `.env.local` (lokaal) of in de Vercel-omgevingsvariabelen — **niet** in de
   chat of in git. Het e-mailadres (`client_email`) staat al goed.

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

## 3. OpenAI (slimme wekelijkse samenvatting) — optioneel

1. Maak een API-key aan op <https://platform.openai.com/api-keys>.
2. Vul `OPENAI_API_KEY` in `.env.local`. `OPENAI_MODEL` heeft een verstandige
   standaard (`gpt-4o-mini` — beste prijs/kwaliteit voor deze taak; je kunt er
   ook bv. `gpt-4.1-mini` of `gpt-4o` van maken).

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
