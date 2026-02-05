import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import eagle from '../../assets/eagle.png';
import trump from '../../assets/DonaldTrump.png';
import musk from '../../assets/ElonMask.png';
import kanye from '../../assets/KaneyWest.png';
import nixon from '../../assets/RichardNixon.png';
import jackson from '../../assets/AndrewJackson.png';
import greene from '../../assets/MarjorieTaylorGreene.png';
import tucker from '../../assets/TuckerCarlson.png';
import lbj from '../../assets/LyndonBJohnson.png';
import zuck from '../../assets/MarkZuckerberg.png';
import epstein from '../../assets/JeffreyEpstein.png';
import { ChatItem, fetchMessages, MessageItem, sendMessage } from '../lib/api';

const personas = [
  { name: 'Donald Trump', avatar: trump },
  { name: 'Elon Musk', avatar: musk },
  { name: 'Kanye West', avatar: kanye },
  { name: 'Richard Nixon', avatar: nixon },
  { name: 'Andrew Jackson', avatar: jackson },
  { name: 'Marjorie Taylor Greene', avatar: greene },
  { name: 'Tucker Carlson', avatar: tucker },
  { name: 'Lyndon B. Johnson', avatar: lbj },
  { name: 'Mark Zuckerberg', avatar: zuck },
  { name: 'Jeffrey Epstein', avatar: epstein },
];

export default function ChatDetailScreen({ onBack, chat }: { onBack: () => void; chat: ChatItem }) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  const avatarMap = useMemo(() => {
    const map = new Map<string, number>();
    personas.forEach((p) => map.set(p.name, p.avatar));
    return map;
  }, []);

  const loadMessages = async () => {
    const items = await fetchMessages(chat.id);
    setMessages(items);
  };

  useEffect(() => {
    loadMessages();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [chat.id]);

  const startPolling = (since: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const start = Date.now();
    pollRef.current = setInterval(async () => {
      try {
        const items = await fetchMessages(chat.id);
        setMessages(items);
        const hasNewAdmin = items.some((m) => m.sender === 'admin' && m.created_at > since);
        if (hasNewAdmin) {
          setTyping(false);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // ignore polling errors
      }
      if (Date.now() - start > 60000) {
        setTyping(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 2000);
  };
  const headerAvatar = avatarMap.get(chat.persona) ?? trump;

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom || 12 }]}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={onBack} />
        <Text style={styles.flag}>🇺🇸</Text>
        <Image source={headerAvatar} style={styles.avatar} />
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{chat.title || chat.persona}</Text>
          <Text style={styles.headerStatus}>online</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((m) => (
          <View key={m.id} style={[styles.bubble, m.sender === 'client' ? styles.userBubble : styles.aiBubble]}>
            <Text style={styles.bubbleText}>{m.content}</Text>
            <Text style={styles.bubbleTime}>
              {m.created_at ? new Date(m.created_at).toLocaleTimeString().slice(0, 5) : ''}
            </Text>
          </View>
        ))}
        {typing ? (
          <View style={[styles.bubble, styles.aiBubble]}>
            <View style={styles.typingDots}>
              <View style={styles.dot} />
              <View style={styles.dot} />
              <View style={styles.dot} />
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#9ca3af"
          value={text}
          onChangeText={setText}
          editable={!sending}
        />
        <Pressable
          style={[styles.send, typing ? styles.sendStop : null]}
          onPress={async () => {
            if (typing) {
              setTyping(false);
              if (pollRef.current) clearInterval(pollRef.current);
              return;
            }
            if (!text.trim() || sending) return;
            setSending(true);
            try {
              const msg = await sendMessage(chat.id, text.trim(), chat.persona);
              setMessages((prev) => [...prev, msg]);
              setText('');
              setTyping(true);
              startPolling(msg.created_at);
            } finally {
              setSending(false);
            }
          }}
          disabled={sending}
        >
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
