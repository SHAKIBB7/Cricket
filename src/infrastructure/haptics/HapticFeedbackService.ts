/**
 * HapticFeedbackService
 * 
 * Provides tactile vibration feedback for fast, error-free field scoring
 * on supported mobile devices (Chrome on Android, iOS WebKit when permitted).
 */

export class HapticFeedbackService {
  private static isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof (navigator as any).vibrate === 'function';
  }

  /**
   * Short crisp pulse for standard scoring actions (1, 2, 3 runs, dot ball, undo)
   */
  static light(): void {
    if (this.isSupported()) {
      try {
        navigator.vibrate(15);
      } catch {
        // Ignore vibration errors
      }
    }
  }

  /**
   * Two energetic pulses for Boundary Four
   */
  static boundaryFour(): void {
    if (this.isSupported()) {
      try {
        navigator.vibrate([40, 50, 40]);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Three celebratory pulses for Boundary Six
   */
  static boundarySix(): void {
    if (this.isSupported()) {
      try {
        navigator.vibrate([50, 40, 50, 40, 80]);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Distinctive heavy double thud for Wicket / Dismissal
   */
  static wicket(): void {
    if (this.isSupported()) {
      try {
        navigator.vibrate([100, 60, 140]);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Rapid attention pulse for Free Hit delivery
   */
  static freeHit(): void {
    if (this.isSupported()) {
      try {
        navigator.vibrate([40, 40, 40, 40, 90]);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Warning vibration for quota limits or disallowed actions
   */
  static warning(): void {
    if (this.isSupported()) {
      try {
        navigator.vibrate([80, 50, 80]);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Tactile vibration for successful long press edit action (default: 50ms)
   */
  static longPress(pattern: number | number[] = 50): boolean {
    if (this.isSupported()) {
      try {
        return Boolean(navigator.vibrate(pattern));
      } catch {
        return false;
      }
    }
    return false;
  }
}
