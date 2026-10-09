# 🏏 Cric Scorer Pro — Production Deployment & Operations Runbook

## 1. Overview & Architecture

**Cricket Scorer Pro** is an enterprise-grade, offline-first Progressive Web App (PWA) built on **Next.js 14 (App Router)**, **TypeScript**, and **Tailwind CSS**. It is engineered with Domain-Driven Design (DDD) to guarantee zero-latency local scoring even in completely disconnected environments (e.g. rural cricket grounds, zero-signal stadiums).

### Technology Stack & Integrations
- **Frontend / Framework**: Next.js 14.2.35 (React 18, App Router)
- **Local Persistence**: IndexedDB via Dexie.js v2 (`CricScorerDB` with stores: `matches`, `events`, `teams`, `tournaments`, `syncQueue`)
- **Authentication**: Firebase Authentication (Google Sign-In, Email/Password, Anonymous guest mode)
- **Cloud Database**: Cloud Firestore (Atomic user profiles, synced scorecards, user-isolated security rules)
- **Cloud Backup**: Google Drive API v3 (Scoped to `https://www.googleapis.com/auth/drive.file` for least privilege)
- **PWA / Service Worker**: Workbox / Custom SW caching core app shell, assets, and offline fallback route (`/offline`)
- **PDF Export**: Vector-quality client-side generation via dynamic `jspdf` & `jspdf-autotable`
- **Hosting**: Vercel (or Firebase Hosting / Node.js standalone Docker)

---

## 2. Pre-Deployment Verification Checklist

Before triggering any production deployment, execute the following commands in sequence:

```bash
# 1. Type Safety Check (Zero errors)
npx tsc --noEmit

# 2. Code Quality & Lint Check (Zero warnings/errors)
npm run lint

# 3. Complete Test Suite Execution (29 test suites, 243+ tests)
npm test

# 4. Production Build & Static Asset Generation
npm run build
```

**Verification Thresholds:**
- Exit Code: `0` on all steps
- First Load JS Shared: `< 100 kB` (Current: `87.9 kB`)
- HTTP Security Headers: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block` present.
- Server Fingerprinting: `X-Powered-By` header disabled.

---

## 3. Environment Variables Reference

Ensure all variables are populated in your hosting provider's dashboard (e.g. Vercel Project Settings -> Environment Variables):

| Variable Name | Required | Environment | Description |
|---|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes (for Auth/Cloud) | Production, Preview | Firebase Web API Key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes (for Auth/Cloud) | Production, Preview | e.g. `cricket-proo.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes (for Auth/Cloud) | Production, Preview | e.g. `cricket-proo` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Yes (for Auth/Cloud) | Production, Preview | e.g. `cricket-proo.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Yes (for Auth/Cloud) | Production, Preview | Firebase Cloud Messaging Sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Yes (for Auth/Cloud) | Production, Preview | Firebase Web App ID |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Optional | Production | Google Analytics 4 Measurement ID |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Yes (for Drive Backup) | Production, Preview | Google Cloud OAuth 2.0 Web Client ID |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Production, Preview | Legacy Supabase synchronization URL (if enabled) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Production, Preview | Legacy Supabase public anon key |

---

## 4. Google Cloud & OAuth Origins Setup

For Google Sign-In and Google Drive Cloud Backup to operate in production:
1. Navigate to [Google Cloud Console](https://console.cloud.google.com) -> **APIs & Services** -> **Credentials**.
2. Select your OAuth 2.0 Web Client ID (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`).
3. Under **Authorized JavaScript origins**, add:
   - `https://cricket-proo.firebaseapp.com`
   - `https://your-custom-domain.com` (and any production Vercel aliases)
4. Under **Authorized redirect URIs**, ensure your Firebase Auth handler is listed:
   - `https://cricket-proo.firebaseapp.com/__/auth/handler`
5. Verify enabled APIs:
   - **Google Drive API** (Status: Enabled)
   - **Identity Toolkit API** (Status: Enabled)

---

## 5. Deployment Procedures

### Option A: Vercel Production Deployment (Default)

```bash
# Link local repository to Vercel project (if not linked)
vercel link

# Pull environment variables
vercel env pull .env.production.local

# Deploy directly to production
vercel --prod
```

### Option B: Firebase Hosting Deployment

