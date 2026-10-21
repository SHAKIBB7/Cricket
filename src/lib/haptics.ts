import { HapticFeedbackService } from '@/infrastructure/haptics/HapticFeedbackService';

/**
 * Utility for safe cross-device haptic feedback / vibration.
 * Works seamlessly across Android Chrome, Desktop, and gracefully handles iOS Safari
 * or restricted iframe contexts where navigator.vibrate is missing or restricted.
 */
export function triggerHapticFeedback(pattern: number | number[] = 50): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      return HapticFeedbackService.longPress(pattern);
    }
  } catch {
    // Gracefully swallow any security/permission/unsupported exceptions
  }

  return false;
}
