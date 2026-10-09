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

## 3. Environment Variables Reference & Vercel Configuration

> **CRITICAL ARCHITECTURAL NOTE ON NEXT.JS CLIENT ENVIRONMENT VARIABLES:**
> Next.js inlines variables prefixed with `NEXT_PUBLIC_` **statically into the JavaScript bundle at BUILD time**.
> If you add or modify environment variables in the Vercel dashboard, **existing deployments will NOT reflect the changes until a fresh build is executed**.
> You **MUST** trigger a **Redeploy** (ensure "Use existing Build Cache" is **unchecked**) in the Vercel Deployments dashboard after configuring these variables.

Ensure all variables are populated in your hosting provider's dashboard (**Vercel Dashboard -> Project -> Settings -> Environment Variables**):

| Variable Name | Required | Scope | Firebase / Cloud Source | Example Value |
|---|---|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | **Yes** | Production, Preview, Dev | Firebase Console -> Project Settings -> General -> Web Apps -> `apiKey` | `AIzaSyBrSMNsVh9hfYM...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | **Yes** | Production, Preview, Dev | Firebase Console -> Project Settings -> General -> Web Apps -> `authDomain` | `cricket-proo.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | **Yes** | Production, Preview, Dev | Firebase Console -> Project Settings -> General -> `projectId` | `cricket-proo` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | **Yes** | Production, Preview, Dev | Firebase Console -> Project Settings -> General -> Web Apps -> `storageBucket` | `cricket-proo.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | **Yes** | Production, Preview, Dev | Firebase Console -> Project Settings -> General -> `messagingSenderId` | `687129620648` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | **Yes** | Production, Preview, Dev | Firebase Console -> Project Settings -> General -> Web Apps -> `appId` | `1:687129620648:web:327...` |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Optional | Production | Firebase Console -> Project Settings -> General -> Web Apps -> `measurementId` | `G-FXGXSHDB7K` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | **Yes** (for Drive) | Production, Preview, Dev | Google Cloud Console -> APIs & Services -> Credentials -> OAuth 2.0 Web Client ID | `687129620648-p9fg9...apps.googleusercontent.com` |
| `NEXT_PUBLIC_APP_URL` | Optional | Production, Preview | Canonical domain for metadata & sitemaps | `https://cricket-theta-snowy.vercel.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Production, Preview | Legacy Supabase synchronization URL (if enabled) | `https://your-project.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Production, Preview | Legacy Supabase public anon key | `ey...` |

---

## 4. Google Cloud & OAuth Origins Setup

For Google Sign-In and Google Drive Cloud Backup to operate in production without OAuth origin mismatches:

### Step 1: Authorize Domains in Firebase Authentication
1. Open [Firebase Console](https://console.firebase.google.com) -> Select project `cricket-proo`.
2. Go to **Authentication** -> **Settings** tab -> **Authorized domains**.
3. Click **Add domain** and enter:
   - `cricket-theta-snowy.vercel.app`
   - `cricket-proo.firebaseapp.com` (added by default)
   - `localhost` (added by default)

### Step 2: Authorize Origins in Google Cloud Console (for Google Drive GIS)
1. Navigate to [Google Cloud Console](https://console.cloud.google.com) -> Select project `cricket-proo`.
2. Go to **APIs & Services** -> **Credentials**.
3. Under **OAuth 2.0 Client IDs**, select the Web client corresponding to `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (`687129620648-p9fg9svcpddnsu378qdlan1d75j89osd.apps.googleusercontent.com`).
4. Under **Authorized JavaScript origins**, add:
   - `https://cricket-proo.firebaseapp.com`
   - `https://cricket-theta-snowy.vercel.app`
   - `http://localhost:3000`
5. Under **Authorized redirect URIs**, verify:
   - `https://cricket-proo.firebaseapp.com/__/auth/handler`
6. Verify Enabled APIs in Google Cloud Console (**APIs & Services -> Enabled APIs & services**):
   - **Google Drive API** (Status: Enabled)
   - **Identity Toolkit API** (Status: Enabled)
   - **Token Service API** (Status: Enabled)

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

---

## 9. Firebase & Vercel Production Configuration Troubleshooting

### Symptom: Profile Page Displays Configuration Warning or Error
**Observed Error:** The production `/profile` page shows a banner indicating `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, or `NEXT_PUBLIC_FIREBASE_APP_ID` are missing or contain placeholder values.

### Root Cause Analysis
1. **Local vs. Cloud Environment Divergence:**
   Local development loads `.env.local`, which is deliberately `.gitignore`d to prevent credentials from being committed to the public Git repository. When Vercel clones the repository, `.env.local` is absent.
2. **Next.js Client-Side Build Inlining:**
   Next.js inlines variables prefixed with `NEXT_PUBLIC_` statically into client-side JavaScript bundles **at compilation time (`next build`)**. If variables were not populated in Vercel prior to build, or were populated with `.env.example` placeholders, the deployed bundle contains `undefined` or placeholder strings. Modifying environment variables in Vercel does **not** update existing deployments without triggering a full rebuild without cache.
3. **Independent Operation Resilience:**
   The application's Offline-First architecture ensures local match scoring, squads, tournaments, and personal Google Drive backups remain 100% operational in Dexie IndexedDB even if cloud Firebase credentials are not provided.

### Remediation Runbook (Vercel Production)
1. **Navigate to Vercel Project Settings:**
   Open [Vercel Dashboard](https://vercel.com) -> Select your project -> **Settings** -> **Environment Variables**.
2. **Add / Update the Production Variables:**
   Ensure each of the following variables is added for the **Production**, **Preview**, and **Development** environments (obtained from Firebase Console for project `cricket-proo`):
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
3. **Trigger Fresh Redeployment Without Build Cache:**
   - In Vercel, navigate to **Deployments**.
   - Click the three dots (`...`) on the latest production deployment -> **Redeploy**.
   - **CRITICAL:** Uncheck the checkbox **"Use existing Build Cache"** and click **Redeploy**.
4. **Authorize Vercel Domain in Firebase & Google Cloud Console:**
   - **Firebase Console:** Project `cricket-proo` -> Authentication -> Settings -> Authorized domains -> Add your `*.vercel.app` domain.
   - **Google Cloud Console:** Project `cricket-proo` -> APIs & Services -> Credentials -> OAuth 2.0 Web Client ID -> Authorized JavaScript origins -> Add your `https://*.vercel.app` production domain.
5. **Verify `/profile`:**
   Visit `https://<your-domain>/profile`. The configuration warning banner will disappear, and Google Sign-In and Firestore Sync will be active.
