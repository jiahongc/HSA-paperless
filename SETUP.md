# Setup Guide (Google OAuth + Vision)

This guide is for developers setting up Google OAuth, Google Drive access, and Google Vision OCR.

## 1. Create a Google Cloud Project
- Go to Google Cloud Console.
- Create a new project (or reuse an existing one).

## 2. Enable APIs
Enable the following APIs for the project:
- **Google Drive API**
- **Google Cloud Vision API**

## 3. Configure OAuth Consent Screen
- Set the app name and support email.
- Add the scopes:
  - `openid`
  - `email`
  - `profile`
  - `https://www.googleapis.com/auth/drive.appdata`

## 4. Create OAuth Credentials (Web Client)
- Create an OAuth Client ID (Web application).
- Add **Authorized redirect URIs**:
  - Local dev: `http://localhost:3000/api/auth/callback/google`
  - Production: `https://hsa-paperless.vercel.app/api/auth/callback/google`

## 5. Create a Google Vision API Key
- Create an API key for Google Cloud Vision.

## 6. Local Environment Variables
Create `.env.local` in the project root:
```bash
GOOGLE_CLIENT_ID="1234567890-abcxyz123.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-abc123DEF456ghi789"
NEXTAUTH_SECRET="a-very-long-random-string"
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_VISION_API_KEY="AIzaSyD-EXAMPLEKEY1234567890"
```

## 7. Vercel Environment Variables
In Vercel → Project Settings → Environment Variables, set the same values:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL` (`https://hsa-paperless.vercel.app`)
- `GOOGLE_VISION_API_KEY`

## Notes
- End users do **not** need to set environment variables.
- OAuth redirect URLs must match exactly (including `https` and the path).
- The app stores files in the hidden Google Drive `appDataFolder` along with `documents.json`.
