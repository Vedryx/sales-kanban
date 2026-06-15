import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { GOOGLE_SCOPE_STRING } from '@/lib/google/scopes';

const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || 'vedryxtech.com')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

async function refreshGoogleAccessToken(token: {
  refreshToken?: string;
  accessToken?: string;
  accessTokenExpires?: number;
}) {
  try {
    if (!token.refreshToken) throw new Error('no refresh token');
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const refreshed = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      error?: string;
    };
    if (!res.ok || !refreshed.access_token) throw new Error(refreshed.error || 'refresh failed');
    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' as const };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: GOOGLE_SCOPE_STRING,
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const domain = email.split('@')[1];
      return allowedDomains.includes(domain);
    },
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token as string;
        token.refreshToken = account.refresh_token as string;
        token.accessTokenExpires = (account.expires_at as number) * 1000;
        return token;
      }
      const expiresAt = typeof token.accessTokenExpires === 'number' ? token.accessTokenExpires : 0;
      if (expiresAt && Date.now() < expiresAt - 60_000) {
        return token;
      }
      const refreshToken = typeof token.refreshToken === 'string' ? token.refreshToken : undefined;
      const accessToken = typeof token.accessToken === 'string' ? token.accessToken : undefined;
      const refreshed = await refreshGoogleAccessToken({
        accessToken,
        refreshToken,
        accessTokenExpires: expiresAt,
      });
      return { ...token, ...refreshed };
    },
    async session({ session, token }) {
      session.accessToken = typeof token.accessToken === 'string' ? token.accessToken : undefined;
      session.accessTokenExpires =
        typeof token.accessTokenExpires === 'number' ? token.accessTokenExpires : undefined;
      session.error = token.error as 'RefreshAccessTokenError' | undefined;
      return session;
    },
  },
});
