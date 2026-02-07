import { Animated, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
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

function MoonIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SunIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="4" stroke="#ffffff" strokeWidth={2} />
      <Line x1="12" y1="1" x2="12" y2="3" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
      <Line x1="12" y1="21" x2="12" y2="23" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
      <Line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
      <Line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
      <Line x1="1" y1="12" x2="3" y2="12" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
      <Line x1="21" y1="12" x2="23" y2="12" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
      <Line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
      <Line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function LogoutIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M16 17l5-5-5-5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="21" y1="12" x2="9" y2="12" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export default function ChatsScreen({
  chats,
  loading,
  onRefresh,
  onOpenChat,
  onStartChat,
  theme,
  onToggleTheme,
  onLogout,
}: {
  chats: ChatItem[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onOpenChat: (chat: ChatItem) => void;
  onStartChat: (chat: ChatItem) => void;
  theme: { mode: 'dark' | 'light' };
  onToggleTheme: () => void;
  onLogout: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [persona, setPersona] = useState(personas[0].name);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const isLight = theme?.mode === 'light';
  const toggleX = useRef(new Animated.Value(isLight ? 0 : 24)).current;
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const colors = {
    bg: isLight ? '#f8fafc' : '#0b0b0b',
    headerBorder: isLight ? '#e2e8f0' : '#1f2937',
    cardBg: isLight ? '#ffffff' : '#0b0b0b',
    cardHover: isLight ? '#f5f5f5' : '#111214',
    border: isLight ? '#e2e8f0' : '#1f2937',
    text: isLight ? '#0f172a' : '#ffffff',
    subtext: isLight ? '#64748b' : '#94a3b8',
    muted: isLight ? '#9ca3af' : '#6b7280',
    inputBg: isLight ? '#ffffff' : '#1f1f1f',
    inputBorder: isLight ? '#cbd5e1' : '#30343a',
  };

  const avatarMap = useMemo(() => {
    const map = new Map<string, number>();
    personas.forEach((p) => map.set(p.name, p.avatar));
    return map;
  }, []);

  useEffect(() => {
    onRefresh();
  }, []);
  useEffect(() => {
    Animated.timing(toggleX, {
      toValue: isLight ? 0 : 24,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [isLight, toggleX]);

  const hasChats = chats.length > 0;
  const listItems = chats;
  const selectablePersonas = useMemo(
    () => personas.filter((p) => p.name !== persona),
    [persona]
  );
  const [maxOptionsHeight, setMaxOptionsHeight] = useState(280);
  const selectRef = useRef<View | null>(null);
  const composerReserve = 96;
  const emptyPaddingTop = useMemo(() => Math.max(12, (insets.top || 0) + 4), [insets.top]);
  const emptyPaddingBottom = useMemo(() => Math.max(16, (insets.bottom || 0) + 16), [insets.bottom]);
  const newChatWidth = useMemo(() => Math.min(260, Math.max(180, Math.floor(windowWidth * 0.5))), [windowWidth]);

  useEffect(() => {
    if (!pickerOpen || !selectRef.current) return;
    selectRef.current.measureInWindow((x, y, w, h) => {
      const rowHeight = 56;
      const available = windowHeight - (y + h) - composerReserve - Math.max(12, (insets.bottom || 0) + 8);
      const maxRows = Math.min(7, Math.max(3, Math.floor(available / rowHeight)));
      setMaxOptionsHeight(Math.min(available, rowHeight * maxRows));
    });
  }, [pickerOpen, windowHeight, insets.bottom]);

  const handleStart = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const chat = await createChat(persona, '');
      await sendMessage(chat.id, text.trim(), persona);
      setText('');
      setShowNewChat(false);
      onStartChat(chat);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start chat');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 72 : 44 + (insets.top || 0)}
    >
      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.headerBorder,
          },
        ]}
      >
        {hasChats && showNewChat ? (
          <Pressable style={[styles.back, { borderColor: colors.text }]} onPress={() => setShowNewChat(false)} />
        ) : null}
        <Text style={[styles.headerBrand, { color: colors.text }]}>Trumpus</Text>
        <View style={styles.headerActions}>
          <Pressable style={[styles.themeToggle, isLight ? styles.themeToggleLight : styles.themeToggleDark]} onPress={onToggleTheme}>
            <View style={[styles.themeIconWrap, styles.themeIconLeft, isLight ? styles.themeIconDim : null]}>
              <MoonIcon />
            </View>
            <View style={[styles.themeIconWrap, styles.themeIconRight, !isLight ? styles.themeIconDim : null]}>
              <SunIcon />
            </View>
            <Animated.View style={[styles.themeKnob, { transform: [{ translateX: toggleX }] }]} />
          </Pressable>
          <Pressable style={styles.logoutBtn} onPress={onLogout}>
            <LogoutIcon color={isLight ? '#0f172a' : '#e2e8f0'} />
          </Pressable>
        </View>
      </View>

      {hasChats && !showNewChat ? (
        <ScrollView contentContainerStyle={styles.listWrap} keyboardShouldPersistTaps="handled">
          {listItems.map((chat) => {
            const avatar = avatarMap.get(chat.persona) ?? trump;
            return (
              <Pressable
                key={chat.id}
                style={[styles.row, { borderBottomColor: colors.border }]}
                onPress={() => {
                  setShowNewChat(false);
                  onOpenChat(chat);
                }}
              >
                <View style={[styles.rowInner, { backgroundColor: colors.cardBg }]}>
                  <Image source={avatar} style={styles.avatar} />
                  <View style={styles.rowText}>
                    <View style={styles.rowTop}>
                      <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                        {chat.title || chat.persona}
                      </Text>
                      <Text style={[styles.rowTime, { color: colors.subtext }]}>
                        {chat.last_message_at ? new Date(chat.last_message_at).toLocaleTimeString().slice(0, 5) : ''}
                      </Text>
                    </View>
                    <Text style={[styles.rowPreview, { color: colors.subtext }]} numberOfLines={1}>
                      Tap to start chatting
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <View style={[styles.emptyWrap, { paddingTop: emptyPaddingTop, paddingBottom: emptyPaddingBottom }]}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Start new chat with...</Text>
          <Pressable
            style={[styles.select, { backgroundColor: colors.cardBg, borderColor: isLight ? '#c9c9c9' : colors.border }]}
            onPress={() => setPickerOpen((v) => !v)}
            ref={selectRef}
          >
            <Image source={avatarMap.get(persona) ?? trump} style={styles.selectAvatar} />
            <Text style={[styles.selectText, { color: isLight ? '#111' : colors.text }]}>{persona}</Text>
            <View
              style={[
                styles.chevron,
                pickerOpen ? styles.chevronOpen : null,
                { borderColor: isLight ? '#bdbdbd' : colors.subtext },
              ]}
            />
          </Pressable>
          {pickerOpen ? (
            <View
              style={[
                styles.selectList,
                { backgroundColor: colors.cardBg, borderColor: isLight ? '#c9c9c9' : colors.border, maxHeight: maxOptionsHeight },
              ]}
            >
              <ScrollView style={{ maxHeight: maxOptionsHeight }}>
                {selectablePersonas.map((p) => (
                  <Pressable
                    key={p.name}
                    style={styles.selectItem}
                    onPress={() => {
                      setPersona(p.name);
                      setPickerOpen(false);
                    }}
                  >
                    <View style={[styles.selectAvatarWrap, { borderColor: isLight ? '#bdbdbd' : colors.border }]}>
                      <Image source={p.avatar} style={styles.selectAvatarImage} />
                    </View>
                    <Text style={[styles.selectItemText, { color: isLight ? '#111' : colors.text }]}>{p.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      )}

      {hasChats && !showNewChat ? (
        <Pressable
          style={[
            styles.newChatBtn,
            { bottom: (insets.bottom || 0) + 5, width: newChatWidth },
          ]}
          onPress={() => setShowNewChat(true)}
        >
          <Text style={styles.newChatText}>New chat</Text>
        </Pressable>
      ) : null}
      {!hasChats || showNewChat ? (
        <View
          style={[
            styles.composer,
            {
              borderTopColor: colors.headerBorder,
              backgroundColor: colors.bg,
              paddingBottom: 5,
            },
          ]}
        > 
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
            placeholder="Type a message..."
            placeholderTextColor={colors.muted}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b0b0b',
  },
  header: {
    height: 44,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  back: {
    width: 22,
    height: 22,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    transform: [{ rotate: '45deg' }],
  },
  headerBrand: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  themeToggle: {
    height: 28,
    width: 52,
    borderRadius: 999,
    paddingHorizontal: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  themeToggleDark: {
    backgroundColor: '#3f0a1a',
  },
  themeToggleLight: {
    backgroundColor: '#bf0a30',
  },
  themeIconWrap: {
    position: 'absolute',
    top: 7,
    width: 14,
    height: 14,
  },
  themeIconLeft: {
    left: 8,
  },
  themeIconRight: {
    right: 8,
  },
  themeIconDim: {
    opacity: 0.5,
  },
  themeKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
    position: 'absolute',
    top: 3,
    left: 3,
  },
  logoutBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutIcon: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700',
  },
  listWrap: {
    paddingVertical: 8,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 0,
    gap: 18,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '400',
  },
  select: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  selectText: {
    fontSize: 17,
    fontWeight: '500',
    flex: 1,
  },
  chevron: {
    width: 10,
    height: 10,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    transform: [{ rotate: '45deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '-135deg' }],
  },
  selectList: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 2,
    paddingVertical: 0,
    marginTop: -2,
  },
  selectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  selectAvatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectAvatarImage: {
    width: '100%',
    height: '100%',
  },
  selectItemText: {
    fontSize: 17,
    fontWeight: '500',
    flex: 1,
  },
  row: {
    borderWidth: 1,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
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
    fontWeight: '700',
    fontSize: 16,
  },
  rowTime: {
    fontSize: 12,
    minWidth: 48,
    textAlign: 'right',
  },
  rowPreview: {
    marginTop: 4,
    fontSize: 14,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    backgroundColor: '#0b0b0b',
  },
  input: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 0,
    borderWidth: 1,
    textAlignVertical: 'center',
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  newChatBtn: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: '#bf0a30',
    height: 60,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newChatText: {
    color: '#fff',
    fontWeight: '600',
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
