import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useState } from 'react';
import AuthLayout from './AuthLayout';
import { API_BASE_URL } from '../config';
import { clearTokens, saveTokens } from '../lib/auth';

export default function RegisterScreen({ onBack, onRegister }: { onBack: () => void; onRegister: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());
  const mapAuthError = (raw: string) => {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'invalid email') return 'Invalid email address.';
    if (normalized.startsWith('password length')) return 'Password must be 6-128 characters.';
    if (normalized === 'user already exists') return 'An account with this email already exists.';
    if (normalized === 'invalid json') return 'Invalid request. Please try again.';
    return raw || 'Registration failed';
  };
  return (
    <AuthLayout title="Create Account">
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
          placeholder="Create a password"
          placeholderTextColor="#9ca3af"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Text style={styles.errorText}>{passwordError || ' '}</Text>

        <Text style={styles.label}>Confirm password</Text>
        <TextInput
          style={[styles.input, confirmError ? styles.inputError : null]}
          placeholder="Confirm your password"
          placeholderTextColor="#9ca3af"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
        />
        <Text style={styles.errorText}>{confirmError || ' '}</Text>

        <Pressable
          style={styles.primaryButton}
          onPress={async () => {
            const nextEmailError = email ? (isValidEmail(email) ? '' : 'Invalid email') : 'Required';
            const nextPasswordError = password ? '' : 'Required';
            const nextConfirmError = confirm ? '' : 'Required';
            const mismatch = password && confirm && password !== confirm ? 'Passwords do not match' : '';
            setEmailError(nextEmailError);
            setPasswordError(nextPasswordError || mismatch);
            setConfirmError(nextConfirmError || mismatch);
            if (nextEmailError || nextPasswordError || nextConfirmError || mismatch) return;

            try {
              const res = await fetch(`${API_BASE_URL}/auth/register`, {
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
              onRegister();
            } catch (err) {
              const raw = err instanceof Error ? err.message : 'Registration failed';
              const msg = mapAuthError(raw);
              if (msg.toLowerCase().includes('email')) {
                setEmailError(msg);
              } else if (msg.toLowerCase().includes('password')) {
                setPasswordError(msg);
              } else {
                setPasswordError(msg);
              }
            }
          }}
        >
          <Text style={styles.primaryButtonText}>Sign Up</Text>
        </Pressable>

        <Pressable onPress={onBack}>
          <Text style={styles.linkText}>Back to login</Text>
        </Pressable>
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
  linkText: {
    marginTop: 12,
    color: '#bf0a30',
    fontWeight: '600',
    textAlign: 'center',
  },
});