```bash
# Build the application
npm run build

# Deploy Hosting and Firestore Rules
firebase deploy --only hosting,firestore:rules
```

### Option C: Self-Hosted / Docker Container

```dockerfile
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
```

---

## 6. Zero-Downtime Rollback Runbook

If a critical defect or regression is identified post-deployment:

### Immediate Vercel Instant Rollback (< 60 seconds)
1. Navigate to the **Vercel Dashboard** -> **Deployments**.
2. Identify the previous known-good deployment hash.
3. Click the three dots (`...`) -> **Promote to Production** (or **Instant Rollback**).
4. Traffic is routed immediately to the previous deployment artifact with zero downtime.

### CLI Rollback
```bash
# Rollback to the previous deployment via Vercel CLI
vercel rollback <previous-deployment-url>
```

### Local Client-Side Rollback & Service Worker Invalidation
If client browsers have cached a problematic service worker or build asset:
1. Increment `CACHE_VERSION` in `public/sw.js` (e.g. `cric-scorer-v2.1.1`).
2. The next user visit triggers the `install` and `activate` lifecycle in `ServiceWorkerManager.ts`, automatically wiping obsolete caches (`caches.delete(cacheName)`).
3. Client data stored in IndexedDB is never deleted during service worker invalidation.

---

## 7. Disaster Recovery & Data Preservation Procedures

### Principle of Local Preservation
Because Cric Scorer Pro is **Offline-First**, local match data in browser IndexedDB is treated as the primary source of truth for ongoing matches. Cloud operations are non-destructive and asynchronous.

### Cloud Data Removal Safeguards
- The "Danger Zone" Clear Local Database feature requires a **3-second continuous hold** with warning modal confirmation (`DangerZoneClearButton`).
- Google Drive backups create timestamped, isolated JSON archive files (`cricket_scorer_backup_<timestamp>.json`) in the user's private application drive space. Restoring backups parses and validates schema versioning (`schemaVersion: 2`) before writing to IndexedDB.

### Incident Scenarios & Response Runbook

| Scenario | Severity | Impact | Remediation Steps |
|---|---|---|---|
| **Google Drive API Quota / Token Failure** | Low / Medium | Cloud backup fails; local scoring remains 100% operational | 1. Prompt user to reconnect Google account via Profile screen.<br>2. Export JSON backup directly to local storage.<br>3. Verify OAuth token expiry and refresh flow. |
| **Firestore Outage / Network Disconnection** | Low | Live cloud sync queues locally; no data loss | 1. `SyncEngine` automatically captures changes into `syncQueue` in Dexie.<br>2. Exponential backoff retries writes once network connection resumes.<br>3. User sees offline pill indicator in Navigation. |
| **Corrupt Local Database / Browser Storage Eviction** | High | User opens app and IndexedDB is unreadable | 1. In `dexie-db.ts`, handle database open errors with fallback initialization.<br>2. Prompt user to restore from Google Drive cloud backup or import local JSON backup.<br>3. GoogleDriveService checks latest cloud snapshot and restores records idempotently. |
| **Service Worker Interception Error** | Medium | Old JS bundle served to users | 1. Bump cache name in `public/sw.js`.<br>2. Trigger hard refresh or call `navigator.serviceWorker.getRegistrations()` unregister.<br>3. Redeploy with updated headers. |

---

## 8. Post-Deployment Verification (Smoke Test)

Immediately following production deployment, execute the smoke test checklist:
1. Navigate to the production URL (`https://...`).
2. Verify HTTP 200 response and security headers:
   - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `X-XSS-Protection: 1; mode=block`
   - `X-Powered-By` is NOT present.
3. Check `/robots.txt` and `/sitemap.xml` return valid HTTP 200 responses.
4. Perform a 1-over quick match end-to-end:
   - Create match (`/matches/new`) -> Select opening players (`/matches/opening-players`) -> Score 6 balls (`/matches/score/[id]`).
   - Validate live scoreboard updates, active batsman strike toggle, and match summary calculation.
5. Disconnect internet (DevTools -> Offline) and record 2 balls:
   - Confirm offline indicator appears and balls persist in IndexedDB.
   - Reconnect internet and observe sync status.
6. Verify PDF generation and download from Match Summary.
