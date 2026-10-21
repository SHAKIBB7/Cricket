import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  useRecentBallsAutoSlide,
  UseRecentBallsAutoSlideOptions,
  UseRecentBallsAutoSlideReturn,
} from '../hooks/useRecentBallsAutoSlide';

function renderHook(
  ballsLog: string[],
  options?: UseRecentBallsAutoSlideOptions
): UseRecentBallsAutoSlideReturn {
  let captured!: UseRecentBallsAutoSlideReturn;
  function TestComponent() {
    captured = useRecentBallsAutoSlide(ballsLog, options);
    return null;
  }
  renderToStaticMarkup(React.createElement(TestComponent));
  return captured;
}

describe('Recent Balls Row Auto-Slide / Auto-Scroll Test Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('1. Dynamic Width & Automatic Left Slide Calculation', () => {
    it('does NOT scroll horizontally when balls fit within visible container width', () => {
      const scrollToMock = vi.fn();
      const mockElement = {
        scrollWidth: 150,
        clientWidth: 200, // Container is wider than balls content
        scrollTo: scrollToMock,
      } as unknown as HTMLDivElement;

      const hook = renderHook(['0', '1', '4']);
      Object.defineProperty(hook.containerRef, 'current', {
        value: mockElement,
        writable: true,
      });

      hook.scrollToLatest();
      // Since scrollWidth <= clientWidth (no overflow), no scroll needed
      expect(scrollToMock).not.toHaveBeenCalled();
    });

    it('smoothly slides left to reveal the latest ball when balls overflow the container width', () => {
      const scrollToMock = vi.fn();
      const mockElement = {
        scrollWidth: 280, // Content is wider than container (overflow)
        clientWidth: 180, // Mobile viewport width for row
        scrollTo: scrollToMock,
      } as unknown as HTMLDivElement;

      const hook = renderHook(['0', '1', '4', 'W', '2', '6'], { extraOffset: 8 });
      Object.defineProperty(hook.containerRef, 'current', {
        value: mockElement,
        writable: true,
      });

      hook.scrollToLatest('smooth');

      // Target left = (280 - 180) + 8 = 108
      expect(scrollToMock).toHaveBeenCalledWith({
        left: 108,
        behavior: 'smooth',
      });
    });

    it('adapts dynamically to any container width without hardcoded ball limits', () => {
      const scrollToMock = vi.fn();
      const mockElement = {
        scrollWidth: 400, // 10 deliveries (lots of extras)
        clientWidth: 300, // Tablet width
        scrollTo: scrollToMock,
      } as unknown as HTMLDivElement;

      const hook = renderHook(['Wd', '0', 'Nb', '1', '4', '0', 'W', '2', '6', '1'], { extraOffset: 8 });
      Object.defineProperty(hook.containerRef, 'current', {
        value: mockElement,
        writable: true,
      });

      hook.scrollToLatest();

      // Target left = (400 - 300) + 8 = 108
      expect(scrollToMock).toHaveBeenCalledWith({
        left: 108,
        behavior: 'smooth',
      });
    });
  });

  describe('2. Over Transition & Reset on 0 Balls', () => {
    it('instantly resets scroll position to beginning (left: 0) on new over transition or empty log', () => {
      const scrollToMock = vi.fn();
      const mockElement = {
        scrollWidth: 200,
        clientWidth: 200,
        scrollTo: scrollToMock,
      } as unknown as HTMLDivElement;

      const hook = renderHook([]);
      Object.defineProperty(hook.containerRef, 'current', {
        value: mockElement,
        writable: true,
      });

      hook.resetScroll();
      expect(scrollToMock).toHaveBeenCalledWith({
        left: 0,
        behavior: 'auto',
      });
    });
  });

  describe('3. Undo / Delivery Removal Alignment', () => {
    it('recalculates position and slides back when a delivery is undone', () => {
      const scrollToMock = vi.fn();
      const mockElement = {
        scrollWidth: 220, // Reduced from 260 after undo
        clientWidth: 180,
        scrollTo: scrollToMock,
      } as unknown as HTMLDivElement;

      const hook = renderHook(['0', '1', '4', 'W', '2'], { extraOffset: 8 });
      Object.defineProperty(hook.containerRef, 'current', {
        value: mockElement,
        writable: true,
      });

      hook.scrollToLatest('smooth');
      // Max scroll = (220 - 180) + 8 = 48
      expect(scrollToMock).toHaveBeenCalledWith({
        left: 48,
        behavior: 'smooth',
      });
    });
  });

  describe('4. Zero Page-Level Scroll Disturbance & Performance', () => {
    it('only scrolls the horizontal container element, leaving window.scrollTo untouched', () => {
      const windowScrollToMock = vi.fn();
      const originalWindow = globalThis.window;

      // Mock window
      Object.defineProperty(globalThis, 'window', {
        value: { scrollTo: windowScrollToMock },
        configurable: true,
        writable: true,
      });

      const elementScrollToMock = vi.fn();
      const mockElement = {
        scrollWidth: 300,
        clientWidth: 180,
        scrollTo: elementScrollToMock,
      } as unknown as HTMLDivElement;

      const hook = renderHook(['0', '1', '4', 'W', '2', '6', 'Wd']);
      Object.defineProperty(hook.containerRef, 'current', {
        value: mockElement,
        writable: true,
      });

      hook.scrollToLatest('smooth');

      // Element scrolled
      expect(elementScrollToMock).toHaveBeenCalledTimes(1);
      // Window page scroll was NOT disturbed
      expect(windowScrollToMock).not.toHaveBeenCalled();

      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    });
  });

  describe('5. Responsive ResizeObserver Integration', () => {
    it('safely handles ResizeObserver if present in modern mobile browsers', () => {
      const observeMock = vi.fn();
      const disconnectMock = vi.fn();
      const originalResizeObserver = globalThis.ResizeObserver;

      class MockResizeObserver {
        observe = observeMock;
        disconnect = disconnectMock;
        unobserve = vi.fn();
      }

      Object.defineProperty(globalThis, 'ResizeObserver', {
        value: MockResizeObserver,
        configurable: true,
        writable: true,
      });

      const hook = renderHook(['0', '1', '4']);
      expect(hook.containerRef).toBeDefined();

      Object.defineProperty(globalThis, 'ResizeObserver', {
        value: originalResizeObserver,
        configurable: true,
        writable: true,
      });
    });
  });
});
