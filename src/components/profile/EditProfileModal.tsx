'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { UserProfileService } from '@/infrastructure/auth/UserProfileService';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import {
  X,
  Camera,
  Upload,
  Check,
  RefreshCw,
  AlertCircle,
  User as UserIcon,
  Trash2,
  Sparkles,
} from 'lucide-react';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDisplayName: string;
  currentPhotoURL: string | null;
  email: string;
  onSave: (newDisplayName: string, newPhotoURL: string | null) => Promise<void>;
}

// Real, local cricket illustrations available in the project
const CRICKET_AVATAR_PRESETS = [
  { id: 'strike_batsman', name: 'Strike Batter', url: '/assets/illustrations/strike_batsman.png' },
  { id: 'opening_bowler', name: 'Opening Bowler', url: '/assets/illustrations/opening_bowler.png' },
  { id: 'man_of_match', name: 'Match Champion', url: '/assets/illustrations/man_of_match.png' },
  { id: 'chase_batsman', name: 'Chase Master', url: '/assets/illustrations/chase_batsman.png' },
  { id: 'batting_intent', name: 'Power Hitter', url: '/assets/illustrations/batting_intent.png' },
  { id: 'cricket_icon', name: 'Classic Cricket', url: '/assets/icon/cricket.png' },
  { id: 'running', name: 'Athletic Runner', url: '/assets/illustrations/running.png' },
  { id: 'st_bat', name: 'Opening Stance', url: '/assets/illustrations/st_bat.png' },
];

