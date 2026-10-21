import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useLongPress, UseLongPressOptions, UseLongPressReturn } from '../hooks/useLongPress';
import { triggerHapticFeedback } from '../lib/haptics';
import { HapticFeedbackService } from '../infrastructure/haptics/HapticFeedbackService';
import { OverBallButton } from '../components/scoring/OverBallButton';
import { EventSourcedMatchEngine } from '../domain/cricket/match-engine/EventSourcedMatchEngine';

function renderHook(callback: () => void, options?: UseLongPressOptions): UseLongPressReturn {
  let captured!: UseLongPressReturn;
  function TestComponent() {
    captured = useLongPress(callback, options);
    return null;
  }
  renderToStaticMarkup(React.createElement(TestComponent));
  return captured;
}

describe('Long Press to Edit with Haptic Feedback Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('1. Haptic Feedback & Platform Resilience', () => {
    it('calls HapticFeedbackService.longPress(50) and triggers navigator.vibrate when available', () => {
      const vibrateMock = vi.fn().mockReturnValue(true);
      const originalNavigator = globalThis.navigator;

      // Mock navigator with vibrate
      Object.defineProperty(globalThis, 'navigator', {
        value: { vibrate: vibrateMock },
        configurable: true,
        writable: true,
      });

      const result = triggerHapticFeedback(50);
      expect(result).toBe(true);
      expect(vibrateMock).toHaveBeenCalledWith(50);

      // Restore navigator
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    });

    it('gracefully returns false without throwing when navigator.vibrate throws an error (e.g. security policy)', () => {
      const originalNavigator = globalThis.navigator;
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          vibrate: vi.fn().mockImplementation(() => {
            throw new Error('SecurityError: Permissions policy denies vibration API');
          }),
        },
        configurable: true,
        writable: true,
      });

      expect(() => triggerHapticFeedback(50)).not.toThrow();
      expect(triggerHapticFeedback(50)).toBe(false);

      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    });

    it('gracefully returns false on platforms lacking vibration support (e.g. iOS Safari / desktop)', () => {
      const originalNavigator = globalThis.navigator;
      // Navigator without vibrate property
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });

      expect(() => triggerHapticFeedback(50)).not.toThrow();
      expect(triggerHapticFeedback(50)).toBe(false);

      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    });
  });

  describe('2. Acceptance Criteria: Single Click/Tap vs. 1000ms Long Press', () => {
    it('Criteria 1: Single Click / Tap (< 1000ms) does NOT trigger Edit action', () => {
      const onEdit = vi.fn();
      const { handlers } = renderHook(onEdit, { threshold: 1000 });

      // User presses down
      handlers.onPointerDown({
        button: 0,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      } as React.PointerEvent);

      // User releases 150ms later (quick tap)
      vi.advanceTimersByTime(150);
      handlers.onPointerUp({
        pointerId: 1,
      } as React.PointerEvent);

      // User's click event follows
      handlers.onClick({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.MouseEvent);

      // Advance past 1000ms to ensure no delayed timer fires
      vi.advanceTimersByTime(1500);

      expect(onEdit).not.toHaveBeenCalled();
    });

    it('Criteria 2: Sustained 1000ms hold successfully triggers Edit action once with Haptic Feedback', () => {
      const onEdit = vi.fn();
      const vibrateMock = vi.fn().mockReturnValue(true);
      const originalNavigator = globalThis.navigator;

      Object.defineProperty(globalThis, 'navigator', {
        value: { vibrate: vibrateMock },
        configurable: true,
        writable: true,
      });

      const { handlers } = renderHook(onEdit, { threshold: 1000, hapticFeedback: true });

      // Press down
      handlers.onPointerDown({
        button: 0,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      } as React.PointerEvent);

      // Advance by 1000ms
      vi.advanceTimersByTime(1000);

      // Expect edit callback called once
      expect(onEdit).toHaveBeenCalledTimes(1);
      // Expect vibration called once
      expect(vibrateMock).toHaveBeenCalledTimes(1);
      expect(vibrateMock).toHaveBeenCalledWith(50);

      // Releasing finger afterwards does not duplicate trigger
      handlers.onPointerUp({ pointerId: 1 } as React.PointerEvent);
      vi.advanceTimersByTime(500);
      expect(onEdit).toHaveBeenCalledTimes(1);

      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    });

    it('Criteria 3: Releasing at 999ms cancels edit action', () => {
      const onEdit = vi.fn();
      const onCancel = vi.fn();
      const { handlers } = renderHook(onEdit, { threshold: 1000, onCancel });

      handlers.onPointerDown({
        button: 0,
        pointerId: 1,
        clientX: 50,
        clientY: 50,
      } as React.PointerEvent);

      // Advance to 999ms
      vi.advanceTimersByTime(999);
      expect(onEdit).not.toHaveBeenCalled();

      // Release finger
      handlers.onPointerUp({ pointerId: 1 } as React.PointerEvent);
      expect(onCancel).toHaveBeenCalledTimes(1);

      // Advance past 1000ms
      vi.advanceTimersByTime(500);
      expect(onEdit).not.toHaveBeenCalled();
    });

    it('ignores secondary clicks (e.g. right click button = 2)', () => {
      const onEdit = vi.fn();
      const { handlers } = renderHook(onEdit, { threshold: 1000 });

      handlers.onPointerDown({
        button: 2, // Right click
        pointerId: 1,
        clientX: 50,
        clientY: 50,
      } as React.PointerEvent);

      vi.advanceTimersByTime(1500);
      expect(onEdit).not.toHaveBeenCalled();
    });

    it('ignores simultaneous secondary touches while primary press is in progress', () => {
      const onEdit = vi.fn();
      const { handlers } = renderHook(onEdit, { threshold: 1000 });

      // First touch (pointerId 1)
      handlers.onPointerDown({
        button: 0,
        pointerId: 1,
        clientX: 50,
        clientY: 50,
      } as React.PointerEvent);

      // Second touch (pointerId 2) on same element
      handlers.onPointerDown({
        button: 0,
        pointerId: 2,
        clientX: 55,
        clientY: 55,
      } as React.PointerEvent);

      // Advance by 1000ms
      vi.advanceTimersByTime(1000);
      // Only one trigger
      expect(onEdit).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Movement, Cancellation & Context Menu Suppression', () => {
    it('Criteria 4: Pointer movement > 10px cancels the long press (allows scrolling)', () => {
      const onEdit = vi.fn();
      const onCancel = vi.fn();
      const { handlers } = renderHook(onEdit, { threshold: 1000, moveThreshold: 10, onCancel });

      handlers.onPointerDown({
        button: 0,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      } as React.PointerEvent);

      // Small jitter (4px) should NOT cancel
      handlers.onPointerMove({
        pointerId: 1,
        clientX: 104,
        clientY: 100,
      } as React.PointerEvent);

      vi.advanceTimersByTime(200);
      expect(onCancel).not.toHaveBeenCalled();

      // Large movement (25px horizontally - swiping over list)
      handlers.onPointerMove({
        pointerId: 1,
        clientX: 125,
        clientY: 100,
      } as React.PointerEvent);

      // Should be cancelled immediately
      expect(onCancel).toHaveBeenCalledTimes(1);

      // Advance past 1000ms
      vi.advanceTimersByTime(1000);
      expect(onEdit).not.toHaveBeenCalled();
    });

    it('Criteria 4: onPointerCancel cancels the long press immediately', () => {
      const onEdit = vi.fn();
      const onCancel = vi.fn();
      const { handlers } = renderHook(onEdit, { threshold: 1000, onCancel });

      handlers.onPointerDown({
        button: 0,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      } as React.PointerEvent);

      vi.advanceTimersByTime(400);

      // Browser fires pointercancel when scroll takes over
      handlers.onPointerCancel({
        pointerId: 1,
      } as React.PointerEvent);

      expect(onCancel).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      expect(onEdit).not.toHaveBeenCalled();
    });

    it('Criteria 4: onPointerLeave cancels the long press if cursor/touch leaves element', () => {
      const onEdit = vi.fn();
      const onCancel = vi.fn();
      const { handlers } = renderHook(onEdit, { threshold: 1000, onCancel });

      handlers.onPointerDown({
        button: 0,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      } as React.PointerEvent);

      vi.advanceTimersByTime(300);

      handlers.onPointerLeave({
        pointerId: 1,
      } as React.PointerEvent);

      expect(onCancel).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      expect(onEdit).not.toHaveBeenCalled();
    });

    it('suppresses default context menu during or following long press', () => {
      const onEdit = vi.fn();
      const { handlers } = renderHook(onEdit, { threshold: 1000 });

      handlers.onPointerDown({
        button: 0,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      } as React.PointerEvent);

      const preventDefault = vi.fn();
      handlers.onContextMenu({ preventDefault } as unknown as React.MouseEvent);

      expect(preventDefault).toHaveBeenCalled();
    });
  });

  describe('4. Keyboard Accessibility Support', () => {
    it('triggers long press when holding Enter key for 1000ms', () => {
      const onEdit = vi.fn();
      const { handlers } = renderHook(onEdit, { threshold: 1000 });

      handlers.onKeyDown({ key: 'Enter', repeat: false } as React.KeyboardEvent);
      vi.advanceTimersByTime(1000);

      expect(onEdit).toHaveBeenCalledTimes(1);
    });

    it('triggers long press when holding Space key for 1000ms', () => {
      const onEdit = vi.fn();
      const { handlers } = renderHook(onEdit, { threshold: 1000 });

      handlers.onKeyDown({ key: ' ', repeat: false } as React.KeyboardEvent);
      vi.advanceTimersByTime(1000);

      expect(onEdit).toHaveBeenCalledTimes(1);
    });

    it('cancels keyboard long press if released before 1000ms', () => {
      const onEdit = vi.fn();
      const { handlers } = renderHook(onEdit, { threshold: 1000 });

      handlers.onKeyDown({ key: 'Enter', repeat: false } as React.KeyboardEvent);
      vi.advanceTimersByTime(600);
      handlers.onKeyUp({ key: 'Enter' } as React.KeyboardEvent);

      vi.advanceTimersByTime(600);
      expect(onEdit).not.toHaveBeenCalled();
    });

    it('ignores OS keyboard repeat events', () => {
      const onEdit = vi.fn();
      const { handlers } = renderHook(onEdit, { threshold: 1000 });

      handlers.onKeyDown({ key: 'Enter', repeat: false } as React.KeyboardEvent);
      vi.advanceTimersByTime(300);
      // OS sends repeated keydowns
      handlers.onKeyDown({ key: 'Enter', repeat: true } as React.KeyboardEvent);
      vi.advanceTimersByTime(700);

      expect(onEdit).toHaveBeenCalledTimes(1);
    });
  });

  describe('5. OverBallButton UI & Delivery Formatting Quality', () => {
    it('renders regular ball delivery with accessible long press guidance', () => {
      const onEdit = vi.fn();
      const html = renderToStaticMarkup(
        <OverBallButton ball="4" idx={0} onEdit={onEdit} />
      );

      expect(html).toContain('Ball 1: 4 (Long press to edit)');
      expect(html).toContain('aria-label="Ball 1: 4. Long press for 1 second to edit."');
      expect(html).toContain('bg-blue-600');
      expect(html).toContain('4');
      expect(html).toContain('rounded-full');
      expect(html).toContain('aspect-square');
    });

    it('renders desktop variant with "Delivery" wording', () => {
      const onEdit = vi.fn();
      const html = renderToStaticMarkup(
        <OverBallButton ball="6" idx={2} isDesktop onEdit={onEdit} />
      );

      expect(html).toContain('Delivery 3: 6 (Long press to edit)');
      expect(html).toContain('aria-label="Delivery 3: 6. Long press for 1 second to edit."');
      expect(html).toContain('bg-purple-600');
      expect(html).toContain('data-testid="desktop-over-ball-2"');
    });

    it('renders multi-character extras (Wd, Nb) with min-w classes and amber color', () => {
      const onEdit = vi.fn();
      const html = renderToStaticMarkup(
        <OverBallButton ball="Wd" idx={1} onEdit={onEdit} />
      );

      expect(html).toContain('Wd');
      expect(html).toContain('min-w-[32px]');
      expect(html).toContain('bg-amber-500');
    });

    it('renders wickets (W) with red badge and white text', () => {
      const onEdit = vi.fn();
      const html = renderToStaticMarkup(
        <OverBallButton ball="W" idx={3} onEdit={onEdit} />
      );

      expect(html).toContain('W');
      expect(html).toContain('bg-red-600');
      expect(html).toContain('border-red-500');
    });

    it('renders dot balls with "0" rather than bullet dot', () => {
      const onEdit = vi.fn();
      const html = renderToStaticMarkup(
        <OverBallButton ball="0" idx={0} onEdit={onEdit} />
      );

      expect(html).toContain('>0</button>');
      expect(html).not.toContain('•');
    });

    it('applies touch-action: pan-x and user-select: none to avoid text selection and allow swipe', () => {
      const onEdit = vi.fn();
      const html = renderToStaticMarkup(
        <OverBallButton ball="1" idx={0} onEdit={onEdit} />
      );

      expect(html).toContain('touch-action:pan-x');
      expect(html).toContain('user-select:none');
      expect(html).toContain('-webkit-touch-callout:none');
    });
  });

  describe('6. Existing Match Engine & Scoring Logic Regression Check', () => {
    it('verifies that editing a historical ball via engine.editHistoricalBall operates with 100% integrity', () => {
      const engine = new EventSourcedMatchEngine({
        teamA: 'Dhaka Gladiators',
        teamB: 'Chittagong Kings',
        tossWinner: 'Dhaka Gladiators',
        tossDecision: 'Batting',
        totalOvers: 5,
        strikerName: 'Tamim',
        nonStrikerName: 'Shakib',
        bowlerName: 'Mustafizur',
      });

      // 3 balls scored
      engine.scoreBall({ runsScored: 0 }); // Ball 0: dot (Tamim)
      engine.scoreBall({ runsScored: 4 }); // Ball 1: 4 runs (Tamim)
      engine.scoreBall({ runsScored: 1 }); // Ball 2: 1 run (Tamim -> Shakib on strike)

      expect(engine.currentInnings.totalRuns).toBe(5);
      expect(engine.currentInnings.thisOverLog).toEqual(['0', '4', '1']);

      // Edit historical ball 0 from 0 to 6 runs
      const editResult = engine.editHistoricalBall(0, 1, {
        runsScored: 6,
        isWide: false,
        isNoBall: false,
        isByes: false,
        isLegByes: false,
        isWicket: false,
      });

      expect(editResult).toBe(true);
      expect(engine.currentInnings.totalRuns).toBe(11); // 6 + 4 + 1
      expect(engine.currentInnings.thisOverLog).toEqual(['6', '4', '1']);
    });
  });
});
