import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useState } from 'react';
import AuthLayout from './AuthLayout';

export default function ForgotScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  return (
    <AuthLayout title="Restore Password">
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

        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            const nextEmailError = email ? '' : 'Required';
            setEmailError(nextEmailError);
          }}
        >
          <Text style={styles.primaryButtonText}>Send e-mail</Text>
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
    backgroundColor: '#0b2d6b',
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
