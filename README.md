<p align="center">
  <img src="banner.png" alt="HSA Paperless Banner" />
</p>

# HSA Paperless

Track HSA documents with a clean dashboard, reimbursement status, and OCR autofill while keeping all files and metadata in the user’s own Google Drive app data folder.

## For Users
1. Open the app.
2. Sign in with Google.
3. Upload documents and track reimbursement status.

That’s it — no accounts to create and no extra setup.

## How It Works
- Document files are saved to the user’s Google Drive `appDataFolder` (hidden from normal Drive view).
- Metadata is stored in `documents.json` in the same hidden folder.
- OCR runs once on upload to autofill fields.
- The dashboard always loads from the JSON file on login.

## Features
- Google login
- Multi-file upload + mobile file picker
- OCR autofill (Google Cloud Vision)
- Editable document titles
- Reimbursement toggle + optional reimbursed date
- Search across title, merchant, category, notes
- Document preview in a centered modal
- Download documents directly from Drive
- Dashboard KPIs and stacked charts (yearly/monthly)
- HSA Education tab

## Data Storage
All data stays in the user’s Google Drive `appDataFolder`:
- `documents/YYYY-MM/document_<timestamp>.<ext>`
- `documents.json`

Example metadata:
```json
{
  "version": 1,
  "documents": [
    {
      "id": "doc_20260204_001",
      "fileId": "drive_file_id_here",
      "filename": "document_2026-02-04_001.jpg",
      "hasFile": true,
      "title": "CVS Prescription",
      "merchant": "CVS",
      "category": "Pharmacy",
      "date": "2026-02-04",
      "amount": 24.17,
      "notes": "",
      "reimbursed": false,
      "reimbursedDate": null,
      "createdAt": "2026-02-04T18:22:10Z",
      "ocrConfidence": 0.86
    }
  ]
}
```

## Development Setup
These steps are for contributors who want to run the app locally or deploy it.

1. Install dependencies.
2. Create `.env.local` with the following values:
```bash
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=...
GOOGLE_VISION_API_KEY=...
```
3. Run the dev server.

## Privacy & Security
- Document files never touch your servers.
- Metadata lives only in the user’s Drive.
- Users can revoke access at any time.

## Roadmap
- Export CSV
- Bulk edit
- Import existing Drive folder (optional)
