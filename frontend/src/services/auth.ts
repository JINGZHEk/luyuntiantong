const AUTH_STORAGE_KEY = 'luyun-auth-session';

export type AuthSession = {
  username: string;
  signedInAt: string;
  remember: boolean;
};

export const DEMO_ACCOUNT = {
  username: 'demo',
  password: 'luyun2026',
} as const;

export function getAuthSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

export function signIn(username: string, password: string, remember: boolean): AuthSession | null {
  if (username.trim() !== DEMO_ACCOUNT.username || password !== DEMO_ACCOUNT.password) {
    return null;
  }
  const session: AuthSession = {
    username: username.trim(),
    signedInAt: new Date().toISOString(),
    remember,
  };
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function signOut(): void {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}
