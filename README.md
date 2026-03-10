# tickets-thing

Upload supermarket ticket scans as images or PDFs, extract structured item rows with OpenRouter, review the results in the browser, and confirm the final rows into Google Sheets.

## What it does

- Accepts receipt images and PDFs
- Converts PDFs into per-page images before processing
- Uses OpenRouter to extract:
  - supermarket name
  - supermarket tag
  - original item name
  - generic English name
  - generic Spanish name
  - unit price
  - price per kg/l when present or confidently derivable
- Lets the user review and edit results before syncing
- Writes one row per item into a Google Sheets registry tab with a header row and filter
- Logs every confirmed receipt into a `Tickets` tab as one row per receipt item grouped by `Ticket ID`

## Stack

- Next.js App Router
- Bun
- OpenRouter Chat Completions API
- Google Sheets API via a shared service account
- `pdfjs-dist` + `@napi-rs/canvas` for PDF page rendering
- `sharp` for image normalization
- local JSON draft storage in `.data/`

## Setup

1. Install dependencies

```bash
bun install
```

2. Copy the env file

```bash
cp .env.example .env.local
```

3. Fill in the OpenRouter and Google Sheets credentials

4. Share your spreadsheet with the service account email as an editor

5. Start the dev server

```bash
bun dev
```

Open `http://localhost:3000`.

## Environment variables

- `OPENROUTER_API_KEY` - OpenRouter API key
- `OPENROUTER_MODEL` - default `google/gemini-2.5-flash`
- `OPENROUTER_BASE_URL` - default `https://openrouter.ai/api/v1`
- `GOOGLE_SHEETS_SPREADSHEET_URL` - preferred; spreadsheet ID is extracted from it
- `GOOGLE_SHEETS_SPREADSHEET_ID` - optional alternative to the URL
- `GOOGLE_SHEETS_TAB_NAME` - destination registry tab name
- `GOOGLE_SHEETS_TICKETS_TAB_NAME` - destination ticket-log tab name (default `Tickets`)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - service account email
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` - private key, with `\n` preserved in `.env`
- `STORAGE_DIR` - local working storage, default `.data`
- `UPLOAD_MAX_MB` - maximum size per uploaded file
- `MAX_RECEIPT_PAGES` - max PDF pages to render

## Notes

- Drafts are stored locally under `.data/receipts/<receipt-id>/draft.json`
- Confirmed rows are synced to the registry tab and also appended to the Tickets tab with a shared ticket code per upload
- OpenRouter output is schema-validated, but receipt OCR can still require manual cleanup
- HEIC/HEIF uploads depend on your local `sharp` build capabilities

## Commands

```bash
bun dev
bun run lint
bun run build
```
