import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import { GoogleDriveBackupSection } from '../components/profile/GoogleDriveBackupSection';
import { LanguageProvider } from '../context/LanguageContext';
import { GoogleDriveService } from '../infrastructure/storage/GoogleDriveService';

describe('Google Drive Backup & Restore UI Component Suite (ISSUE-008)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. GoogleDriveBackupSection Component Rendering', () => {
    it('renders card header, icons, title, and action buttons', () => {
      const html = renderToStaticMarkup(
        <LanguageProvider>
          <GoogleDriveBackupSection
            userUid="user_test_123"
            onRestoreComplete={() => {}}
            onNotify={() => {}}
          />
        </LanguageProvider>
      );

      // Card Header
      expect(html).toContain('Google Drive Archive &amp; Disaster Recovery');
      expect(html).toContain('Create disaster-recovery snapshots and restore your cricket history');

      // Buttons
      expect(html).toContain('Save Snapshot to Drive');
      expect(html).toContain('View Drive Archives');

      // Disaster recovery notice
      expect(html).toContain('Disaster Recovery &amp; Independent Snapshot Archive');
      expect(html).toContain('Google Drive backups are self-contained JSON archives');
    });

    it('renders OAuth notice badge when client ID is not configured', () => {
      vi.spyOn(GoogleDriveService, 'isDriveConfigured').mockReturnValue(false);

      const html = renderToStaticMarkup(
        <LanguageProvider>
          <GoogleDriveBackupSection />
        </LanguageProvider>
      );

      expect(html).toContain('OAuth Client Notice');
    });
  });

  describe('2. ProfilePage Integration Verification', () => {
    const profilePagePath = path.resolve(__dirname, '../app/profile/page.tsx');
    const profilePageContent = fs.readFileSync(profilePagePath, 'utf-8');

    it('verifies GoogleDriveBackupSection is imported in ProfilePage', () => {
      expect(profilePageContent).toContain("import { GoogleDriveBackupSection } from '@/components/profile/GoogleDriveBackupSection';");
    });

    it('verifies GoogleDriveBackupSection is rendered with correct props in ProfilePage', () => {
      expect(profilePageContent).toContain('<GoogleDriveBackupSection');
      expect(profilePageContent).toContain('userUid={user?.uid}');
      expect(profilePageContent).toContain('onRestoreComplete={loadLocalStats}');
      expect(profilePageContent).toContain('onNotify={setFeedbackMessage}');
    });

    it('verifies GoogleDriveBackupSection is positioned before DangerZone', () => {
      const backupIdx = profilePageContent.indexOf('<GoogleDriveBackupSection');
      const dangerZoneIdx = profilePageContent.indexOf('{/* 4. Danger Zone');

      expect(backupIdx).toBeGreaterThan(0);
      expect(dangerZoneIdx).toBeGreaterThan(0);
      expect(backupIdx).toBeLessThan(dangerZoneIdx);
    });
  });

  describe('3. GoogleDriveService Integration Contract', () => {
    it('verifies GoogleDriveService has all methods required by the UI section', () => {
      expect(typeof GoogleDriveService.isDriveConfigured).toBe('function');
      expect(typeof GoogleDriveService.requestAccessToken).toBe('function');
      expect(typeof GoogleDriveService.createBackupPayload).toBe('function');
      expect(typeof GoogleDriveService.uploadBackup).toBe('function');
      expect(typeof GoogleDriveService.listBackups).toBe('function');
      expect(typeof GoogleDriveService.downloadBackup).toBe('function');
      expect(typeof GoogleDriveService.restoreToIndexedDb).toBe('function');
      expect(typeof GoogleDriveService.deleteBackup).toBe('function');
      expect(typeof GoogleDriveService.clearCachedToken).toBe('function');
    });
  });
});
