export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
] as const;

export const GOOGLE_SCOPE_STRING = GOOGLE_SCOPES.join(' ');
