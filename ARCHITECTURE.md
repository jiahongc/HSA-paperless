# Architecture & Technical Plan

This document outlines the system design, data model, and implementation plan for **HSA Receipts Tracker** with zero server-side storage of user receipts or metadata.

## Goals
- End users only sign in with Google and start using the app.
- Receipt files and metadata are stored **only** in the user’s Google Drive `appDataFolder`.
- No server-side storage of receipts or metadata.
- Fast dashboard load from a single metadata JSON file.
- Clean, modern UI with a dashboard + education tab.

## High-Level Architecture

- **Frontend**: Next.js (App Router), React, TypeScript
- **Auth**: Google OAuth (OpenID + Drive scope)
- **Storage**: Google Drive `appDataFolder`
- **Metadata**: `metadata/receipts.json` stored in `appDataFolder`
- **OCR**: Google Cloud Vision API (one-time on upload)
- **Hosting**: Vercel

## User Data Flow
1. User signs in with Google.
2. App locates or initializes `metadata/receipts.json` in `appDataFolder`.
3. Dashboard renders from JSON metadata (no Drive scanning).
4. Receipt uploads are stored in `appDataFolder/receipts/YYYY-MM/`.
5. OCR runs once at upload; extracted fields are saved to JSON.
6. Reimbursement changes update only JSON (and optionally file metadata).

## Google Drive Storage Model
**Hidden app folder (appDataFolder):**
- `receipts/YYYY-MM/receipt_<timestamp>.<ext>`
- `metadata/receipts.json`

**Why appDataFolder:**
- Hidden from user’s main Drive view.
- Access restricted to this app only.

## Metadata Schema (receipts.json)
```json
{
  "version": 1,
  "receipts": [
    {
      "id": "rct_20260204_001",
      "fileId": "drive_file_id_here",
      "filename": "receipt_2026-02-04_001.jpg",
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

**Rules**
- `hasFile=false` indicates manual entry without an attached receipt.
- `title` is editable and short; no amounts in title.
- `reimbursedDate` is optional and uses a date picker.

## OCR Extraction Strategy
- Triggered only on upload (never on login).
- Use Google Cloud Vision to extract:
  - Merchant
  - Date
  - Total amount
  - Category (best effort)
- User reviews and edits before saving.

## Search Strategy
Search matches these fields in memory:
- `title`, `merchant`, `category`, `notes`, `filename`

## Dashboard UX
**Tabs**
1. **Dashboard**
2. **HSA Education**

**Dashboard Panels**
- KPI cards: Total, Reimbursed, Not Reimbursed
- Chart: stacked bars (reimbursed vs not reimbursed)
  - Toggle: `Yearly` (default) / `Monthly`
  - Yearly: all years, no dropdown
  - Monthly: year dropdown
- Receipt table
  - Reimbursed toggle
  - View (center modal)
  - Download
  - Delete

## Chart Calculations
**Yearly view**
- Group by year
- Stacked bars: reimbursed vs not reimbursed totals

**Monthly view**
- Group by month within selected year
- Dropdown years range from earliest receipt year to current year

## UI Styling Notes
- Anthropic-inspired palette (warm off-white, muted accents)
- Premium typography pairing (serif heading + modern sans body)
- Centered receipt preview modal

## Security & Privacy
- Receipts and metadata never stored on our servers.
- OAuth scopes limited to appDataFolder + basic profile/email.
- User can revoke access at any time.

## Implementation Phases
1. **Auth + Drive access**
   - Google OAuth
   - appDataFolder read/write
   - init `receipts.json`

2. **Upload + OCR**
   - multi-file upload
   - OCR extraction
   - confirm/edit flow
   - write JSON

3. **Dashboard UI**
   - KPI cards
   - chart toggle + calculations
   - receipt table
   - preview modal

4. **Education Tab**
   - content layout
   - responsive typography

5. **Export + polish**
   - CSV export
   - error handling
   - loading states

## Open Questions (If Needed Later)
- CSV export format details
- Optional “reimbursed date” usage rules
- Future import of existing Drive receipts

## Diagrams

### System Overview
```mermaid
flowchart LR
  classDef client fill:#f8f5ef,stroke:#c9c3b8,color:#1a1a1a
  classDef app fill:#f1e8dd,stroke:#c9c3b8,color:#1a1a1a
  classDef google fill:#e7efe9,stroke:#a3b9a7,color:#1a1a1a
  classDef service fill:#efe3dc,stroke:#c9c3b8,color:#1a1a1a

  U[User]:::client -->|Sign in| A[Web App]:::app
  A -->|Drive API| D[Drive appDataFolder]:::google
  A -->|OCR| V[Vision API]:::service
  A -->|UI| U
```

### Upload + OCR Flow
```mermaid
flowchart TB
  classDef step fill:#f8f5ef,stroke:#c9c3b8,color:#1a1a1a
  classDef io fill:#e7efe9,stroke:#a3b9a7,color:#1a1a1a

  U[Upload files]:::step --> S[Save to appDataFolder]:::io
  S --> O[Run OCR]:::step
  O --> F[User edits fields]:::step
  F --> J[Update receipts.json]:::io
```

### Login + Load Flow
```mermaid
flowchart TB
  classDef step fill:#f8f5ef,stroke:#c9c3b8,color:#1a1a1a
  classDef io fill:#e7efe9,stroke:#a3b9a7,color:#1a1a1a

  L[Google sign-in]:::step --> R[Read receipts.json]:::io
  R --> T[Render dashboard]:::step
```
