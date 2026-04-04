import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getAuth, signInWithCustomToken, signOut, onAuthStateChanged, updateProfile, type User } from 'firebase/auth';
import { getApps } from 'firebase/app';
import { generateCodeVerifier, generateCodeChallenge } from './pkce';
import { callGas } from '../services/gasClient';
import { appConfig } from '../services/firebase';

const OAUTH_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.appfolder',
].join(' ');

const PKCE_VERIFIER_KEY = 'oauth-pkce-verifier';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen to Firebase Auth state
  useEffect(() => {
    const app = getApps()[0];
    if (!app) { setLoading(false); return; }

    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Redirect to Google OAuth consent screen
  const login = useCallback(async () => {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);

    // Store verifier so the callback page can retrieve it
    sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);

    const redirectUri = `${window.location.origin}/auth/callback`;

    const params = new URLSearchParams({
      client_id: appConfig.googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: OAUTH_SCOPES,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
    });

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }, []);

  // Sign out of Firebase and revoke tokens on the server
  const logout = useCallback(async () => {
    const app = getApps()[0];
    if (!app) return;

    const auth = getAuth(app);

    // Revoke server-side tokens
    if (auth.currentUser) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        await callGas(appConfig.gasSyncUrl, {
          action: 'revokeTokens',
          firebaseIdToken: idToken,
        });
      } catch (e) {
        console.error('Failed to revoke server tokens:', e);
      }
    }

    await signOut(auth);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Called from the AuthCallback page.
 * Exchanges the authorization code for a Firebase custom token via GAS,
 * then signs in to Firebase.
 */
export async function handleAuthCallback(): Promise<User> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');

  if (error) throw new Error(`OAuth error: ${error}`);
  if (!code) throw new Error('No authorization code in callback URL');

  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!verifier) throw new Error('Missing PKCE verifier — did you start the login flow from this browser?');

  // Clean up
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);

  const redirectUri = `${window.location.origin}/auth/callback`;

  const data = await callGas<{ firebaseToken: string; displayName?: string; photoURL?: string }>(appConfig.gasSyncUrl, {
    action: 'exchangeCode',
    code,
    codeVerifier: verifier,
    redirectUri,
  });

  const app = getApps()[0];
  if (!app) throw new Error('Firebase app not initialized');

  const auth = getAuth(app);
  const credential = await signInWithCustomToken(auth, data.firebaseToken);

  // Custom token sign-in doesn't populate profile fields, so set them from
  // the Google profile info returned by the backend.
  if (data.displayName || data.photoURL) {
    await updateProfile(credential.user, {
      displayName: data.displayName ?? null,
      photoURL: data.photoURL ?? null,
    });
  }

  return credential.user;
}
