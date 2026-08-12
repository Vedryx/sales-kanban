# sales-kanban

Vedryx internal sales kanban + Google Meet scheduler for Pulse Web Local outbound.

## Stack

- Next.js 16 (App Router, TypeScript, `src/`)
- Tailwind 4 (no `tailwind.config.ts` — tokens via `@theme` in `globals.css`)
- shadcn primitives (Radix UI) + lucide-react
- NextAuth v5 (Google OAuth, JWT sessions)
- MongoDB driver — reuses the `vedryx` cluster, collections prefixed `sk_*`
- `@dnd-kit/core` for drag-drop
- vitest for unit tests

## Local setup

```bash
cp .env.example .env.local
# fill MONGODB_URI, AUTH_SECRET (`openssl rand -base64 32`),
# GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

npm install
npm run init-mongo            # creates sk_* collections + indexes
npm run dev                   # http://localhost:3000

# in another tab:
npm run smoke                 # hits /api/health + /api/me
```

## Google OAuth setup (one-time, founder)

1. Google Cloud Console → APIs & Services → Credentials → "Create OAuth client ID" (Web).
2. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<your-vercel-project>.vercel.app/api/auth/callback/google`
   - For per-PR previews on Vercel: register the stable preview URL OR add additional URIs as PRs come up. NextAuth's `trustHost: true` is already set.
3. Enable the **Google Calendar API** in the same project (APIs & Services → Library).
4. Scopes requested at sign-in: `openid email profile https://www.googleapis.com/auth/calendar.events`.

## Allowed sign-in domains

`ALLOWED_EMAIL_DOMAINS` env var (CSV). Defaults to `vedryxtech.com`. Add `apxlabs.ai` etc. as needed. Updating this var on Vercel is the entire "add an SDR" procedure — no DB write needed.

## Preview vs prod data isolation

Vercel preview target sets `PREVIEW_MODE=true`. The collection-name resolver (`src/lib/collections.ts`) appends `_preview` to every collection touched in preview, mirroring the cron's established pattern. Google Calendar bookings in preview also:

- Prefix the event title with `[PREVIEW]`
- Send `sendUpdates: 'none'` so real attendees do not receive invites

## Surfaces (iter 1)

- `/auth/signin` — Google OAuth landing
- `/board` — Kanban (7 columns; drag-drop stage moves)
- `/queue` — Today's meetings (NOW strip, upcoming, Done collapsed, "Coming up tomorrow" collapsed)
- Lead detail pane (slide-over from board card)
- Book G-Meet modal (Vedryx- prefix locked, user types after)
- Sidebar user menu with sign-out

## Privacy

- Phone never appears on board cards or in URL params
- `redactPhone` strips phone-shaped strings from server logs (`src/lib/privacy.ts`)
- Strict CSP set in `next.config.ts`
- All Mongo reads go through `leadProjection` helpers (no raw client-side find)

## Tests

```bash
npm test            # vitest
npm run lint        # next lint
npm run build       # prod build
```

## Iter 1 known gaps

- Manual lead entry live — only `businessName` is required; website + email are optional so an SDR can capture a lead from a business card / call before contact info is confirmed. Adding website unlocks PageSpeed + Observatory scoring; adding email unlocks pitch email.
- Reschedule / cancel meeting UI not surfaced yet (data layer ready)
- Sentry integration deferred to iter 2
- Lost/DNC banner shows count only; no inline meeting cancel button yet
