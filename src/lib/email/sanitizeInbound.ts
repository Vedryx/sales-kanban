import 'server-only';
import sanitizeHtml from 'sanitize-html';

// Inbound email is UNTRUSTED — every reply we render in the board passes
// through this. Sanitize ONCE at the write path (the webhook handler);
// store the sanitized HTML; never re-sanitize at render and never render
// the raw `text`/`html` from Resend.
//
// Implementation note: uses `sanitize-html` (pure JS, htmlparser2) rather than
// DOMPurify/jsdom — jsdom pulls an ESM-only transitive dep that breaks under
// `require()` in the Vercel Node lambda (ERR_REQUIRE_ESM), 500-ing the whole
// route at module load. sanitize-html has no DOM dependency and runs cleanly
// in serverless.
//
// The allow-list is intentionally narrow:
//   - basic block + inline formatting (p, br, ul/ol/li, blockquote, pre/code)
//     so quoted-reply structure survives
//   - bold/italic/underline/strong/em + headings
//   - anchors with href (forced rel=nofollow noopener + target=_blank)
// Stripped (not in the allow-list → discarded, text content kept):
//   - <script>, <iframe>, <object>, <embed>, <link>, <meta>, <form>, <style>
//   - <img> — inbound replies frequently embed tracking pixels; we don't
//     render them and we don't want network I/O at render time
//   - inline event handlers + style="" (only href/title/rel/target survive,
//     and only on <a>)

const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span',
  'b', 'strong', 'i', 'em', 'u',
  'a',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr',
];

export function sanitizeInboundHtml(raw: string | null | undefined): string {
  if (!raw) return '';
  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    // Only anchors keep attributes; everything else is stripped (kills style,
    // on* handlers, etc.). javascript:/data: blocked via allowedSchemes.
    allowedAttributes: { a: ['href', 'title', 'rel', 'target'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    // Drop disallowed tags but keep their text content (matches the prior
    // DOMPurify KEEP_CONTENT behavior).
    disallowedTagsMode: 'discard',
    transformTags: {
      // Force every surviving anchor to open in a new tab + noopener+nofollow.
      a: (tagName, attribs) => ({
        tagName: 'a',
        attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' },
      }),
    },
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
