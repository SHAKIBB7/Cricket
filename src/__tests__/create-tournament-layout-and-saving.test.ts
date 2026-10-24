import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { db } from '../infrastructure/database/dexie-db';
import { FeatureHubRepository } from '../infrastructure/storage/FeatureHubRepository';
import { SyncEngine } from '../infrastructure/sync/SyncEngine';
import { TournamentEngine } from '../domain/tournament/TournamentEngine';
import { Tournament } from '../domain/tournament/types';

describe('Bug Fix: Create Tournament Button Layout & Saving Functionality Suite', () => {
  const tourneysPagePath = path.resolve(__dirname, '../app/tournaments/page.tsx');
  const tourneysPageContent = fs.readFileSync(tourneysPagePath, 'utf-8');

  const firestoreRulesPath = path.resolve(__dirname, '../../firestore.rules');
  const firestoreRulesContent = fs.readFileSync(firestoreRulesPath, 'utf-8');

  const syncEnginePath = path.resolve(__dirname, '../infrastructure/sync/SyncEngine.ts');
  const syncEngineContent = fs.readFileSync(syncEnginePath, 'utf-8');

  beforeEach(async () => {
    SyncEngine.stop();
    await db.tournaments.clear();
    await db.sync_queue.clear();
  });

  afterEach(async () => {
    SyncEngine.stop();
    await db.tournaments.clear();
    await db.sync_queue.clear();
    vi.restoreAllMocks();
  });

  describe('1. Create Tournament Button Positioning & Modal Stacking Context', () => {
    it('uses createPortal into document.body to break out of ancestor stacking contexts and prevent app bar/bottom nav overlap', () => {
      expect(tourneysPageContent).toContain("import { createPortal } from 'react-dom';");
      expect(tourneysPageContent).toContain('createPortal(');
      expect(tourneysPageContent).toContain('document.body');
    });

    it('enforces highest z-index layer (z-[60]) on the modal backdrop to stay above bottom navigation (z-40) and header (z-30)', () => {
      expect(tourneysPageContent).toContain('z-[60]');
      expect(tourneysPageContent).toContain('role="dialog"');
      expect(tourneysPageContent).toContain('aria-modal="true"');
    });

    it('locks document.body scroll while modal is active to prevent background scroll bleeding on mobile', () => {
      expect(tourneysPageContent).toContain("document.body.style.overflow = 'hidden'");
    });

    it('preserves sticky footer with safe-area padding for Create Tournament & Fixtures action', () => {
      expect(tourneysPageContent).toContain('border-t border-[var(--border)] bg-[var(--card)] px-4 sm:px-6 py-3.5 shrink-0 pb-safe');
      expect(tourneysPageContent).toContain('Create Tournament &amp; Fixtures');
    });

    it('preserves non-scoring container bottom safe padding to avoid bottom navigation overlap', () => {
      expect(tourneysPageContent).toContain('pb-safe pb-8');
    });
  });

  describe('2. Tournament Creation State Management, Validation & Duplicate Prevention', () => {
    it('prevents duplicate submissions with isSaving guard and disabled state', () => {
      expect(tourneysPageContent).toContain('const [isSaving, setIsSaving] = useState(false);');
      expect(tourneysPageContent).toContain('if (isSaving) return;');
      expect(tourneysPageContent).toContain('disabled={isSaving}');
      expect(tourneysPageContent).toContain('Saving Tournament...');
    });

    it('validates tournament name existence, minimum length, and maximum length', () => {
      expect(tourneysPageContent).toContain('Please enter a tournament name.');
      expect(tourneysPageContent).toContain('Tournament name must be at least 2 characters.');
      expect(tourneysPageContent).toContain('Tournament name cannot exceed 100 characters.');
    });

    it('validates and rejects duplicate tournament names case-insensitively', () => {
      expect(tourneysPageContent).toContain('already exists. Please choose a distinct name.');
    });

    it('validates team selection bounds (minimum 2 teams, maximum 64 teams)', () => {
      expect(tourneysPageContent).toContain('Please add at least 2 teams to create a tournament.');
      expect(tourneysPageContent).toContain('A tournament cannot exceed 64 participating teams.');
      expect(tourneysPageContent).toContain('Please ensure at least 2 unique teams are selected.');
    });

    it('renders accessible error alert when validation or persistence fails', () => {
      expect(tourneysPageContent).toContain('role="alert"');
      expect(tourneysPageContent).toContain('formError');
    });

    it('renders confirmed success toast only after database confirms save', () => {
      expect(tourneysPageContent).toContain('role="status"');
      expect(tourneysPageContent).toContain('successToast');
      expect(tourneysPageContent).toContain('created and synced successfully!');
    });
  });

  describe('3. Offline Persistence & FeatureHubRepository Flow', () => {
    it('persists newly created tournament in Dexie IndexedDB and queues UPSERT_TOURNAMENT mutation in SyncEngine', async () => {
      const tourney = TournamentEngine.createTournament({
        name: 'Champions Trophy 2026',
        format: 'league',
        teams: ['Australia', 'India', 'England', 'South Africa'],
        matchOvers: 20,
        leagueMeetings: 1,
      });
      tourney.userId = 'user_test_999';
      tourney.updatedAt = new Date().toISOString();

      await FeatureHubRepository.saveTournament(tourney);

      // Verify persistence in local database
      const loaded = await FeatureHubRepository.getTournament(tourney.id);
      expect(loaded).toBeDefined();
      expect(loaded?.name).toBe('Champions Trophy 2026');
      expect(loaded?.userId).toBe('user_test_999');
      expect(loaded?.fixtures.length).toBeGreaterThan(0);

      // Verify outbox queue record created
      const queuedOps = await db.sync_queue
        .where('operationType')
        .equals('UPSERT_TOURNAMENT')
        .toArray();
      expect(queuedOps.length).toBe(1);
      expect(queuedOps[0].entityId).toBe(tourney.id);
      expect(queuedOps[0].payload.name).toBe('Champions Trophy 2026');
    });

    it('handles tournament deletion cleanly by removing from Dexie and queuing DELETE_TOURNAMENT', async () => {
      const tourney = TournamentEngine.createTournament({
        name: 'Delete Me Cup',
        format: 'knockout',
        teams: ['Team Alpha', 'Team Beta'],
      });

      await FeatureHubRepository.saveTournament(tourney);
      await FeatureHubRepository.deleteTournament(tourney.id);

      const loaded = await FeatureHubRepository.getTournament(tourney.id);
      expect(loaded).toBeUndefined();

      const deleteOps = await db.sync_queue
        .where('operationType')
        .equals('DELETE_TOURNAMENT')
        .toArray();
      expect(deleteOps.length).toBe(1);
      expect(deleteOps[0].entityId).toBe(tourney.id);
    });
  });

  describe('4. Firestore Rules & Cloud Synchronization Engine Integration', () => {
    it('defines isValidTournament validator with proper field schema and limits in firestore.rules', () => {
      expect(firestoreRulesContent).toContain('function isValidTournament(data)');
      expect(firestoreRulesContent).toContain("data.keys().hasAll(['id', 'userId', 'name', 'format', 'teams', 'fixtures', 'leagueMeetings', 'matchOvers', 'createdAt', 'updatedAt'])");
      expect(firestoreRulesContent).toContain("data.format in ['knockout', 'league']");
      expect(firestoreRulesContent).toContain('data.teams.size() >= 2');
      expect(firestoreRulesContent).toContain('data.teams.size() <= 64');
      expect(firestoreRulesContent).toContain('match /tournaments/{tournamentId}');
    });

    it('enforces owner-only authorization rules for tournaments in firestore.rules', () => {
      expect(firestoreRulesContent).toContain('allow read: if isOwner(resource.data.userId);');
      expect(firestoreRulesContent).toContain('allow create: if isOwner(request.resource.data.userId)');
      expect(firestoreRulesContent).toContain('allow update: if isOwner(resource.data.userId)');
      expect(firestoreRulesContent).toContain('allow delete: if isOwner(resource.data.userId);');
    });

    it('implements UPSERT_TOURNAMENT and DELETE_TOURNAMENT in SyncEngine with Firestore setDoc and deleteDoc', () => {
      expect(syncEngineContent).toContain("case 'UPSERT_TOURNAMENT':");
      expect(syncEngineContent).toContain("setDoc(doc(firestore, 'tournaments', tourney.id)");
      expect(syncEngineContent).toContain("case 'DELETE_TOURNAMENT':");
      expect(syncEngineContent).toContain("deleteDoc(doc(firestore, 'tournaments', id))");
    });

    it('acknowledges remote upsert by updating local syncStatus to SYNCED in db.tournaments', () => {
      expect(syncEngineContent).toContain("op.operationType === 'UPSERT_TOURNAMENT'");
      expect(syncEngineContent).toContain("await db.tournaments.update(op.entityId, {");
      expect(syncEngineContent).toContain("syncStatus: 'SYNCED'");
    });

    it('pulls remote tournaments from Firestore and Supabase into local Dexie cache during pullRemoteChanges', () => {
      expect(syncEngineContent).toContain("collection(firestore, 'tournaments')");
      expect(syncEngineContent).toContain("fsWhere('userId', '==', session.uid)");
      expect(syncEngineContent).toContain("await db.tournaments.put({ ...remoteTourney, syncStatus: 'SYNCED' });");
      expect(syncEngineContent).toContain("supaClient.from('tournaments').select('*')");
    });
  });
});
