'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

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
    back: 'Back',

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
    auto_cloud_backup: 'Automatic Cloud Backup & Sync',
    auto_backup_active: 'Cloud Backup Active',
    auto_backup_desc: 'All matches, scores, squads, tournaments, and venues are automatically backed up to your cloud account and synchronized across devices in the background.',
    synced_items: 'Synchronized Items',
    venues_count: 'Venues & Grounds',
    last_sync_time: 'Last Automatic Sync',
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

    // Opening Players & Match Setup
    select_opening_players: 'Select Opening Players',
    opening_players: 'Opening Players',
    striker_batsman: 'Striker Batsman',
    takes_strike: 'Takes Strike',
    non_striker_batsman: 'Non-Striker Batsman',
    opening_bowler: 'Opening Bowler',
    match_details_summary: 'Match Details Summary',
    match_details: 'Match Details',
    better_tools: 'Better Tools',
    better_cricket: 'Better Cricket',
    total_match_overs: 'Total Match Overs',
    toss_result: 'Toss Result',
    ground_venue: 'Ground Venue',
    quick_squad_pick: 'Quick Squad Pick',
    start_live_scoring: 'Start Live Scoring',
    start_target_chase: 'Start Target Chase Scoring',
    starting_match: 'Starting Match...',
    first_innings: '1st Innings',
    second_innings: '2nd Innings',
    batting: 'Batting',
    bowling: 'Bowling',

    // Sync Indicator Modal (F4-i18n)
    sync_status_offline_label: 'Offline (Saved Locally)',
    sync_status_offline_desc: 'Working offline. Scoring and match events are saved immediately to IndexedDB and will sync automatically when connected.',
    sync_status_syncing_label: 'Syncing Changes...',
    sync_status_syncing_desc: 'Synchronizing pending match updates and scorecards with the cloud backend.',
    sync_one_change_pending: '1 Change Pending',
    sync_changes_pending_suffix: 'Changes Pending',
    sync_pending_desc: 'scoring operation(s) queued safely in local outbox waiting for server acknowledgment.',
    sync_status_synced_ready_label: 'Offline Ready • Synced',
    sync_status_synced_label: 'Cloud Synced',
    sync_status_synced_ready_desc: 'Application is 100% prepared for offline scoring. All data is backed up.',
    sync_status_synced_desc: 'All local scoring data and match records are backed up in the cloud.',
    sync_status_error_label: 'Sync Retrying',
    sync_status_error_desc: 'Transient network error. Automatic retry scheduled with backoff.',
    sync_preparing_offline_label: 'Preparing Offline',
    sync_setup_default_desc: 'Caching application shell and storing starter squads for offline use.',
    sync_setup_incomplete_label: 'Offline Setup Incomplete',
    sync_setup_incomplete_desc: 'Essential offline resources could not be cached. Click to retry setup.',
    sync_storage_status: 'Sync & Storage Status',
    sync_modal_subtitle: 'Enterprise Offline-First',
    sync_close_panel: 'Close Information Panel',
    sync_network_adapter: 'Network Adapter:',
    sync_connected: 'Connected',
    sync_disconnected: 'Disconnected',
    sync_pending_outbox: 'Pending Outbox:',
    sync_operation_one: 'operation',
    sync_operations: 'operations',
    sync_last_acknowledged: 'Last Acknowledged:',
    sync_indexeddb_storage: 'IndexedDB Storage:',
    sync_persisted: 'Persisted',
    sync_best_effort: 'Best-Effort',
    sync_mb_used_of: 'MB used of',
    sync_mb_limit: 'MB limit',
    sync_storage_monitoring: 'Offline database active (monitoring quota)',
    sync_low_space: 'Low storage space — consider exporting a backup.',
    sync_offline_readiness: 'Offline Readiness:',
    sync_verified_ready: 'Verified & Ready',
    sync_incomplete: 'Incomplete',
    sync_readiness_ready_desc: 'App shell, starter squads, and match engine are locally stored for offline use.',
    sync_readiness_preparing_desc: 'Connecting to prepare offline resources.',
    sync_retrying_setup: 'Retrying Setup...',
    sync_retry_setup: 'Retry Offline Setup',
    sync_apply_update: 'Apply App Update',
    sync_apply_update_after_match: 'Apply App Update After This Match',
    sync_update_ready: 'Update Ready',
    sync_apply: 'Apply',
    sync_applies_after_match: 'Applies after this match — your data is safe.',
    sync_click_for_details: 'Click to toggle details',

    // Offline Page (F4-i18n)
    offline_support_badge: 'Offline Support',
    offline_mode_active: 'Offline Mode Active',
    offline_mode_desc: 'You are currently working offline. All match scoring, history, teams, and tournament features continue to work locally and will synchronize automatically when your connection returns.',
    offline_go_dashboard: 'Go to Dashboard',
    offline_start_new_match: 'Start New Match',
    offline_tourneys: 'Tourneys',
    offline_try_reconnecting: 'Try Reconnecting',
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
    back: 'পেছনে',

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
    auto_cloud_backup: 'স্বয়ংক্রিয় ক্লাউড ব্যাকআপ ও সিঙ্ক',
    auto_backup_active: 'ক্লাউড ব্যাকআপ সক্রিয়',
    auto_backup_desc: 'সমস্ত ম্যাচ, স্কোর, স্কোয়াড, টুর্নামেন্ট এবং ভেন্যু স্বয়ংক্রিয়ভাবে আপনার অ্যাকাউন্টে ব্যাকআপ হয় এবং ডিভাইসের মধ্যে ব্যাকগ্রাউন্ডে সিঙ্ক হয়।',
    synced_items: 'সিঙ্ক করা আইটেম',
    venues_count: 'মাঠ ও ভেন্যুসমূহ',
    last_sync_time: 'সর্বশেষ স্বয়ংক্রিয় সিঙ্ক',
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

    // Opening Players & Match Setup
    select_opening_players: 'ওপেনিং খেলোয়াড় নির্বাচন',
    opening_players: 'ওপেনিং খেলোয়াড়',
    striker_batsman: 'স্ট্রাইকার ব্যাটসম্যান',
    takes_strike: 'স্ট্রাইক নিচ্ছেন',
    non_striker_batsman: 'নন-স্ট্রাইকার ব্যাটসম্যান',
    opening_bowler: 'ওপেনিং বোলার',
    match_details_summary: 'ম্যাচ সারসংক্ষেপ',
    match_details: 'ম্যাচের বিবরণ',
    better_tools: 'সেরা টুলস',
    better_cricket: 'সেরা ক্রিকেট',
    total_match_overs: 'মোট ম্যাচ ওভার',
    toss_result: 'টসের ফলাফল',
    ground_venue: 'খেলার মাঠ / ভেন্যু',
    quick_squad_pick: 'স্কোয়াড থেকে দ্রুত নির্বাচন',
    start_live_scoring: 'লাইভ স্কোরিং শুরু করুন',
    start_target_chase: 'টার্গেট চেজ শুরু করুন',
    starting_match: 'ম্যাচ শুরু হচ্ছে...',
    first_innings: '১ম ইনিংস',
    second_innings: '২য় ইনিংস',
    batting: 'ব্যাটিং',
    bowling: 'বোলিং',

    // Sync Indicator Modal (F4-i18n)
    sync_status_offline_label: 'অফলাইন (লোকালি সংরক্ষিত)',
    sync_status_offline_desc: 'অফলাইনে কাজ চলছে। স্কোরিং ও ম্যাচের ইভেন্টগুলো সাথে সাথে IndexedDB-তে সংরক্ষিত হচ্ছে এবং সংযোগ ফিরলে স্বয়ংক্রিয়ভাবে সিঙ্ক হবে।',
    sync_status_syncing_label: 'পরিবর্তন সিঙ্ক হচ্ছে...',
    sync_status_syncing_desc: 'অপেক্ষমাণ ম্যাচ আপডেট ও স্কোরকার্ড ক্লাউড ব্যাকএন্ডের সাথে সিঙ্ক করা হচ্ছে।',
    sync_one_change_pending: '১টি পরিবর্তন অপেক্ষমাণ',
    sync_changes_pending_suffix: 'টি পরিবর্তন অপেক্ষমাণ',
    sync_pending_desc: 'টি স্কোরিং অপারেশন লোকাল আউটবক্সে নিরাপদে সারিবদ্ধ আছে, সার্ভারের স্বীকৃতির অপেক্ষায়।',
    sync_status_synced_ready_label: 'অফলাইন প্রস্তুত • সিঙ্ক সম্পন্ন',
    sync_status_synced_label: 'ক্লাউডে সিঙ্ক সম্পন্ন',
    sync_status_synced_ready_desc: 'অ্যাপ্লিকেশনটি অফলাইন স্কোরিংয়ের জন্য ১০০% প্রস্তুত। সমস্ত ডেটা ব্যাকআপ করা আছে।',
    sync_status_synced_desc: 'সমস্ত লোকাল স্কোরিং ডেটা ও ম্যাচ রেকর্ড ক্লাউডে ব্যাকআপ করা আছে।',
    sync_status_error_label: 'সিঙ্ক পুনরায় চেষ্টা হচ্ছে',
    sync_status_error_desc: 'সাময়িক নেটওয়ার্ক ত্রুটি। ব্যাকঅফসহ স্বয়ংক্রিয় পুনঃচেষ্টা নির্ধারিত হয়েছে।',
    sync_preparing_offline_label: 'অফলাইন প্রস্তুত হচ্ছে',
    sync_setup_default_desc: 'অফলাইন ব্যবহারের জন্য অ্যাপ্লিকেশন শেল ও প্রাথমিক স্কোয়াড ক্যাশ করা হচ্ছে।',
    sync_setup_incomplete_label: 'অফলাইন সেটআপ অসম্পূর্ণ',
    sync_setup_incomplete_desc: 'প্রয়োজনীয় অফলাইন রিসোর্স ক্যাশ করা যায়নি। সেটআপ আবার চেষ্টা করতে ক্লিক করুন।',
    sync_storage_status: 'সিঙ্ক ও স্টোরেজ অবস্থা',
    sync_modal_subtitle: 'এন্টারপ্রাইজ অফলাইন-ফার্স্ট',
    sync_close_panel: 'তথ্য প্যানেল বন্ধ করুন',
    sync_network_adapter: 'নেটওয়ার্ক অ্যাডাপ্টার:',
    sync_connected: 'সংযুক্ত',
    sync_disconnected: 'সংযোগ বিচ্ছিন্ন',
    sync_pending_outbox: 'অপেক্ষমাণ আউটবক্স:',
    sync_operation_one: 'অপারেশন',
    sync_operations: 'অপারেশন',
    sync_last_acknowledged: 'সর্বশেষ স্বীকৃত:',
    sync_indexeddb_storage: 'IndexedDB স্টোরেজ:',
    sync_persisted: 'স্থায়ীভাবে সংরক্ষিত',
    sync_best_effort: 'যথাসাধ্য (Best-Effort)',
    sync_mb_used_of: 'MB ব্যবহৃত, মোট',
    sync_mb_limit: 'MB সীমা',
    sync_storage_monitoring: 'অফলাইন ডেটাবেস সক্রিয় (কোটা পর্যবেক্ষণ চলছে)',
    sync_low_space: 'স্টোরেজ প্রায় পূর্ণ — একটি ব্যাকআপ এক্সপোর্ট করার কথা ভাবুন।',
    sync_offline_readiness: 'অফলাইন প্রস্তুতি:',
    sync_verified_ready: 'যাচাইকৃত ও প্রস্তুত',
    sync_incomplete: 'অসম্পূর্ণ',
    sync_readiness_ready_desc: 'অ্যাপ শেল, প্রাথমিক স্কোয়াড এবং ম্যাচ ইঞ্জিন অফলাইন ব্যবহারের জন্য লোকালি সংরক্ষিত আছে।',
    sync_readiness_preparing_desc: 'অফলাইন রিসোর্স প্রস্তুত করতে সংযোগ করা হচ্ছে।',
    sync_retrying_setup: 'সেটআপ আবার চেষ্টা হচ্ছে...',
    sync_retry_setup: 'অফলাইন সেটআপ আবার চেষ্টা করুন',
    sync_apply_update: 'অ্যাপ আপডেট প্রয়োগ করুন',
    sync_apply_update_after_match: 'এই ম্যাচের পরে অ্যাপ আপডেট প্রয়োগ করুন',
    sync_update_ready: 'আপডেট প্রস্তুত',
    sync_apply: 'প্রয়োগ',
    sync_applies_after_match: 'এই ম্যাচের পরে প্রযোজ্য হবে — আপনার ডেটা নিরাপদ।',
    sync_click_for_details: 'বিস্তারিত দেখতে ক্লিক করুন',

    // Offline Page (F4-i18n)
    offline_support_badge: 'অফলাইন সহায়তা',
    offline_mode_active: 'অফলাইন মোড সক্রিয়',
    offline_mode_desc: 'আপনি বর্তমানে অফলাইনে কাজ করছেন। সমস্ত ম্যাচ স্কোরিং, ইতিহাস, দল এবং টুর্নামেন্ট ফিচার লোকালি কাজ করতে থাকবে এবং সংযোগ ফিরলে স্বয়ংক্রিয়ভাবে সিঙ্ক হবে।',
    offline_go_dashboard: 'ড্যাশবোর্ডে যান',
    offline_start_new_match: 'নতুন ম্যাচ শুরু করুন',
    offline_tourneys: 'টুর্নামেন্ট',
    offline_try_reconnecting: 'আবার সংযোগের চেষ্টা করুন',
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

  // F4-11: memoize the provider value (matching the other providers)
  // so consumers don't re-render on unrelated provider renders.
  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage, t }),
    [language, setLanguage, toggleLanguage, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
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
