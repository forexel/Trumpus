import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
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
import { ChatItem, createChat, sendMessage } from '../lib/api';

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

export default function ChatsScreen({
  chats,
  loading,
  onRefresh,
  onOpenChat,
  onStartChat,
}: {
  chats: ChatItem[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onOpenChat: (chat: ChatItem) => void;
  onStartChat: (chat: ChatItem) => void;
}) {
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [persona, setPersona] = useState(personas[0].name);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const avatarMap = useMemo(() => {
    const map = new Map<string, number>();
    personas.forEach((p) => map.set(p.name, p.avatar));
    return map;
  }, []);

  useEffect(() => {
    onRefresh();
  }, []);

  const hasChats = chats.length > 0;
  const listItems = chats;

  const handleStart = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const chat = await createChat(persona, '');
      await sendMessage(chat.id, text.trim(), persona);
      setText('');
      onStartChat(chat);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start chat');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom || 12 }]}>
      <View style={styles.header}>
        <Text style={styles.headerBrand}>Trumpus</Text>
      </View>

      {hasChats ? (
        <ScrollView contentContainerStyle={styles.listWrap}>
          {listItems.map((chat) => {
            const avatar = avatarMap.get(chat.persona) ?? trump;
            return (
              <Pressable key={chat.id} style={styles.row} onPress={() => onOpenChat(chat)}>
                <Image source={avatar} style={styles.avatar} />
                <View style={styles.rowText}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName}>{chat.title || chat.persona}</Text>
                    <Text style={styles.rowTime}>{chat.last_message_at ? new Date(chat.last_message_at).toLocaleTimeString().slice(0, 5) : ''}</Text>
                  </View>
                  <Text style={styles.rowPreview}>Tap to start chatting</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Start new chat with...</Text>
          <Pressable style={styles.select} onPress={() => setPickerOpen((v) => !v)}>
            <Image source={avatarMap.get(persona) ?? trump} style={styles.selectAvatar} />
            <Text style={styles.selectText}>{persona}</Text>
            <View style={[styles.chevron, pickerOpen ? styles.chevronOpen : null]} />
          </Pressable>
          {pickerOpen ? (
            <View style={styles.selectList}>
              <ScrollView style={{ maxHeight: 320 }}>
                {personas.map((p) => (
                  <Pressable
                    key={p.name}
                    style={styles.selectItem}
                    onPress={() => {
                      setPersona(p.name);
                      setPickerOpen(false);
                    }}
                  >
                    <Image source={p.avatar} style={styles.selectAvatar} />
                    <Text style={styles.selectItemText}>{p.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      )}

      {!hasChats ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor="#9ca3af"
            value={text}
            onChangeText={setText}
          />
          <Pressable style={[styles.send, sending ? styles.sendDisabled : null]} onPress={handleStart} disabled={sending}>
            <Image source={eagle} style={styles.sendIcon} />
          </Pressable>
        </View>
      ) : null}
      {!hasChats && error ? <Text style={styles.errorText}>{error}</Text> : null}
      {loading ? <Text style={styles.loadingText}>Loading...</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b0b0b',
  },
  header: {
    height: 56,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    justifyContent: 'center',
  },
  headerBrand: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  listWrap: {
    padding: 12,
    gap: 10,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 14,
  },
  emptyTitle: {
    color: '#e2e8f0',
    fontSize: 18,
    fontWeight: '600',
  },
  select: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#111214',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  selectText: {
    color: '#ffffff',
    fontWeight: '600',
    flex: 1,
  },
  chevron: {
    width: 10,
    height: 10,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#94a3b8',
    transform: [{ rotate: '45deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '-135deg' }],
  },
  selectList: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#111214',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    paddingVertical: 8,
  },
  selectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  selectItemText: {
    color: '#e2e8f0',
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#111214',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  rowText: {
    flex: 1,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowName: {
    color: '#ffffff',
    fontWeight: '700',
  },
  rowTime: {
    color: '#94a3b8',
    fontSize: 12,
  },
  rowPreview: {
    color: '#94a3b8',
    marginTop: 4,
    fontSize: 13,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    backgroundColor: '#0b0b0b',
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
  sendDisabled: {
    opacity: 0.6,
  },
  sendIcon: {
    width: 22,
    height: 22,
    tintColor: '#fff',
  },
  errorText: {
    color: '#f87171',
    textAlign: 'center',
    paddingBottom: 8,
  },
  loadingText: {
    color: '#94a3b8',
    textAlign: 'center',
    paddingBottom: 8,
  },
});
