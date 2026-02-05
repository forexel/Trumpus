import { Pressable, StyleSheet, Text, View } from 'react-native';

export type ErrorScreenProps = {
  title: string;
  message: string;
  onBack: () => void;
  onRetry: () => void;
};

export default function ErrorScreen({ title, message, onBack, onRetry }: ErrorScreenProps) {
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b0b0b',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#111214',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  message: {
    color: '#cbd5f5',
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
    borderColor: '#475569',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  buttonTextGhost: {
    color: '#e2e8f0',
  },
});
