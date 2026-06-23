import 'server-only';
import DOMPurify from 'isomorphic-dompurify';

// Inbound email is UNTRUSTED — every reply we render in the board passes
// through this. Sanitize ONCE at the write path (the webhook handler);
// store the sanitized HTML; never re-sanitize at render and never render
// the raw `text`/`html` from Resend.
//
// The allow-list is intentionally narrow:
//   - basic block + inline formatting (p, br, ul/ol/li, blockquote, pre/code)
//     so quoted-reply structure survives
//   - bold/italic/underline/strong/em
//   - anchors with href and basic attributes (NOFOLLOW + target=_blank
//     forced via DOMPurify's hook below)
// Stripped:
//   - <script>, <iframe>, <object>, <embed>, <link>, <meta>, <form>
//   - inline event handlers (onload, onclick, etc.)
//   - <style> + style="" (XSS-via-CSS like background-image:url(javascript:))
//   - <img> — inbound replies frequently embed tracking pixels; we don't
//     want to render them and we don't want to do any network I/O at
//     render time.

const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span',
  'b', 'strong', 'i', 'em', 'u',
  'a',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr',
];

const ALLOWED_ATTR = ['href', 'title', 'rel', 'target'];

// Force every surviving anchor to open in a new tab + use noopener+nofollow.
// We attach the hook once on first use. DOMPurify's `addHook` is idempotent
// within a process; we still guard with a flag so re-imports don't re-add.
let hookInstalled = false;
function installHook() {
  if (hookInstalled) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
    if (node.nodeName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
  hookInstalled = true;
}

export function sanitizeInboundHtml(raw: string | null | undefined): string {
  if (!raw) return '';
  installHook();
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Allow data-uri images? No. Stripped via tag list above. Belt-and-braces.
    FORBID_TAGS: ['img', 'script', 'style', 'iframe', 'object', 'embed', 'form', 'link', 'meta'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover'],
    KEEP_CONTENT: true,
  });
}

// Crop a long body to a UI-friendly preview length. Strips leading whitespace
// so toast/notification surfaces aren't dominated by blank quoted-reply lines.
export function snippetFromText(text: string | null | undefined, max = 500): string {
  if (!text) return '';
  return text.trim().slice(0, max);
}

// Pull a bare address out of a From header that may include a display name
// or angle brackets. "Foo Bar <a@b.com>" → "a@b.com". Returns lowercased so
// callers can compare to indexed-lowercased lead emails without a re-norm.
export function bareEmail(from: string | null | undefined): string {
  if (!from) return '';
  const angled = from.match(/<([^>]+)>/);
  const raw = angled ? angled[1] : from;
  return raw.trim().toLowerCase();
}

// Strip surrounding `< >` from an In-Reply-To / Message-ID header value.
// Resend's stored Message-IDs do not include the angles; the inbound
// In-Reply-To header almost always does.
export function stripAngles(messageId: string | null | undefined): string {
  if (!messageId) return '';
  return messageId.trim().replace(/^<|>$/g, '');
}
