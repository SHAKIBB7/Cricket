# Cricket Application Architecture & Security Specification

## Overview

This document provides a comprehensive overview of the Cricket Scorer Pro architecture, with specific emphasis on its **Offline-First Synchronization Engine**, **Unified Authentication & Identity Bridging**, and **Multi-Layer Security Model**.

---

## 1. System Architecture

```mermaid
graph TB
    subgraph Client ["Client Layer (Browser / PWA)"]
        UI["UI / Scoreboard / Modals"]
        DexieDB["IndexedDB (Dexie.js)<br/>• matches<br/>• match_events<br/>• teams<br/>• sync_queue (Outbox)"]
        AuthCtx["Auth Context & State"]
        SyncCtx["Sync Context & State"]
    end
    
    subgraph Logic ["Business Logic Layer"]
        MatchEngine["EventSourcedMatchEngine"]
        SyncEngine["SyncEngine (Durable Outbox FIFO)"]
        AuthService["FirebaseAuthService (Sanitized Errors)"]
        DriveService["GoogleDriveService (Ephemeral 5-min TTL)"]
    end
    
    subgraph Security ["Identity & Access Control Layer"]
        FirebaseToken["Firebase Auth ID Token (JWT)"]
        TokenBridge["Identity Bridge (Bearer JWT Header)"]
        FirestoreRules["Cloud Firestore Security Rules<br/>• users/{uid}<br/>• matches/{id} (Strict Schema)"]
        SupabaseRLS["Supabase Row-Level Security<br/>• requesting_user_id()<br/>• public_matches View"]
    end
    
    subgraph Cloud ["Cloud Persistence"]
        FirestoreDB["Cloud Firestore"]
        SupabaseDB["PostgreSQL / Supabase"]
        GoogleDrive["Google Drive API (drive.file)"]
    end
    
    UI -->|Ball Actions| MatchEngine
    MatchEngine -->|Save Offline First| DexieDB
    MatchEngine -->|Enqueue Mutation| SyncEngine
    SyncEngine -->|Queue in IndexedDB| DexieDB
    
    AuthCtx -->|Sign In / Out| AuthService
    AuthService -->|Verified Identity| FirebaseToken
    
    SyncEngine -->|Verify Identity Session| FirebaseToken
    SyncEngine -->|If Valid & Configured| FirestoreDB
    FirebaseToken -->|Attach Bearer Token| TokenBridge
    TokenBridge -->|Authorized Requests| SupabaseDB
    
    FirestoreDB -.->|Enforced by| FirestoreRules
    SupabaseDB -.->|Enforced by| SupabaseRLS
    
    UI -->|Backup Request| DriveService
    DriveService -->|Incremental Consent| GoogleDrive
```

---

## 2. Authentication & Cloud Sync Request Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as User Interface
    participant DB as IndexedDB (Dexie)
    participant Sync as SyncEngine
    participant Auth as Firebase Auth
    participant Supa as Supabase (RLS)
    participant FS as Cloud Firestore (Rules)

    User->>UI: Score ball or update match
    UI->>DB: Save local match & events
    UI->>Sync: queueMutation('UPSERT_MATCH', payload)
    Sync->>DB: Put in sync_queue (status: PENDING)
    
    alt User is Offline or Unauthenticated
        Sync->>Sync: checkServerReachability() / getAuthenticatedSession()
        Note over Sync,DB: Identity unverified (guest/offline) -> Sync pauses.<br/>Mutations safely remain queued in IndexedDB.
    else User is Authenticated (Firebase / Supabase)
        Sync->>Auth: user.getIdToken()
        Auth-->>Sync: Cryptographically signed JWT
        Sync->>Supa: getSupabaseClient(token).upsert(match)
        Note over Supa: RLS verifies COALESCE(auth.jwt()->>'sub', auth.uid()::text) == user_id
        Supa-->>Sync: 200 OK (Acknowledged)
        
        opt Firebase Configured
            Sync->>FS: setDoc(matches/{id}, scorecard_data)
            Note over FS: Firestore Rules verify isOwner(userId) & isValidMatch(data)
            FS-->>Sync: 200 OK
        end
        
        Sync->>DB: delete(clientOpId) from sync_queue
        Sync->>DB: update(matchId, syncStatus: 'SYNCED')
        Sync->>UI: Notify state change (SYNCED)
    end
