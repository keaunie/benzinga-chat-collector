# Benzinga Chat Collector - Next Phase Setup

## 1) Supabase SQL setup

Run `supabase/schema.sql` in the Supabase SQL editor.

## 2) Netlify environment variables

Set these in Netlify (Functions scope):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional, default `gpt-5`)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM` (example: `whatsapp:+14155238886`)
- `TWILIO_WHATSAPP_TO` (example: `whatsapp:+15551234567`)
- `COLLECTOR_INGEST_TOKEN` (optional but recommended)

## 3) Extension configuration

The extension posts to `https://YOUR_NETLIFY_SITE.netlify.app/api/benzinga-message` by default.

To override without code changes, set keys in `chrome.storage.local`:

- `pipelineBaseUrl` = `https://your-site.netlify.app`
- `pipelineAuthToken` = value matching `COLLECTOR_INGEST_TOKEN`

## 4) Scheduled report windows

Configured schedules in `netlify.toml`:

- `generate-12pm-report`: 12:05 PM PST
- `generate-3pm-report`: 3:05 PM PST
- `generate-7pm-report`: 7:05 PM PST

Each report uses stored messages only:

- 12PM report: 5AM -> 12PM Pacific
- 3PM report: 5AM -> 3PM Pacific
- 7PM report: 5AM -> 7PM Pacific

## 5) Duplicate protection

- Message duplicate prevention: `benzinga_messages.id` primary key + Supabase UPSERT
- Report duplicate prevention: `benzinga_reports.id` primary key (`YYYY-MM-DD-<reportType>`)

## 6) Local testing

- `npm run netlify:dev`
- POST test:

```bash
curl -i -X POST http://localhost:8888/api/benzinga-message \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "test-1",
    "username": "tester",
    "timestamp": "9:30AM",
    "message": "SPY calls sweeping",
    "capturedAt": "2026-05-23T01:00:00.000Z"
  }'
```

- Manual scheduled invoke:

```bash
npm run functions:12pm
npm run functions:3pm
npm run functions:7pm
```

## 7) Rollback

If needed, revert extension-only forwarding by rolling back `content.js` and `manifest.json` to prior commit. Collection and local storage flow remains fully intact because fallback local persistence was never removed.
