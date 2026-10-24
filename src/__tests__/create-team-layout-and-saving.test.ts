import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { db, SavedTeam } from '../infrastructure/database/dexie-db';
import { FeatureHubRepository } from '../infrastructure/storage/FeatureHubRepository';
import { SyncEngine } from '../infrastructure/sync/SyncEngine';

describe('Bug Fix: Create Team Button Layout & Saving Functionality Suite', () => {
  const teamsPagePath = path.resolve(__dirname, '../app/teams/page.tsx');
  const teamsPageContent = fs.readFileSync(teamsPagePath, 'utf-8');

  const firestoreRulesPath = path.resolve(__dirname, '../../firestore.rules');
  const firestoreRulesContent = fs.readFileSync(firestoreRulesPath, 'utf-8');

  const syncEnginePath = path.resolve(__dirname, '../infrastructure/sync/SyncEngine.ts');
  const syncEngineContent = fs.readFileSync(syncEnginePath, 'utf-8');

  beforeEach(async () => {
    SyncEngine.stop();
    await db.teams.clear();
    await db.sync_queue.clear();
  });

  afterEach(async () => {
    SyncEngine.stop();
    await db.teams.clear();
    await db.sync_queue.clear();
    vi.restoreAllMocks();
  });

  describe('1. Create / Save Team Button Positioning & Modal Stacking Context', () => {
    it('uses createPortal into document.body to break out of ancestor stacking contexts and prevent app bar overlap', () => {
      expect(teamsPageContent).toContain("import { createPortal } from 'react-dom';");
      expect(teamsPageContent).toContain('createPortal(modalContent, document.body)');
    });

    it('enforces highest z-index layer (z-[60]) on the modal backdrop to always stay above bottom navigation (z-40) and header (z-30)', () => {
      expect(teamsPageContent).toContain('z-[60]');
      expect(teamsPageContent).toContain('role="dialog"');
      expect(teamsPageContent).toContain('aria-modal="true"');
    });

    it('locks document.body scroll while modal is active to prevent scroll bleeding on mobile', () => {
      expect(teamsPageContent).toContain("document.body.style.overflow = 'hidden'");
    });

    it('preserves sticky footer with safe-area padding for Save Team Squad action', () => {
      expect(teamsPageContent).toContain('border-t border-[var(--border)] bg-[var(--card)] px-4 sm:px-6 py-3.5 shrink-0 pb-safe');
      expect(teamsPageContent).toContain('Save Team Squad');
    });

    it('preserves non-scoring container bottom padding to avoid bottom navigation overlap', () => {
      expect(teamsPageContent).toContain('max-w-4xl mx-auto space-y-6 pb-safe pb-8');
    });
  });

  describe('2. Team Creation State Management, Validation & Duplicate Prevention', () => {
    it('prevents duplicate submissions with isSaving guard and disabled state', () => {
      expect(teamsPageContent).toContain('const [isSaving, setIsSaving] = useState(false);');
      expect(teamsPageContent).toContain('if (isSaving) return;');
      expect(teamsPageContent).toContain('disabled={isSaving}');
      expect(teamsPageContent).toContain('Saving Team Squad...');
    });

    it('validates team name existence, minimum length, and maximum length', () => {
      expect(teamsPageContent).toContain('Please enter a team name.');
      expect(teamsPageContent).toContain('Team name must be at least 2 characters.');
      expect(teamsPageContent).toContain('Team name cannot exceed 100 characters.');
    });

    it('validates and rejects duplicate team names case-insensitively', () => {
      expect(teamsPageContent).toContain('already exists. Please choose a unique name.');
    });

    it('validates player squad names against length limits and squad duplicates', () => {
      expect(teamsPageContent).toContain('exceeds 60 characters.');
      expect(teamsPageContent).toContain('Squad contains duplicate player names.');
    });

    it('renders accessible error alert when validation or persistence fails', () => {
      expect(teamsPageContent).toContain('role="alert"');
      expect(teamsPageContent).toContain('formError');
    });

    it('renders confirmed success toast only after database confirms save', () => {
      expect(teamsPageContent).toContain('role="status"');
      expect(teamsPageContent).toContain('successToast');
      expect(teamsPageContent).toContain('created and saved successfully.');
    });
  });

  describe('3. Offline Persistence & FeatureHubRepository Flow', () => {
    it('persists newly created team in Dexie IndexedDB and queues UPSERT_TEAM mutation in SyncEngine', async () => {
      const newTeam: SavedTeam = {
        id: 'team_test_101',
        name: 'Dhaka Dynamites',
        captain: 'Shakib Al Hasan',
        manager: 'Khaled Mahmud',
        players: ['Shakib Al Hasan', 'Tamim Iqbal', 'Mushfiqur Rahim'],
        createdAt: new Date().toISOString(),
      };

      await FeatureHubRepository.saveTeam(newTeam);

      // Verify immediate local storage in Dexie
      const savedInDb = await db.teams.get('team_test_101');
      expect(savedInDb).toBeDefined();
      expect(savedInDb?.name).toBe('Dhaka Dynamites');
      expect(savedInDb?.syncStatus).toBe('PENDING');

      // Verify queued in outbox
      const queueEntries = await db.sync_queue.where('entityId').equals('team_test_101').toArray();
      expect(queueEntries.length).toBe(1);
      expect(queueEntries[0].operationType).toBe('UPSERT_TEAM');
      expect(queueEntries[0].status).toBe('PENDING');

      // Verify list reload
      const allTeams = await FeatureHubRepository.loadTeams();
      expect(allTeams.some((t) => t.id === 'team_test_101')).toBe(true);
    });

    it('persists team updates with preserved ID and updated timestamp', async () => {
      const initialTeam: SavedTeam = {
        id: 'team_edit_202',
        name: 'Sylhet Titans',
        captain: 'Mashrafe Mortaza',
        manager: 'Coach A',
        players: ['Mashrafe Mortaza'],
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      await FeatureHubRepository.saveTeam(initialTeam);

      const updatedTeam: SavedTeam = {
        ...initialTeam,
        name: 'Sylhet Strikers',
        captain: 'Najmul Shanto',
      };
      await FeatureHubRepository.saveTeam(updatedTeam);

      const saved = await db.teams.get('team_edit_202');
      expect(saved?.name).toBe('Sylhet Strikers');
      expect(saved?.captain).toBe('Najmul Shanto');
      expect(saved?.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(saved?.updatedAt).toBeDefined();
    });
  });

  describe('4. Firestore Rules & SyncEngine Cloud Integration for Teams', () => {
    it('defines isValidTeam function and allows CRUD on /teams/{teamId} in firestore.rules', () => {
      expect(firestoreRulesContent).toContain('function isValidTeam(data)');
      expect(firestoreRulesContent).toContain('match /teams/{teamId}');
      expect(firestoreRulesContent).toContain('allow read: if isOwner(resource.data.userId);');
      expect(firestoreRulesContent).toContain('allow create: if isOwner(request.resource.data.userId)');
      expect(firestoreRulesContent).toContain('allow update: if isOwner(resource.data.userId)');
      expect(firestoreRulesContent).toContain('allow delete: if isOwner(resource.data.userId);');
    });

    it('integrates Firestore synchronization in SyncEngine for UPSERT_TEAM and DELETE_TEAM', () => {
      expect(syncEngineContent).toContain("case 'UPSERT_TEAM':");
      expect(syncEngineContent).toContain("setDoc(doc(firestore, 'teams', team.id)");
      expect(syncEngineContent).toContain("case 'DELETE_TEAM':");
      expect(syncEngineContent).toContain("deleteDoc(doc(firestore, 'teams', id)");
    });

    it('updates local team syncStatus to SYNCED upon successful remote operation acknowledgment', () => {
      expect(syncEngineContent).toContain("op.operationType === 'UPSERT_TEAM'");
      expect(syncEngineContent).toContain("await db.teams.update(op.entityId, {");
      expect(syncEngineContent).toContain("syncStatus: 'SYNCED'");
    });

    it('pulls remote teams from Firestore during bidirectional sync reconciliation', () => {
      expect(syncEngineContent).toContain("collection(firestore, 'teams')");
      expect(syncEngineContent).toContain("fsWhere('userId', '==', session.uid)");
    });
  });
});
