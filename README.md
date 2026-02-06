<p align="center">
  <img src="banner.png" alt="HSA Paperless Banner" />
</p>

# HSA Paperless

Track HSA documents with a clean dashboard, reimbursement status, and OCR autofill while keeping all files and metadata in the user's own Google Drive app data folder.

**Live:** [hsa-paperless.vercel.app](https://hsa-paperless.vercel.app)

## For Users
1. Open the app.
2. Sign in with Google.
3. Upload documents and track reimbursement status.

That's it — no accounts to create and no extra setup.

## How It Works
- Document files are saved to the user's Google Drive `appDataFolder` (hidden from normal Drive view).
- Metadata is stored in `documents.json` in the same hidden folder.
- OCR runs once on upload to autofill fields (Vision API for images, pdfjs-dist for PDFs).
- The dashboard always loads from the JSON file on login.

## Features
- Google login
- Multi-file upload with drag and drop (JPG, PNG, WebP, PDF; 10 MB per file limit)
- OCR autofill (Google Cloud Vision)
- Editable document titles and categories
- User field with custom name support
- Reimbursement toggle with optional reimbursed date
- Search across title, user, category, notes
- Document preview modal with inline editing and image zoom
- Download documents directly from Drive
- Dashboard KPIs (Total, Not Reimbursed, Reimbursed) with year and user filters
- Notes column in document table
- Export CSV
- Export all files as ZIP
- Clear all documents
- Three tabs: Dashboard, About HSA, Q&A

## Data Storage
All data stays in the user's Google Drive `appDataFolder`:
- `documents/YYYY-MM/<filename>.<ext>`
- `documents.json`

Example metadata:
```json
{
  "version": 1,
  "documents": [
    {
      "id": "uuid-here",
      "fileId": "drive_file_id_here",
      "filename": "cvs-prescription.jpg",
      "hasFile": true,
      "user": "John",
      "title": "CVS Prescription",
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

1. Install dependencies: `npm install`
2. Create `.env.local` with the following values:
```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
GOOGLE_VISION_API_KEY=...
```
3. Run the dev server: `npm run dev`

See [SETUP.md](SETUP.md) for detailed Google Cloud configuration.

## Privacy & Security
- Document files never touch our servers.
- Metadata lives only in the user's Drive.
- Files are stored in a hidden app data folder only this app can access.
- Users can revoke access at any time.
- Upload validation enforces file type (JPG, PNG, WebP, PDF) and size (10 MB) limits.
- File preview restricted to safe MIME types with `X-Content-Type-Options: nosniff`.
- Write lock prevents concurrent metadata corruption.

## Roadmap
- Bulk edit
- Import existing Drive folder (optional)
