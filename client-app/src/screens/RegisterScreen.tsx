import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useState } from 'react';
import AuthLayout from './AuthLayout';

export default function RegisterScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
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
          onPress={() => {
            const nextEmailError = email ? '' : 'Required';
            const nextPasswordError = password ? '' : 'Required';
            const nextConfirmError = confirm ? '' : 'Required';
            const mismatch = password && confirm && password !== confirm ? 'Passwords do not match' : '';
            setEmailError(nextEmailError);
            setPasswordError(nextPasswordError || mismatch);
            setConfirmError(nextConfirmError || mismatch);
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
    marginTop: 5,
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
