/**
 * Rich-text helpers for request descriptions (`notes`).
 *
 * Descriptions written with the editor are stored as a small, sanitized HTML subset.
 * Older descriptions are plain text; both are supported when rendering and searching.
 * Everything that reaches the DOM goes through `sanitizeRichText` (DOMPurify), because the
 * HTML is written by one user and displayed to others.
 */
import DOMPurify from 'dompurify';

/** Must match the `notes.size()` limit in firestore.rules. */
export const MAX_NOTES_LENGTH = 10000;

const ALLOWED_TAGS = [
  'p', 'div', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'span', 'font',
  'ol', 'ul', 'li', 'a', 'blockquote',
];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'color', 'style'];

const SAFE_URL = /^(https?:|mailto:|tel:)/i;
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;
const HTML_TAG = new RegExp(`</?(${ALLOWED_TAGS.join('|')})\\b[^>]*>`, 'i');

let hooksInstalled = false;

function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof Element)) return;

    if (node.tagName === 'A') {
      const href = (node.getAttribute('href') ?? '').trim();
      if (!SAFE_URL.test(href)) node.removeAttribute('href');
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }

    // Only a text colour may survive in inline styles.
    if (node.hasAttribute('style')) {
      const color = (node as HTMLElement).style?.color ?? '';
      node.removeAttribute('style');
      if (color && SAFE_COLOR.test(color)) (node as HTMLElement).style.color = color;
    }

    if (node.hasAttribute('color')) {
      const color = node.getAttribute('color') ?? '';
      if (node.tagName !== 'FONT' || !SAFE_COLOR.test(color)) node.removeAttribute('color');
    }
  });
}

/** True when the stored description is HTML produced by the editor (vs legacy plain text). */
export function isRichText(value: string): boolean {
  return HTML_TAG.test(value);
}

export function sanitizeRichText(html: string): string {
  installHooks();
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Safe HTML for display: sanitized rich text, or escaped plain text with line breaks kept. */
export function notesToHtml(value: string): string {
  return isRichText(value) ? sanitizeRichText(value) : escapeHtml(value).replace(/\r?\n/g, '<br>');
}

/** Plain-text version for search, previews and empty checks. */
export function richTextToPlain(value: string): string {
  if (!isRichText(value)) return value.replace(/\s+/g, ' ').trim();
  // Block boundaries (opening or closing) become spaces so words from separate lines don't merge.
  const spaced = sanitizeRichText(value).replace(/<\/?(br|p|div|li|ol|ul|blockquote)\b[^>]*>/gi, ' $& ');
  const doc = new DOMParser().parseFromString(spaced, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Adds a scheme to bare addresses ("example.com" → "https://example.com"); null if unsafe. */
export function normalizeLinkUrl(input: string): string | null {
  const url = input.trim();
  if (!url) return null;
  if (SAFE_URL.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null; // javascript:, data:, …
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) return `mailto:${url}`;
  return `https://${url}`;
}
