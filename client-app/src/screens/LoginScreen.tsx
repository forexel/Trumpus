import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import AuthLayout from './AuthLayout';
import { API_BASE_URL, GOOGLE_ANDROID_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '../config';
import GoogleIcon from '../../assets/google.svg';
import { useEffect, useState } from 'react';
import { clearTokens, saveTokens } from '../lib/auth';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen({
  onForgot,
  onRegister,
  onLogin,
  onError,
}: {
  onForgot: () => void;
  onRegister: () => void;
  onLogin: () => void;
  onError: (title: string, message: string, retry: () => void) => void;
}) {
  const mapAuthError = (raw: string) => {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'invalid email') return 'Invalid email address.';
    if (normalized.startsWith('password length')) return 'Password must be 6-128 characters.';
    if (normalized === 'invalid credentials') return 'Email or password is incorrect.';
    if (normalized === 'user already exists') return 'An account with this email already exists.';
    if (normalized === 'invalid json') return 'Invalid request. Please try again.';
    return raw || 'Authentication error';
  };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const androidClientIdBase = GOOGLE_ANDROID_CLIENT_ID.replace('.apps.googleusercontent.com', '');
  const androidRedirectUri = androidClientIdBase
    ? makeRedirectUri({ native: `com.googleusercontent.apps.${androidClientIdBase}:/oauthredirect` })
    : makeRedirectUri({ scheme: 'trumpus' });
  const redirectUri = Platform.OS === 'android' ? androidRedirectUri : makeRedirectUri({ scheme: 'trumpus' });
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
    redirectUri,
  });

  useEffect(() => {
    async function handleGoogle() {
      if (response?.type === 'success') {
        const accessToken = response.authentication?.accessToken ?? '';
        const idToken = response.authentication?.idToken ?? '';
        const retry = async () => {
          const res = await fetch(`${API_BASE_URL}/auth/google/mobile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: accessToken, id_token: idToken }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(mapAuthError(data?.error ?? `HTTP ${res.status}`));
          }
          await clearTokens();
          await saveTokens(data);
          onLogin();
        };

        try {
          await retry();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown';
          setEmailError(' ');
          setPasswordError(mapAuthError(msg || 'Authentication error'));
        }
      } else if (response?.type === 'error') {
        const details = response.params ? JSON.stringify(response.params) : 'no details';
        const msg = response.error?.message ?? 'Google auth error';
        setEmailError(' ');
        setPasswordError(msg);
      }
    }
    handleGoogle();
  }, [response]);

  return (
    <AuthLayout title="Welcome Back">
      <View style={styles.form}>
        <Text style={styles.label}>E-mail</Text>
        <TextInput
          style={[styles.input, emailError ? styles.inputError : null]}
          placeholder="mail@gmail.com"
          placeholderTextColor="#9ca3af"
          value={email}
          onChangeText={setEmail}
        />
        <Text style={styles.errorText}>{emailError || ' '}</Text>

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={[styles.input, passwordError ? styles.inputError : null]}
          placeholder="Enter your password"
          placeholderTextColor="#9ca3af"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Text style={styles.errorText}>{passwordError || ' '}</Text>

        <Pressable
          style={styles.primaryButton}
          onPress={async () => {
            const nextEmailError = email ? '' : 'Required';
            const nextPasswordError = password ? '' : 'Required';
            setEmailError(nextEmailError);
            setPasswordError(nextPasswordError);
            if (nextEmailError || nextPasswordError) return;

            const retry = async () => {
              const res = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
              });
              const data = await res.json();
              if (!res.ok) {
                throw new Error(mapAuthError(data?.error ?? `HTTP ${res.status}`));
              }
              await clearTokens();
              await saveTokens(data);
              onLogin();
            };

            try {
              await retry();
            } catch (err) {
              const raw = err instanceof Error ? err.message : 'Invalid credentials';
              const msg = mapAuthError(raw);
              setEmailError(' ');
              setPasswordError(msg);
            }
          }}
        >
          <Text style={styles.primaryButtonText}>Sign In</Text>
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          style={[styles.googleButton, !request && styles.googleButtonDisabled]}
          onPress={() => {
            promptAsync({ useProxy: false });
          }}
          disabled={!request}
        >
          <GoogleIcon width={18} height={18} />
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </Pressable>

        <View style={styles.linksRow}>
          <Pressable onPress={onForgot}>
            <Text style={styles.linkText}>Forgot password?</Text>
          </Pressable>
          <Pressable onPress={onRegister}>
            <Text style={styles.linkText}>Create account</Text>
          </Pressable>
        </View>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  form: {
    display: 'flex',
    gap: 0,
  },
  label: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#002868',
    fontWeight: '600',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    marginTop: 6,
  },
  inputError: {
    borderColor: '#bf0a30',
  },
  errorText: {
    minHeight: 12,
    fontSize: 11,
    color: '#bf0a30',
    marginTop: 5,
    marginBottom: 0,
  },
  primaryButton: {
    marginTop: 10,
    backgroundColor: '#bf0a30',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  dividerRow: {
    marginTop: 8,
    marginBottom: 8,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#002868',
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#002868',
  },
  googleButton: {
    backgroundColor: '#0b2d6b',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  linksRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: '#002868',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  linkText: {
    color: '#bf0a30',
    fontWeight: '600',
  },
});
