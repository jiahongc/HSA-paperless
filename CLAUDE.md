# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HSA Paperless is a privacy-first Health Savings Account document tracker. All user documents and metadata are stored exclusively in the user's own Google Drive `appDataFolder` — zero server-side storage.

## Commands

```bash
npm run dev      # Start dev server on localhost:3000 (always use port 3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run Next.js linting
```

## Required Environment Variables

Create `.env.local` in project root (see SETUP.md for Google Cloud setup):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
GOOGLE_VISION_API_KEY=...
```

## Architecture

**Stack:** Next.js 14 (App Router) + TypeScript + Tailwind CSS, deployed on Vercel.

### Storage Model

There is no database. All persistence is in the user's Google Drive `appDataFolder`:
- `documents.json` — single metadata file containing all document records
- `documents/YYYY-MM/` — uploaded document files organized by month

The entire metadata file is read on login and all filtering/search happens in-memory on the client.

### Auth Flow

Google OAuth via NextAuth.js (JWT strategy). The `drive.appdata` scope grants access only to this app's hidden folder in the user's Drive. Token refresh is handled automatically in the JWT callback (`lib/auth.ts`) with a 60-second buffer before expiration.

### Key Modules

- **`lib/auth.ts`** — NextAuth config with Google provider, JWT callbacks, token refresh logic
- **`lib/drive.ts`** — All Google Drive operations: folder creation, metadata read/write, file upload/download/delete
- **`app/page.tsx`** — Main dashboard (single large client component with all UI state)
- **`types/documents.ts`** — `Document` and `DocumentsFile` type definitions

### API Routes

All under `app/api/`:

| Route | Methods | Purpose |
|---|---|---|
| `documents/route.ts` | GET, POST, PUT | List docs, create manual entry, bulk update metadata |
| `documents/[id]/route.ts` | PATCH, DELETE | Update/delete single document |
| `documents/upload/route.ts` | POST | Multi-file upload with OCR (Vision API) |
| `documents/download/[id]/route.ts` | GET | Download file (Content-Disposition: attachment) |
| `documents/file/[id]/route.ts` | GET | Preview file (Content-Disposition: inline) |
| `auth/[...nextauth]/route.ts` | * | NextAuth handler |

All document API routes require an authenticated session. Auth failures return 401; Drive API errors return 500.

### Frontend

The dashboard (`app/page.tsx`) is a single `"use client"` component with:
- Two tabs: Dashboard and HSA Education
- KPI cards, stacked bar charts (yearly/monthly toggle), document table
- Upload dropzone, document preview modal, manual entry form
- In-memory search across title, merchant, category, notes, filename
- ~20 `useState` hooks for local state management

### Styling

Tailwind CSS with a custom Anthropic-inspired color palette defined in `tailwind.config.ts`:
- Typography: Fraunces (serif headings) + Manrope (sans body) via Google Fonts
- Key colors: `base` (#f8f5ef), `surface` (#f1e8dd), `ink` (#1a1a1a), `coral`, `sage`, `sky`

## Design Decisions

- **No server-side storage** — privacy-first; all data lives in user's Drive
- **Single JSON metadata file** — avoids Drive API scanning; fast dashboard load
- **`drive.appdata` scope** — files are hidden from the user's normal Drive view and only accessible by this app
- **OCR on upload only** — Google Cloud Vision runs once; results saved to metadata
- **Manual entries supported** — `hasFile: false` documents have no attached file
