import { Pressable, StyleSheet, Text, View } from 'react-native';
import AuthLayout from './AuthLayout';

export type ErrorScreenProps = {
  title: string;
  message: string;
  onBack: () => void;
  onRetry: () => void;
};

export default function ErrorScreen({ title, message, onBack, onRetry }: ErrorScreenProps) {
  return (
    <AuthLayout title={title}>
      <View style={styles.card}>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>
          <Pressable style={[styles.button, styles.buttonGhost]} onPress={onBack}>
            <Text style={[styles.buttonText, styles.buttonTextGhost]}>Back</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={onRetry}>
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 360,
    padding: 8,
    gap: 10,
  },
  message: {
    color: '#1f2937',
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  button: {
    backgroundColor: '#bf0a30',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#002868',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  buttonTextGhost: {
    color: '#002868',
  },
});
