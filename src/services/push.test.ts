import { describe, expect, it } from 'vitest';
import { decidePushSupport } from './push';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36';

const base = { maxTouchPoints: 0, standalone: false, hasPush: true, permission: 'default' as const, configured: true };

describe('decidePushSupport', () => {
  it('asks iPhone and iPad users to add the app to the Home Screen first', () => {
    expect(decidePushSupport({ ...base, userAgent: IPHONE, hasPush: false })).toBe('ios-needs-install');
    expect(decidePushSupport({ ...base, userAgent: IPAD, maxTouchPoints: 5 })).toBe('ios-needs-install');
    expect(decidePushSupport({ ...base, userAgent: IPHONE, standalone: true })).toBe('ok');
  });

  it('works on Android and desktop browsers with push', () => {
    expect(decidePushSupport({ ...base, userAgent: ANDROID })).toBe('ok');
    expect(decidePushSupport({ ...base, userAgent: IPAD, maxTouchPoints: 0 })).toBe('ok'); // a real Mac
  });

  it('reports denied permission, missing push support and missing configuration', () => {
    expect(decidePushSupport({ ...base, userAgent: ANDROID, permission: 'denied' })).toBe('denied');
    expect(decidePushSupport({ ...base, userAgent: ANDROID, hasPush: false })).toBe('unsupported');
    expect(decidePushSupport({ ...base, userAgent: ANDROID, configured: false })).toBe('unsupported');
  });
});
