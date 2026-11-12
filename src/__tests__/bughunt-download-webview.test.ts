/**
 * Bug hunt batch D (2026-11-12) — P-1/P-2/P-11 foundations.
 *
 * isEmbeddedWebView is the wrapper detector the auth redirect
 * flow, the download helper and the install-card suppression
 * all key off; downloadBlob is the shared file-delivery path
 * that routes through Web Share inside a wrapper (where blob
 * downloads have no handler) and through the classic anchor
 * download everywhere else.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isEmbeddedWebView } from '@/lib/platform';
import { downloadBlob } from '@/lib/download';

const UA = {
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  webViewAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  iphoneWebView:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
};

describe('isEmbeddedWebView (P-1/P-11)', () => {
  it('detects the Android WebView UA marker and bridge globals', () => {
    expect(isEmbeddedWebView(UA.webViewAndroid, {})).toBe(true);
    expect(isEmbeddedWebView(UA.chromeAndroid, { Capacitor: {} })).toBe(true);
    expect(isEmbeddedWebView(UA.chromeAndroid, { cordova: {} })).toBe(true);
    expect(isEmbeddedWebView('SomeApp WebView/1.0', {})).toBe(true);
  });

  it('detects iOS WKWebView (AppleWebKit without the Safari token)', () => {
    expect(isEmbeddedWebView(UA.iphoneWebView, {})).toBe(true);
  });

  it('leaves real browsers alone — Chrome and Mobile Safari are not wrappers', () => {
    expect(isEmbeddedWebView(UA.chromeAndroid, {})).toBe(false);
    expect(isEmbeddedWebView(UA.iphoneSafari, {})).toBe(false);
    expect(isEmbeddedWebView('', {})).toBe(false);
  });
});

describe('downloadBlob path selection (P-2)', () => {
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;
  const originalURL = (globalThis as any).URL;

  let anchor: any;
  let clickSpy: ReturnType<typeof vi.fn>;

  function stubDom(ua: string, windowExtras: Record<string, unknown> = {}) {
    clickSpy = vi.fn();
    anchor = { href: '', download: '', target: '', rel: '', click: clickSpy };
    (globalThis as any).window = { ...windowExtras };
    (globalThis as any).document = {
      createElement: vi.fn().mockReturnValue(anchor),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    };
    (globalThis as any).URL = {
      createObjectURL: vi.fn().mockReturnValue('blob:test-url'),
      revokeObjectURL: vi.fn(),
    };
    Object.defineProperty(globalThis.navigator, 'userAgent', { value: ua, configurable: true });
  }

  function stubShare(canShare: boolean, shareImpl?: () => Promise<void>) {
    const share = vi.fn(shareImpl ?? (async () => {}));
    Object.defineProperty(globalThis.navigator, 'canShare', { value: vi.fn().mockReturnValue(canShare), configurable: true });
    Object.defineProperty(globalThis.navigator, 'share', { value: share, configurable: true });
    return share;
  }

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
    (globalThis as any).URL = originalURL;
    delete (globalThis.navigator as any).canShare;
    delete (globalThis.navigator as any).share;
    vi.restoreAllMocks();
  });

  it('uses the anchor download in a normal browser', async () => {
    stubDom(UA.chromeAndroid);
    const result = await downloadBlob(new Blob(['x'], { type: 'text/csv' }), 'export.csv');
    expect(result).toBe('anchor');
    expect(anchor.download).toBe('export.csv');
    expect(clickSpy).toHaveBeenCalled();
  });

  it('uses Web Share with files inside an embedded WebView', async () => {
    stubDom(UA.webViewAndroid);
    const share = stubShare(true);
    const result = await downloadBlob(new Blob(['x'], { type: 'text/csv' }), 'export.csv');
    expect(result).toBe('share');
    expect(share).toHaveBeenCalledTimes(1);
    const payload = (share.mock.calls[0] as any[])[0];
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0].name).toBe('export.csv');
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('falls back to the anchor when the wrapper cannot share files', async () => {
    stubDom(UA.webViewAndroid);
    stubShare(false);
    const result = await downloadBlob(new Blob(['x'], { type: 'text/csv' }), 'export.csv');
    expect(result).toBe('anchor');
    expect(clickSpy).toHaveBeenCalled();
  });

  it('treats a dismissed share sheet as delivered (no anchor fallback)', async () => {
    stubDom(UA.webViewAndroid);
    stubShare(true, async () => {
      const err = new Error('dismissed');
      err.name = 'AbortError';
      throw err;
    });
    const result = await downloadBlob(new Blob(['x'], { type: 'text/csv' }), 'export.csv');
    expect(result).toBe('share');
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
