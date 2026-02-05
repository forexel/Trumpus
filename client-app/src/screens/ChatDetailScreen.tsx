import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import eagle from '../../assets/eagle.png';
import trump from '../../assets/DonaldTrump.png';

const demoMessages = [
  { id: '1', sender: 'ai', content: 'Привет! Лучший! Никто не знает больше обо всём, чем я.', time: '18:55' },
  { id: '2', sender: 'client', content: 'привет', time: '18:55' },
  { id: '3', sender: 'ai', content: 'LLM did not return a response.', time: '18:55' },
];

export default function ChatDetailScreen({ onBack }: { onBack: () => void }) {
  const typing = true;
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={onBack} />
        <Text style={styles.flag}>🇺🇸</Text>
        <Image source={trump} style={styles.avatar} />
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>привет</Text>
          <Text style={styles.headerStatus}>online</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.messages}>
        {demoMessages.map((m) => (
          <View key={m.id} style={[styles.bubble, m.sender === 'client' ? styles.userBubble : styles.aiBubble]}>
            <Text style={styles.bubbleText}>{m.content}</Text>
            <Text style={styles.bubbleTime}>{m.time}</Text>
          </View>
        ))}
        <View style={[styles.bubble, styles.aiBubble]}>
          <View style={styles.typingDots}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
        </View>
      </ScrollView>

      <View style={styles.composer}>
        <TextInput style={styles.input} placeholder="Type a message..." placeholderTextColor="#9ca3af" />
        <Pressable style={[styles.send, typing ? styles.sendStop : null]}>
          {typing ? <View style={styles.stopIcon} /> : <Image source={eagle} style={styles.sendIcon} />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b0b0b',
  },
  header: {
    height: 60,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  back: {
    width: 26,
    height: 26,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#e2e8f0',
    transform: [{ rotate: '45deg' }],
    marginRight: 4,
  },
  flag: {
    fontSize: 18,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    color: '#ffffff',
    fontWeight: '700',
  },
  headerStatus: {
    color: '#22c55e',
    fontSize: 12,
    marginTop: 2,
  },
  messages: {
    padding: 16,
    gap: 12,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 14,
    padding: 12,
  },
  aiBubble: {
    backgroundColor: '#0b2d6b',
    alignSelf: 'flex-start',
  },
  userBubble: {
    backgroundColor: '#bf0a30',
    alignSelf: 'flex-end',
  },
  bubbleText: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTime: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    alignSelf: 'flex-end',
  },
  typingDots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e2e8f0',
    opacity: 0.8,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  input: {
    flex: 1,
    backgroundColor: '#1f1f1f',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#30343a',
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#bf0a30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendStop: {
    backgroundColor: '#111827',
  },
  sendIcon: {
    width: 22,
    height: 22,
    tintColor: '#fff',
  },
  stopIcon: {
    width: 14,
    height: 14,
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
});
