# Benzinga Chat Collector - AI Classification + Report Engine

## Architecture

Benzinga Chat -> Chrome Extension -> Netlify ingest function -> Supabase -> Scheduled Netlify reports -> OpenAI report synthesis -> Twilio WhatsApp delivery

## 1) Database migration

Run this first on your existing Supabase project:

- `supabase/migrations/20260524_add_ai_classification_columns.sql`

For fresh environments, run:

- `supabase/schema.sql`

## 2) Message classification at ingest

`netlify/functions/benzinga-message.js` keeps current ingestion flow and calls `upsertMessage()`.

`upsertMessage()` now enriches each message with:

- `message_type`
- `sentiment`
- `mentioned_tickers`
- `is_matt_message`
- `signal_strength`
- `ai_summary`
- `trading_day`

Notable contributor priority is built in for:

- `MMaley` (highest priority)
- `MissNazo`
- `Sparky`
- `ColinMcRae`

## 3) Scheduled reports

New scheduled functions:

- `generate-open-market-report` (5AM -> 12PM Pacific)
- `generate-midday-report` (5AM -> 3PM Pacific)
- `generate-endofday-report` (5AM -> 7PM Pacific)

All reports read **Supabase only** (no re-scraping).

## 4) Timezone and DST safety

Netlify schedules run in UTC.

`netlify.toml` schedules each report at both UTC candidates (PST/PDT), then each function enforces Pacific local-hour guard in code.

This keeps execution aligned to Pacific report times across DST changes.

## 5) Environment variables

Required in Netlify:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional; default `gpt-5`)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM` (example: `whatsapp:+14155238886`)
- `TWILIO_WHATSAPP_TO` (example: `whatsapp:+15551234567`)

## 6) Local invoke commands

```bash
npm run netlify:dev
npm run functions:open-market
npm run functions:midday
npm run functions:endofday
```

## 7) Ingest test

```bash
curl -i -X POST http://localhost:8888/api/benzinga-message \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "test-ai-1",
    "username": "MMaley",
    "timestamp": "9:30AM",
    "message": "SPY 0dte 715p starter. downside hedge until resistance breaks.",
    "capturedAt": "2026-05-24T16:30:00.000Z"
  }'
```

Expected:

- 200 response from function
- Supabase row upserted with classification columns populated

## 8) Report quality checks

Verify generated reports include:

- MARKET SENTIMENT
- TOP TICKERS with mentions/sentiment/conviction
- MATT MALEY COMMENTARY
- HIGH CONVICTION TRADES
- OPTIONS FLOW
- MACRO THEMES
- KEY TAKEAWAYS

## 9) Rollback safety

Collector extraction/backread/MutationObserver are untouched.

If rollback is needed, revert Netlify function/lib/schema changes only; extension collection remains operational.
