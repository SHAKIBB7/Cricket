'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type Language = 'en' | 'bn';

export const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    // Navigation
    home: 'Home',
    new_match: 'New Match',
    matches: 'Matches',
    tournaments: 'Tournaments',
    teams: 'Teams',
    analytics: 'Analytics',
    profile: 'Sync & Profile',
    scoreboard: 'SCOREBOARD',

    // Scoring Pad
    undo: 'Undo',
    swap_strike: 'Swap Strike',
    retire: 'Retire',
    penalty: 'Penalty',
    wide: 'Wide',
    no_ball: 'No Ball',
    bye: 'Byes',
    leg_bye: 'Leg Byes',
    out: 'OUT',
    change_bowler: 'Change Bowler',
    free_hit: 'FREE HIT',

    // Stats & Headers
    overs: 'Overs',
    target: 'Target',
    need: 'Need',
    runs: 'Runs',
    wickets: 'Wickets',
    balls: 'balls',
    crr: 'CRR',
    rrr: 'RRR',
    striker: 'Striker',
    non_striker: 'Non-Striker',
    bowler: 'Bowler',
    this_over: 'This Over',
    partnership: 'Partnership',
    venue: 'Venue',

    // Modals & Actions
    record_wicket: 'Record Wicket',
    select_bowler: 'Select Bowler',
    incoming_batter: 'Incoming Batter',
    delivery_type: 'Delivery Type',
    download_pdf: 'Download PDF Scorecard',
    full_scoreboard: 'View Full Scoreboard',
    share_match: 'Share Match',
    view_standings: 'View Standings',
    match_completed: 'Match Completed',
    match_tied: 'Match Tied',
    man_of_the_match: 'Player of the Match',

    // Theme & Language
    light_mode: 'Light',
    dark_mode: 'Dark',
    language: 'English',
    switch_lang: 'বাংলা',

    // Account & Profile
    account_profile: 'Account & Profile',
    account_subtitle: 'Manage your profile, cloud sync, and data backups',
    network_online: 'Online',
    network_offline: 'Offline',
    pro_account: 'Pro Account',
    pro_active: 'Pro Active',
    email_account: 'Email Account',
    guest_account: 'Guest Account',
    guest_desc: 'Operating in local offline storage on this device',
    export_restore_desc: 'Export or restore your data',
    edit_name: 'Edit display name',
    save: 'Save',
    cancel: 'Cancel',
    copy_uid: 'Copy UID',
    copied: 'Copied!',
    sign_out: 'Sign Out',
    sign_in: 'Sign In',
    create_account: 'Create Account',
    local_matches: 'Local Matches',
    saved_squads: 'Saved Squads',
    tournaments_count: 'Tournaments',
    pending_sync: 'Pending Sync',
    cloud_sync: 'Cloud Synchronization',
    cloud_sync_desc: 'Durable outbox queue with automatic cloud sync',
    sync_now: 'Sync Now',
    syncing: 'Syncing...',
    synced: 'Synced',
    partial_sync: 'Partial Sync',
    sync_failed: 'Sync Failed',
    google_drive_backup: 'Google Drive Cloud Backup',
    google_drive_desc: 'Save snapshots directly to your personal Google Drive',
    backup_to_drive: 'Backup to Google Drive',
    manage_backups: 'Manage Backups / Restore',
    last_cloud_backup: 'Last Cloud Backup',
    never_backed_up: 'Never backed up',
    data_portability: 'Data Backup & Portability',
    data_portability_desc: 'Export or import your full database as a portable JSON file',
    export_json: 'Export JSON Backup',
    import_json: 'Import JSON Backup',
    danger_zone: 'Danger Zone',
    danger_zone_desc: 'Clear local database and reset offline storage',
    danger_zone_details: 'This will permanently delete all local matches, squads, tournaments, and pending sync queue items stored in IndexedDB.',
    dev_diagnostics: 'System & Developer Diagnostics',
    edit_profile: 'Edit Profile',
    change_photo: 'Change Photo',
    avatar_selection: 'Choose Avatar or Upload',
    upload_photo: 'Upload Photo',
    remove_photo: 'Remove Photo',
    photo_too_large: 'Image size must be less than 2MB.',
    email_verified: 'Verified',
    email_unverified: 'Unverified',
    send_verification: 'Verify Email',
    verification_sent: 'Verification email sent. Please check your inbox.',
    reset_password: 'Reset Password',
    preferences: 'Preferences & Display',
    theme_appearance: 'Theme Appearance',
    sunlight_mode: 'Sunlight (Match Day)',
    copy_diagnostics: 'Copy Diagnostics',
    diagnostics_copied: 'Diagnostics copied to clipboard!',
    quick_navigation: 'Quick Navigation',
    view_all_matches: 'View Matches',
    view_all_squads: 'View Squads',
    view_all_tournaments: 'View Tournaments',
  },
  bn: {
    // Navigation
    home: 'হোম',
    new_match: 'নতুন ম্যাচ',
    matches: 'ম্যাচসমূহ',
    tournaments: 'টুর্নামেন্ট',
    teams: 'দলসমূহ',
    analytics: 'পরিসংখ্যান',
    profile: 'প্রোফাইল ও সিঙ্ক',
    scoreboard: 'স্কোরবোর্ড',

    // Scoring Pad
    undo: 'পূর্বাবস্থায় (Undo)',
    swap_strike: 'স্ট্রাইক পরিবর্তন',
    retire: 'রিটায়ার',
    penalty: 'পেনাল্টি',
    wide: 'ওয়াইড',
    no_ball: 'নো বল',
    bye: 'বাই (Bye)',
    leg_bye: 'লেগ বাই (LB)',
    out: 'আউট',
    change_bowler: 'বোলার পরিবর্তন',
    free_hit: 'ফ্রি হিট',

    // Stats & Headers
    overs: 'ওভার',
    target: 'টার্গেট',
    need: 'প্রয়োজন',
    runs: 'রান',
    wickets: 'উইকেট',
    balls: 'বল',
    crr: 'সিআরআর (CRR)',
    rrr: 'আরআরআর (RRR)',
    striker: 'স্ট্রাইকার',
    non_striker: 'নন-স্ট্রাইকার',
    bowler: 'বোলার',
    this_over: 'চলতি ওভার',
    partnership: 'পার্টনারশিপ',
    venue: 'ভেন্যু / মাঠ',

    // Modals & Actions
    record_wicket: 'উইকেট রেকর্ড করুন',
    select_bowler: 'বোলার নির্বাচন করুন',
    incoming_batter: 'পরবর্তী ব্যাটসম্যান',
    delivery_type: 'ডেলিভারির ধরন',
    download_pdf: 'পিডিএফ ডাউনলোড',
    full_scoreboard: 'পূর্ণ স্কোরবোর্ড দেখুন',
    share_match: 'ম্যাচ শেয়ার করুন',
    view_standings: 'পয়েন্ট টেবিল দেখুন',
    match_completed: 'ম্যাচ সমাপ্ত',
    match_tied: 'ম্যাচ টাই',
    man_of_the_match: 'ম্যান অব দ্য ম্যাচ',

    // Theme & Language
    light_mode: 'লাইট',
    dark_mode: 'ডার্ক',
    language: 'বাংলা',
    switch_lang: 'English',

    // Account & Profile
    account_profile: 'অ্যাকাউন্ট ও প্রোফাইল',
    account_subtitle: 'প্রোফাইল, ক্লাউড সিঙ্ক এবং ব্যাকআপ ব্যবস্থাপনা',
    network_online: 'অনলাইন',
    network_offline: 'অফলাইন',
    pro_account: 'প্রো অ্যাকাউন্ট',
    pro_active: 'প্রো অ্যাক্টিভ',
    email_account: 'ইমেইল অ্যাকাউন্ট',
    guest_account: 'গেস্ট অ্যাকাউন্ট',
    guest_desc: 'এই ডিভাইসে স্থানীয় স্টোরেজে সংরক্ষিত হচ্ছে',
    export_restore_desc: 'ডেটা এক্সপোর্ট বা রিস্টোর করুন',
    edit_name: 'নাম পরিবর্তন করুন',
    save: 'সংরক্ষণ',
    cancel: 'বাতিল',
    copy_uid: 'UID কপি করুন',
    copied: 'কপি হয়েছে!',
    sign_out: 'সাইন আউট',
    sign_in: 'সাইন ইন',
    create_account: 'নতুন অ্যাকাউন্ট তৈরি',
    local_matches: 'স্থানীয় ম্যাচ',
    saved_squads: 'সংরক্ষিত দল',
    tournaments_count: 'টুর্নামেন্ট',
    pending_sync: 'অপেক্ষমাণ সিঙ্ক',
    cloud_sync: 'ক্লাউড সিঙ্ক্রোনাইজেশন',
    cloud_sync_desc: 'স্বয়ংক্রিয় ক্লাউড সিঙ্কসহ অফলাইন আউটবক্স কিউ',
    sync_now: 'এখনই সিঙ্ক করুন',
    syncing: 'সিঙ্ক হচ্ছে...',
    synced: 'সিঙ্ক সম্পন্ন',
    partial_sync: 'আংশিক সিঙ্ক',
    sync_failed: 'সিঙ্ক ব্যর্থ',
    google_drive_backup: 'গুগল ড্রাইভ ক্লাউড ব্যাকআপ',
    google_drive_desc: 'ব্যক্তিগত গুগল ড্রাইভে সম্পূর্ণ ডেটার ব্যাকআপ সংরক্ষণ করুন',
    backup_to_drive: 'গুগল ড্রাইভে ব্যাকআপ নিন',
    manage_backups: 'ব্যাকআপ ও রিস্টোর পরিচালনা',
    last_cloud_backup: 'সর্বশেষ ক্লাউড ব্যাকআপ',
    never_backed_up: 'কোনো ব্যাকআপ নেই',
    data_portability: 'ডেটা ব্যাকআপ ও পোর্টেবিলিটি',
    data_portability_desc: 'সম্পূর্ণ ডেটাবেস JSON ফাইল হিসেবে এক্সপোর্ট বা ইমপোর্ট করুন',
    export_json: 'JSON ব্যাকআপ এক্সপোর্ট',
    import_json: 'JSON ব্যাকআপ ইমপোর্ট',
    danger_zone: 'বিপদজনক অঞ্চল (Danger Zone)',
    danger_zone_desc: 'স্থানীয় ডেটাবেস সম্পূর্ণ মুছে ফেলুন',
    danger_zone_details: 'এটি IndexedDB-তে সংরক্ষিত সকল স্থানীয় ম্যাচ, দল, টুর্নামেন্ট এবং সিঙ্ক কিউ স্থায়ীভাবে মুছে ফেলবে।',
    dev_diagnostics: 'সিস্টেম ও ডেভেলপার ডায়াগনস্টিকস',
    edit_profile: 'প্রোফাইল সম্পাদন',
    change_photo: 'ছবি পরিবর্তন',
    avatar_selection: 'অ্যাভাটার নির্বাচন বা আপলোড',
    upload_photo: 'ছবি আপলোড',
    remove_photo: 'ছবি মুছে ফেলুন',
    photo_too_large: 'ছবির সাইজ ২MB-এর কম হতে হবে।',
    email_verified: 'যাচাইকৃত',
    email_unverified: 'অযাচাইকৃত',
    send_verification: 'ইমেইল যাচাই করুন',
    verification_sent: 'যাচাইকরণ ইমেইল পাঠানো হয়েছে। আপনার ইনবক্স চেক করুন।',
    reset_password: 'পাসওয়ার্ড রিসেট',
    preferences: 'পছন্দসমূহ ও ডিসপ্লে',
    theme_appearance: 'থিমের ধরন',
    sunlight_mode: 'সানলাইট (ম্যাচ ডে)',
    copy_diagnostics: 'ডায়াগনস্টিকস কপি করুন',
    diagnostics_copied: 'ডায়াগনস্টিকস ক্লিপবোর্ডে কপি করা হয়েছে!',
    quick_navigation: 'দ্রুত নেভিগেশন',
    view_all_matches: 'সকল ম্যাচ দেখুন',
    view_all_squads: 'সকল দল দেখুন',
    view_all_tournaments: 'সকল টুর্নামেন্ট দেখুন',
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('preferred_language') as Language;
      if (saved === 'en' || saved === 'bn') {
        setLanguageState(saved);
      }
    } catch {
      // Ignore storage read errors
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('preferred_language', lang);
    } catch {
      // Ignore storage write errors
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => {
      const next: Language = prev === 'en' ? 'bn' : 'en';
      try {
        localStorage.setItem('preferred_language', next);
      } catch {
        // Ignore storage write errors
      }
      return next;
    });
  }, []);

  const t = useCallback(
    (key: string, fallback?: string): string => {
      const text = TRANSLATIONS[language]?.[key];
      if (text !== undefined) return text;
      return fallback !== undefined ? fallback : key;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (!context) {
    // Non-throwing fallback for components rendered outside provider
    return {
      language: 'en',
      setLanguage: () => {},
      toggleLanguage: () => {},
      t: (key: string, fallback?: string) => fallback || key,
    };
  }
  return context;
}
