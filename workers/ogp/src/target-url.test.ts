import { describe, expect, it } from 'vitest';
import { parseTargetUrl } from './target-url';

function error(raw: string | null): string {
  const result = parseTargetUrl(raw);
  return result.ok ? 'ok' : result.error;
}

describe('parseTargetUrl', () => {
  it('accepts an ordinary public page', () => {
    const result = parseTargetUrl('https://example.com/a?b=c#frag');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The fragment never reaches the server; dropping it shares the cache entry.
    expect(result.url.href).toBe('https://example.com/a?b=c');
  });

  it('strips credentials that would otherwise be forwarded', () => {
    const result = parseTargetUrl('https://user:pass@example.com/');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url.href).toBe('https://example.com/');
  });

  it('rejects a missing or unparseable url', () => {
    expect(error(null)).toBe('missing_url');
    expect(error('   ')).toBe('missing_url');
    expect(error('not a url')).toBe('invalid_url');
    expect(error('example.com')).toBe('invalid_url');
  });

  it('rejects schemes that are not the web', () => {
    expect(error('file:///etc/passwd')).toBe('unsupported_scheme');
    expect(error('data:text/html,<title>x</title>')).toBe('unsupported_scheme');
    expect(error('ftp://example.com/')).toBe('unsupported_scheme');
  });

  it('refuses to reach anything but the public internet', () => {
    for (const raw of [
      'http://localhost/',
      'http://LOCALHOST:80/',
      'http://app.localhost/',
      'http://printer.local/',
      'http://wiki.internal/',
      'http://127.0.0.1/',
      'http://0.0.0.0/',
      'http://10.0.0.5/',
      'http://172.16.0.1/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://100.100.100.200/',
      'http://[::1]/',
      'http://[fd00::1]/',
      'http://[fe80::1]/',
      'http://[::ffff:127.0.0.1]/',
    ]) {
      expect(error(raw), raw).toBe('blocked_host');
    }
  });

  it('allows a public IP literal', () => {
    expect(error('http://93.184.216.34/')).toBe('ok');
  });

  it('refuses ports that are not the web', () => {
    expect(error('http://example.com:8080/')).toBe('blocked_port');
    expect(error('http://example.com:22/')).toBe('blocked_port');
    expect(error('https://example.com:443/')).toBe('ok');
  });
});
