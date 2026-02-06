import { ReactNode } from 'react';
import { Image, ImageBackground, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const bg = require('../../assets/auth-bg.png');
const eagle = require('../../assets/eagle.png');

export default function AuthLayout({ children, title }: { children: ReactNode; title: string }) {
  const insets = useSafeAreaInsets();
  const topOffset = Math.max(insets.top + 20, 72);
  return (
    <ImageBackground source={bg} style={styles.screen} resizeMode="cover">
      <View style={styles.overlay} />
      <View style={[styles.content, { paddingTop: topOffset }]}>
        <Image source={eagle} style={styles.eagle} />
        <Text style={styles.brand}>Trumpus</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{title}</Text>
          {children}
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  content: {
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 12,
    paddingBottom: 24,
  },
  eagle: {
    width: 80,
    height: 80,
    marginBottom: -8,
  },
  brand: {
    fontSize: 46,
    fontWeight: '900',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: -2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 6,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 3,
    borderColor: '#002868',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  cardTitle: {
    marginBottom: 16,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    color: '#002868',
  },
});
