# Backlog: Medium & Low Severity Findings

Items below were identified during a code review stress test. Critical and high severity issues have already been fixed. These remain for future consideration.

---

## Medium Severity

### M1. `useEffect` missing `loadDocuments` in dependency array
**File:** `app/page.tsx` (useEffect with `[session]` dep)
`loadDocuments` is not in the dependency array. Works today because it only depends on `session`, but could cause stale closure bugs if `loadDocuments` references additional state in the future.

### M2. CSV export does not reflect year/user KPI filters
**File:** `app/page.tsx`
`filteredDocuments` only filters by search text. The `totals` memo also filters by `filterYear` and `filterUser`. CSV export uses `filteredDocuments`, so exported data may not match what the KPI cards display.

### M3. `uploadedCount` state is unused
**File:** `app/page.tsx`
`uploadedCount` is initialized and reset but never incremented or displayed. Dead state that can be removed.

### M4. Duplicate file list key collision
**File:** `app/page.tsx`
`<li key={file.name-file.size}>` will collide if the same file is added twice. React will only render one. The `queuedFiles` accumulation also does not deduplicate.

### M5. Export ZIP buffers entire archive in memory
**File:** `app/api/documents/export/route.ts`
For users with many large documents, the entire ZIP is buffered in memory before sending. Could cause OOM on serverless. Consider streaming or imposing a size cap.

### M6. Export ZIP: duplicate filenames overwrite in archive
**File:** `app/api/documents/export/route.ts`
If two documents share the same `filename`, the second overwrites the first in the ZIP. Should deduplicate filenames in the archive.

### M7. POST document route allowed client-supplied `id` and `createdAt`
**File:** `app/api/documents/route.ts`
**Status:** Fixed -- server now generates both values. No further action needed.

### M8. `safeFilename` was insufficient for header injection
**File:** `app/api/documents/file/[id]/route.ts`, `download/[id]/route.ts`
**Status:** Fixed -- now strips `"`, `\r`, `\n`, `\`. For full RFC 6266 compliance, consider `filename*=UTF-8''...` encoding for non-ASCII characters.

### M9. No validation of `date` format in API routes
**Files:** `app/api/documents/route.ts`, `app/api/documents/[id]/route.ts`
The `date` field accepts any string. Invalid dates like `"not-a-date"` will break year-based filtering and sorting. Consider adding a `/^\d{4}-\d{2}-\d{2}$/` regex check.

### M10. Google Vision API key in URL query parameter
**File:** `lib/ocr.ts`
The API key is sent as a URL parameter which can appear in logs. Minor concern since key is server-side only, but best practice is to use headers where supported.

---

## Low Severity

### L1. OCR confidence assumption
**File:** `app/page.tsx`, `lib/ocr.ts`
Code assumes Vision API always returns confidence as 0-1. If the API ever returns 0-100, the display would show e.g. `9500%`. Currently correct but fragile.

### L2. `expiresAt` type could be undefined on initial login
**File:** `lib/auth.ts`
`account.expires_at` has type `number | undefined`. If undefined, the token refresh check triggers an immediate refresh -- wasteful but not broken.

### L3. `fetch()` does not throw on HTTP errors
**File:** `app/page.tsx` (various handlers)
`fetch()` only throws on network failures, not 4xx/5xx responses. Some error handling paths rely on the catch block which won't fire for server errors. Consider checking `response.ok` in more places.

### L4. No keyboard handling for modal dismiss
**File:** `app/page.tsx`
Both modals lack Escape key listeners. Users cannot press Escape to close modals, which is a standard accessibility expectation.

### L5. `previewUrl` and `isPreviewPdf` computed on every render
**File:** `app/page.tsx`
These derived values are recomputed every render. Minor since the computation is cheap.

### L6. `formatCurrency` does not handle NaN
**File:** `app/page.tsx`
If a non-number reaches `formatCurrency`, it displays `"NaN"`. Could add a `Number.isFinite()` guard.

### L7. Legacy `receipts.json` migration is incomplete
**File:** `lib/drive.ts`
The code reads legacy `receipts.json` but never renames it to `documents.json`. The dual-lookup continues indefinitely, adding an unnecessary API call on every request.

### L8. `next.config.js` extension with ESM package.json
**File:** `next.config.js`, `package.json`
With `"type": "module"`, the `.js` config uses ESM syntax which works but some Next.js versions prefer `.mjs`.

### L9. Font fallback chain
**Files:** `app/layout.tsx`, `tailwind.config.ts`
Tailwind config uses literal font names, not CSS variables. If Google Font CDN fails, fallback jumps straight to `ui-serif` with no intermediate.
