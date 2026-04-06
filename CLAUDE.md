# YouTube Kids - Project Guide

A personal YouTube video search app. Users authenticate via Google OAuth, sync their YouTube subscriptions, and search across synced video metadata stored in Firestore.

## Tech Stack

- **Frontend:** React 18 + TypeScript, Vite, Material UI (MUI) v7, react-router-dom v6
- **Backend:** Google Apps Script (GAS) deployed as a web app (single `doPost` entry point)
- **Database:** Firestore (database ID: `youtube-kids`)
- **Auth:** Google OAuth 2.0 with PKCE, Firebase custom tokens, Firebase Auth
- **Hosting:** Firebase Hosting

## Project Structure

```
src/
  app/             # App shell: root component, route definitions, MUI theme
  auth/            # Auth domain: AuthContext (provider + hook) and PKCE utilities
  components/      # Shared UI components (ProtectedRoute, UserMenu)
  contexts/        # Non-auth contexts (SyncStatusContext)
  pages/           # Route-level views (Search, Watch, Admin, Login, etc.)
  services/        # Data access layer: Firebase init, Firestore queries, GAS client
  main.tsx         # Entry point
  index.css        # Global styles (MUI/emotion handles the rest)

gas/               # Google Apps Script backend (.gs files)
  Router.gs        # doPost entry point, routes by "action" param, shared Firestore helpers
  Auth.gs          # OAuth code exchange, token storage, Firebase custom token creation
  Channels.gs      # YouTube channel search and management
  VideoSync.gs     # Video metadata sync from YouTube API to Firestore
  DataMigration.gs # One-off data migration utilities

functions/           # GCP Cloud Run Functions (Node.js)
  index.js           # Function entry point (streamContents)
  contents.txt       # Sample text file streamed to clients
  package.json       # Dependencies (functions-framework, firebase-admin)
```

## Architecture

### Authentication Flow

1. Client redirects to Google OAuth consent screen with PKCE challenge
2. Google redirects back to `/auth/callback` with an authorization code
3. Client sends the code + PKCE verifier to GAS (`action: 'exchangeCode'`)
4. GAS exchanges the code for tokens, stores the **refresh token server-side** in Firestore (`user_tokens` collection), creates a Firebase custom token, and returns it
5. Client calls `signInWithCustomToken()` to establish a Firebase Auth session
6. Subsequent authenticated GAS calls include a Firebase ID token, verified server-side

Refresh tokens never leave the server. The client only holds Firebase ID tokens.

### GAS Communication

All GAS calls go through `src/services/gasClient.ts` via `callGas()`. Requests use `Content-Type: text/plain` to avoid CORS preflight (GAS redirects through `script.googleusercontent.com`). The request body is JSON with an `action` field that Router.gs uses to dispatch to the correct handler.

### Firestore Data Model

All user data is scoped under `users/{uid}/`:
- `users/{uid}/videos` - Synced video metadata (searchable via `searchWords` array)
- `users/{uid}/allowed_channels` - Channels the user follows (supports soft delete via `status` field)
- `users/{uid}/sync_status/current` - Real-time sync progress (listened to via `onSnapshot`)
- `user_tokens/{uid}` - Server-side OAuth tokens (only accessed from GAS)

### Firestore Queries

All Firestore query functions live in `src/services/firestore.ts`. Pages should call these functions rather than constructing queries directly. Video search uses `array-contains-any` on the `searchWords` field.

## MUI Guidelines

- The app uses a **dark theme** defined in `src/app/theme.ts` (YouTube-style: `#0f0f0f` background, `#ff0000` primary)
- Buttons use `textTransform: 'none'` globally
- Use MUI components (`Box`, `Typography`, `Button`, `TextField`, etc.) for all UI - do not add custom CSS unless necessary
- Use the `sx` prop for one-off styling; the theme for shared styles
- Import icons from `@mui/icons-material`

## Commands

```bash
npm run dev       # Start dev server (Vite)
npm run build     # Type-check + build for production
npm run lint      # ESLint
npm run preview   # Preview production build
```

## Conventions

- PascalCase for components, camelCase for utilities
- Pages are route-level views in `src/pages/`; shared components go in `src/components/`
- Use `useAuth()` hook to access the current user and login/logout functions
- Use `useSyncStatus()` hook to read real-time sync progress
- GAS backend files use plain JavaScript (not TypeScript) with `var` declarations
