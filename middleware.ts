import { auth } from './auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isAuthRoute = nextUrl.pathname.startsWith('/auth');
  const isApiAuth = nextUrl.pathname.startsWith('/api/auth');
  const isApiHealth = nextUrl.pathname.startsWith('/api/health');
  // Dev-only fixture routes for layout / mobile-responsive verification
  // (see src/app/dev/preview/page.tsx). Never bypasses auth in prod:
  //   - middleware short-circuits only when NODE_ENV !== 'production'
  //   - the page itself returns 404 in prod
  const isDevPreview =
    process.env.NODE_ENV !== 'production' && nextUrl.pathname.startsWith('/dev/');

  if (isApiAuth || isApiHealth || isDevPreview) return NextResponse.next();
  if (isAuthRoute) {
    if (isLoggedIn) return NextResponse.redirect(new URL('/', nextUrl.origin));
    return NextResponse.next();
  }
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/auth/signin', nextUrl.origin));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts).*)'],
};