```

---

## 3. Core Security Pillars

### A. Unified Identity & RLS Bridging
- **No Unverified Assumptions**: `SyncEngine` never assumes a Firebase UID is equivalent to Supabase `auth.uid()` without cryptographic verification.
- **Token Passing**: Signed JWT ID tokens (`auth.currentUser.getIdToken()`) are transmitted via the `Authorization: Bearer <token>` header to Supabase REST endpoints.
- **Supabase RLS Function**: The PostgreSQL helper `public.requesting_user_id()` evaluates `COALESCE(auth.jwt() ->> 'sub', auth.uid()::text)`. If unauthenticated, it returns `NULL`, rejecting write attempts and preventing client spoofing.
- **Offline Preservation**: If identity is unverified, synchronization is halted. Mutations remain securely queued in IndexedDB (`db.sync_queue`) until authentication is established.

### B. Firestore Match Security Rules (`firestore.rules`)
- **Strict Schema Validation (`isValidMatch`)**: Enforces required field existence (`id`, `userId`, `teamA`, `teamB`, `totalOvers`, `status`, `currentInnings`, `isPublic`, `createdAt`, `updatedAt`) and an exact key whitelist.
- **Type & Size Bounds**: Validates types, string lengths (teams <= 100, venue <= 200, result <= 500), integer bounds (totalOvers 1-100, currentInnings 1-4, targetScore 0-5000), and caps scorecard payloads (<= 1MB).
- **Immutable Attributes**: `userId` (ownership), `id`, and `createdAt` are immutable on updates. Ownership cannot be transferred.
- **Isolated Deletes**: Only the document owner can delete matches.
- **Public Spectator Access**: Read access allows `resource.data.isPublic == true` for spectators or `request.auth.uid == resource.data.userId` for private matches.

### C. Supabase Spectator Privacy & Public View
- **Dedicated View (`public_matches`)**: Spectators and broadcast widgets read from `public.public_matches`, which exposes match details and scorecard data while omitting the owner's private `user_id`.
- **All Tables Protected**: Row-Level Security is strictly enabled on `matches`, `teams`, `tournaments`, and `grounds`.

### D. Authentication Error Sanitization & Email Enumeration Mitigation
- **Anti-Enumeration Login**: `auth/user-not-found`, `auth/wrong-password`, `auth/invalid-credential`, and `auth/invalid-login-credentials` return identical user messages: `"Invalid email or password. Please verify your credentials and try again."`
- **Anti-Enumeration Password Reset**: `sendPasswordReset` returns generic success if an email is not found, preventing attackers from probing registered email addresses.
- **Redacted Errors**: Unknown SDK errors return a generic message (`"An unexpected authentication error occurred. Please try again later."`) and never expose internal URLs, network diagnostics, or credentials.
- **Log Sanitation**: Sensitive parameters (passwords, tokens, API keys) are strictly excluded from console logs.

### E. Google Drive Token Lifecycle & Boundaries
- **Ephemeral TTL**: Access tokens are held in-memory with a strict 5-minute maximum lifetime (`MAX_EPHEMERAL_TTL_MS`), after which they are purged.
- **Automatic Purging**: Tokens are cleared on expiry, upon receiving an HTTP 401 response, on user sign-out (`FirebaseAuthService.signOutUser`), or via explicit revocation (`GoogleDriveService.revokeAccessToken`).
- **Token Separation**: `GoogleDriveAuthSpec.assertTokenSeparation` verifies token format and explicitly rejects Firebase Auth ID tokens / JWTs, preventing cross-token confusion.
- **Least Privilege**: Restricted to `https://www.googleapis.com/auth/drive.file`.
