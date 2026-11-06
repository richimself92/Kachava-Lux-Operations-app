// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isRichText, normalizeLinkUrl, notesToHtml, richTextToPlain, sanitizeRichText } from './richText';

describe('sanitizeRichText', () => {
  it('keeps the formatting the editor produces', () => {
    const html =
      '<div><b>Bold</b> <i>it</i> <u>u</u> <strike>s</strike> <font color="#d93025">red</font></div>' +
      '<ol><li>one</li></ol><ul><li>two</li></ul><blockquote>indented</blockquote>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it('removes scripts, event handlers and unsafe links', () => {
    const out = sanitizeRichText(
      '<img src=x onerror="alert(1)"><script>alert(2)</script><b onclick="x()">ok</b><a href="javascript:alert(3)">bad</a>',
    );
    expect(out).not.toMatch(/script|onerror|onclick|javascript|<img/i);
    expect(out).toContain('<b>ok</b>');
  });

  it('forces links to open safely in a new tab', () => {
    const out = sanitizeRichText('<a href="https://example.com">x</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it('keeps only colour from inline styles', () => {
    const out = sanitizeRichText('<span style="color: rgb(217, 48, 37); background: url(https://evil.test/x)">t</span>');
    expect(out).toBe('<span style="color: rgb(217, 48, 37);">t</span>');
  });
});

describe('legacy plain text', () => {
  it('is detected and escaped with line breaks', () => {
    expect(isRichText('Leak in bathroom\nsecond line')).toBe(false);
    expect(notesToHtml('a < b\nnext')).toBe('a &lt; b<br>next');
  });
});

describe('richTextToPlain', () => {
  it('separates blocks and list items with spaces', () => {
    expect(richTextToPlain('<div>Pump</div><ol><li>check</li><li>replace</li></ol>')).toBe('Pump check replace');
    expect(richTextToPlain('<b>Leak</b><div><ol><li>seal</li></ol></div>')).toBe('Leak seal');
  });

  it('is empty for an editor with only line breaks', () => {
    expect(richTextToPlain('<div><br></div>')).toBe('');
  });
});

describe('normalizeLinkUrl', () => {
  it('adds a scheme and rejects dangerous ones', () => {
    expect(normalizeLinkUrl('example.com/a')).toBe('https://example.com/a');
    expect(normalizeLinkUrl('https://x.test')).toBe('https://x.test');
    expect(normalizeLinkUrl('ops@kachavalux.com')).toBe('mailto:ops@kachavalux.com');
    expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkUrl('  ')).toBeNull();
  });
});
