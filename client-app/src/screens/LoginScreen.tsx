import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import AuthLayout from './AuthLayout';
import { API_BASE_URL, GOOGLE_ANDROID_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '../config';
import GoogleIcon from '../../assets/google.svg';
import { useEffect, useState } from 'react';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen({
  onGoogleStatus,
  onForgot,
  onRegister,
  onLogin,
  onError,
}: {
  onGoogleStatus: (msg: string) => void;
  onForgot: () => void;
  onRegister: () => void;
  onLogin: () => void;
  onError: (title: string, message: string, retry: () => void) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const redirectUri = makeRedirectUri({ scheme: 'trumpus' });
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
            throw new Error(data?.error ?? `HTTP ${res.status}`);
          }
          onGoogleStatus(`Logged in: ${data?.email ?? 'ok'}`);
          onLogin();
        };

        try {
          onGoogleStatus('Sending Google token...');
          await retry();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown';
          const isNetwork = msg.toLowerCase().includes('network') || msg.toLowerCase().includes('timeout');
          if (isNetwork) {
            onError('No internet connection', 'Check your internet connection and try again.', retry);
          } else if (msg.toLowerCase().includes('503')) {
            onError('Server on maintenance', 'Please try again in an hour later.', retry);
          } else {
            onError('Authentication error', msg, retry);
          }
        }
      } else if (response?.type === 'error') {
        const details = response.params ? JSON.stringify(response.params) : 'no details';
        onGoogleStatus(`Google auth error: ${response.error?.message ?? 'unknown'} | ${details}`);
      }
    }
    handleGoogle();
  }, [response, onGoogleStatus]);

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
          onPress={() => {
            const nextEmailError = email ? '' : 'Required';
            const nextPasswordError = password ? '' : 'Required';
            setEmailError(nextEmailError);
            setPasswordError(nextPasswordError);
            if (!nextEmailError && !nextPasswordError) {
              onLogin();
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
          onPress={() => promptAsync()}
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
    gap: 10,
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
  },
  inputError: {
    borderColor: '#bf0a30',
  },
  errorText: {
    minHeight: 12,
    fontSize: 11,
    color: '#bf0a30',
    marginTop: 4,
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
