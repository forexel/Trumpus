import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useState } from 'react';
import AuthLayout from './AuthLayout';
import { resetPasswordWithToken } from '../lib/api';
import { clearTokens, saveTokens } from '../lib/auth';

export default function ResetPasswordScreen({
  token,
  onBack,
  onSuccess,
}: {
  token: string;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const mapAuthError = (raw: string) => {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'invalid email') return 'Invalid email address.';
    if (normalized.startsWith('password length')) return 'Password must be 6-128 characters.';
    if (normalized === 'invalid credentials') return 'Reset token is invalid or expired.';
    if (normalized === 'invalid json') return 'Invalid request. Please try again.';
    if (normalized === 'rate_limited') return 'Too many requests. Try again later.';
    return raw || 'Reset failed.';
  };

  return (
    <AuthLayout title="Reset Password">
      <View style={styles.form}>
        <Text style={styles.label}>New password</Text>
        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          placeholder="Enter a new password"
          placeholderTextColor="#9ca3af"
          secureTextEntry
          value={newPass}
          onChangeText={setNewPass}
        />

        <Text style={styles.label}>Confirm password</Text>
        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          placeholder="Confirm the new password"
          placeholderTextColor="#9ca3af"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
        />
        <Text style={styles.errorText}>{error || ' '}</Text>

        <Pressable
          style={[styles.primaryButton, loading ? styles.primaryButtonDisabled : null]}
          onPress={async () => {
            setError('');
            if (!newPass || !confirm) {
              setError('Fill all fields');
              return;
            }
            if (newPass !== confirm) {
              setError('Passwords do not match');
              return;
            }
            try {
              setLoading(true);
              const data = await resetPasswordWithToken(token, newPass);
              await clearTokens();
              await saveTokens(data);
              onSuccess();
            } catch (err) {
              const raw = err instanceof Error ? err.message : 'Reset failed';
              setError(mapAuthError(raw));
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>{loading ? 'Saving...' : 'Save password'}</Text>
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
    marginBottom: 2,
  },
  primaryButton: {
    marginTop: 10,
    backgroundColor: '#0b2d6b',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.7,
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