export function EditProfileModal({
  isOpen,
  onClose,
  currentDisplayName,
  currentPhotoURL,
  email,
  onSave,
}: EditProfileModalProps) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nameInput, setNameInput] = useState(currentDisplayName);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(currentPhotoURL);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useModalOverlay({ isOpen, onClose });

  useEffect(() => {
    if (isOpen) {
      setNameInput(currentDisplayName);
      setSelectedPhoto(currentPhotoURL);
      setErrorMessage(null);
    }
  }, [isOpen, currentDisplayName, currentPhotoURL]);

  if (!isOpen) return null;

  const hasChanges =
    nameInput.trim() !== currentDisplayName.trim() || selectedPhoto !== currentPhotoURL;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);

    // Validate size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage(t('photo_too_large', 'Image size must be less than 2MB.'));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Validate MIME type
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setErrorMessage('Please upload a valid image file (PNG, JPG, or WebP).');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsCompressing(true);
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const img = new Image();
      img.onload = () => {
        try {
          // Scale down image to 180x180 square on canvas for fast loading & storage compliance
          const canvas = document.createElement('canvas');
          const maxDim = 180;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            setSelectedPhoto(compressedDataUrl);
          } else {
            setSelectedPhoto(loadEvent.target?.result as string);
          }
        } catch (err) {
          console.warn('Canvas resize failed, using direct data url:', err);
          setSelectedPhoto(loadEvent.target?.result as string);
        } finally {
          setIsCompressing(false);
        }
      };
      img.onerror = () => {
        setErrorMessage('Failed to process image file.');
        setIsCompressing(false);
      };
      img.src = loadEvent.target?.result as string;
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read file from your device.');
      setIsCompressing(false);
    };
    reader.readAsDataURL(file);

    // Reset file input value so same file can be selected again
    e.target.value = '';
  };

  const handleSelectPreset = (url: string) => {
    setSelectedPhoto(url);
    setErrorMessage(null);
  };

  const handleRemovePhoto = () => {
    setSelectedPhoto(null);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || isCompressing) return;
    setErrorMessage(null);

    const validation = UserProfileService.validateDisplayName(nameInput);
    if (!validation.isValid) {
      setErrorMessage(validation.error || 'Invalid display name.');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(validation.normalized, selectedPhoto);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-profile-title"
      className="fixed inset-0 !m-0 bg-black/60 backdrop-blur-xs z-50 overflow-y-auto overscroll-contain flex justify-center items-start sm:items-center p-3 sm:p-4 min-h-full animate-fadeIn"
    >
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl max-w-lg w-full max-h-[calc(100dvh-2rem)] sm:max-h-[88vh] flex flex-col p-4 sm:p-6 shadow-2xl space-y-4 my-auto overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 id="edit-profile-title" className="font-bold text-card-title text-[var(--foreground)]">
                {t('edit_profile', 'Edit Profile')}
              </h2>
              <p className="text-caption text-[var(--muted-foreground)]">
                {email || 'Customize your cricket identity'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-1.5 hover:bg-[var(--muted)] rounded-xl text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors active:scale-95"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 pr-1">
          {/* Error Alert */}
          {errorMessage && (
            <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-xl flex items-start gap-2 text-caption text-red-500">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="font-medium flex-1 break-words">{errorMessage}</span>
            </div>
          )}

          {/* Avatar Hero & Upload Row */}
          <div className="bg-[var(--muted)]/40 border border-[var(--border)] rounded-2xl p-4 flex flex-col sm:flex-row items-center sm:items-start gap-4">
            {/* Circular Preview */}
            <div className="relative group shrink-0">
              <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border-2 border-emerald-500/40 shadow-sm">
                {isCompressing ? (
                  <RefreshCw className="w-7 h-7 text-emerald-500 animate-spin" />
                ) : selectedPhoto ? (
                  <img
                    src={selectedPhoto}
                    alt="Profile Avatar Preview"
                    className="object-cover w-full h-full"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <UserIcon className="w-9 h-9 text-slate-400 stroke-[1.5]" />
                )}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isCompressing || isSaving}
                className="absolute bottom-0 right-0 bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-full shadow-md active:scale-90 transition-transform"
                title={t('upload_photo', 'Upload Photo')}
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Actions & Guidance */}
            <div className="flex-1 min-w-0 text-center sm:text-left space-y-2">
              <div>
                <h3 className="font-semibold text-body-small text-[var(--foreground)]">
                  {t('avatar_selection', 'Profile Picture / Avatar')}
                </h3>
                <p className="text-[12px] text-[var(--muted-foreground)] mt-0.5">
                  Upload an image (PNG, JPG, WebP up to 2MB) or pick a cricket preset below.
                </p>
              </div>

              <div className="flex items-center justify-center sm:justify-start gap-2 pt-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCompressing || isSaving}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-caption font-semibold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{t('upload_photo', 'Upload Image')}</span>
                </button>

                {selectedPhoto && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={isCompressing || isSaving}
                    className="bg-[var(--card)] hover:bg-red-500/10 text-red-500 border border-red-500/30 px-3 py-1.5 rounded-xl text-caption font-semibold flex items-center gap-1.5 active:scale-95 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('remove_photo', 'Remove')}</span>
                  </button>
                )}

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                />
              </div>
            </div>
          </div>

          {/* Cricket Avatar Presets */}
          <div className="space-y-2">
            <label className="block text-caption font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Cricket Avatar Presets
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {CRICKET_AVATAR_PRESETS.map((preset) => {
                const isSelected = selectedPhoto === preset.url;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.url)}
                    className={`relative p-1.5 rounded-xl border flex flex-col items-center justify-center transition-all aspect-square active:scale-95 ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/30'
                        : 'border-[var(--border)] hover:border-emerald-500/50 bg-[var(--card)] hover:bg-[var(--muted)]'
                    }`}
                    title={preset.name}
                  >
                    <img
                      src={preset.url}
                      alt={preset.name}
                      className="w-8 h-8 object-contain pointer-events-none"
                    />
                    {isSelected && (
                      <div className="absolute top-0.5 right-0.5 bg-emerald-600 text-white rounded-full p-0.5 shadow-xs">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Display Name Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-caption">
              <label htmlFor="modal-display-name" className="font-semibold text-[var(--foreground)]">
                {t('edit_name', 'Display Name')}
              </label>
              <span className={`text-[11px] font-mono ${nameInput.length > 50 ? 'text-red-500 font-bold' : 'text-[var(--muted-foreground)]'}`}>
                {nameInput.length} / 50
              </span>
            </div>
            <input
              id="modal-display-name"
              type="text"
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              maxLength={50}
              required
              disabled={isSaving}
              placeholder="Enter your cricket display name"
              className="bg-[var(--card)] border border-[var(--border)] focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 px-3.5 py-2.5 rounded-xl text-body-small outline-none w-full text-[var(--foreground)] transition-all font-medium"
            />
            <p className="text-[11px] text-[var(--muted-foreground)]">
              This name is shown across your match scorecards, PDF match reports, and tournaments.
            </p>
          </div>

          {/* Account Email (Read-Only) */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-caption font-semibold text-[var(--muted-foreground)]">
              Account Email
            </label>
            <input
              type="email"
              value={email}
              readOnly
              disabled
              className="bg-[var(--muted)]/60 border border-[var(--border)] px-3.5 py-2 rounded-xl text-caption text-[var(--muted-foreground)] w-full cursor-not-allowed font-mono"
            />
          </div>

          {/* Modal Action Buttons */}
          <div className="border-t border-[var(--border)] pt-4 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-body-small font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors active:scale-95"
            >
              {t('cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving || isCompressing || !hasChanges || !nameInput.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-body-small font-bold flex items-center gap-2 shadow-xs transition-transform active:scale-95"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{t('save', 'Save Changes')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
