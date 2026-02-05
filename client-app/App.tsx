import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { API_BASE_URL, GOOGLE_ANDROID_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from './src/config';

WebBrowser.maybeCompleteAuthSession();

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('Ready');

  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });

  useEffect(() => {
    async function handleGoogle() {
      if (response?.type === 'success') {
        const accessToken = response.authentication?.accessToken ?? '';
        const idToken = response.authentication?.idToken ?? '';
        try {
          setStatus('Sending Google token to API...');
          const res = await fetch(`${API_BASE_URL}/auth/google/mobile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: accessToken, id_token: idToken }),
          });
          const data = await res.json();
          if (!res.ok) {
            setStatus(`Google login failed: ${data?.error ?? res.status}`);
            return;
          }
          setStatus(`Logged in: ${data?.email ?? 'ok'} (client: ${data?.client_id ?? '-'})`);
        } catch (err) {
          setStatus(`Google login error: ${err instanceof Error ? err.message : 'unknown'}`);
        }
      } else if (response?.type === 'error') {
        setStatus(`Google auth error: ${response.error?.message ?? 'unknown'}`);
      }
    }
    handleGoogle();
  }, [response]);

  const apiBase = useMemo(() => API_BASE_URL, []);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <Text style={styles.title}>Trumpus</Text>
        <Text style={styles.subtitle}>Client app (Expo)</Text>

        <View style={styles.card}>
          <Text style={styles.label}>E-mail</Text>
          <TextInput
            style={styles.input}
            placeholder="mail@gmail.com"
            placeholderTextColor="#9ca3af"
            value={email}
            onChangeText={setEmail}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Pressable style={styles.primaryButton} onPress={() => setStatus('TODO: email/password login')}>
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </Pressable>

          <Pressable
            style={[styles.googleButton, !request && styles.googleButtonDisabled]}
            onPress={() => promptAsync()}
            disabled={!request}
          >
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </Pressable>
        </View>

        <Text style={styles.statusLabel}>API base: {apiBase}</Text>
        <Text style={styles.statusText}>{status}</Text>
      </View>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 24,
    color: '#475569',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  label: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#1e293b',
    marginBottom: 6,
    marginTop: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: '#bf0a30',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  googleButton: {
    marginTop: 12,
    backgroundColor: '#0b2d6b',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  statusLabel: {
    marginTop: 18,
    color: '#64748b',
    fontSize: 12,
  },
  statusText: {
    marginTop: 6,
    color: '#0f172a',
    fontSize: 13,
  },
});
