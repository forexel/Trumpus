import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ForgotScreen from './src/screens/ForgotScreen';
import ChatsScreen from './src/screens/ChatsScreen';
import ChatDetailScreen from './src/screens/ChatDetailScreen';
import ErrorScreen from './src/screens/ErrorScreen';
import { getAccessToken, refreshTokens } from './src/lib/auth';
import { ChatItem, fetchChats } from './src/lib/api';

export default function App() {
  const [screen, setScreen] = useState<'login' | 'register' | 'forgot' | 'chats' | 'chat'>('login');
  const [status, setStatus] = useState('');
  const [errorState, setErrorState] = useState<{
    title: string;
    message: string;
    retry: () => void;
  } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [activeChat, setActiveChat] = useState<ChatItem | null>(null);
  const [loadingChats, setLoadingChats] = useState(false);

  const loadChats = async () => {
    setLoadingChats(true);
    try {
      const items = await fetchChats();
      const sorted = [...items].sort((a, b) => (a.last_message_at || '').localeCompare(b.last_message_at || '')).reverse();
      setChats(sorted);
      return sorted;
    } finally {
      setLoadingChats(false);
    }
  };

  useEffect(() => {
    async function bootstrap() {
      const token = await getAccessToken();
      if (!token) {
        const refreshed = await refreshTokens();
        if (!refreshed) {
          setAuthReady(true);
          return;
        }
      }
      const items = await loadChats();
      if (items.length > 0) {
        setActiveChat(items[0]);
        setScreen('chat');
      } else {
        setScreen('chats');
      }
      setAuthReady(true);
    }
    bootstrap();
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      {!authReady ? null : (
        <>
          {errorState ? (
            <ErrorScreen
              title={errorState.title}
              message={errorState.message}
              onBack={() => {
                setErrorState(null);
                setScreen('login');
              }}
              onRetry={() => {
                const retry = errorState.retry;
                setErrorState(null);
                retry();
              }}
            />
          ) : null}

          {!errorState && screen === 'login' ? (
            <LoginScreen
              onGoogleStatus={setStatus}
              onForgot={() => setScreen('forgot')}
              onRegister={() => setScreen('register')}
              onLogin={async () => {
                const items = await loadChats();
                if (items.length > 0) {
                  setActiveChat(items[0]);
                  setScreen('chat');
                } else {
                  setScreen('chats');
                }
              }}
              onError={(title, message, retry) => setErrorState({ title, message, retry })}
            />
          ) : null}
          {!errorState && screen === 'register' ? (
            <RegisterScreen
              onBack={() => setScreen('login')}
              onRegister={async () => {
                const items = await loadChats();
                if (items.length > 0) {
                  setActiveChat(items[0]);
                  setScreen('chat');
                } else {
                  setScreen('chats');
                }
              }}
            />
          ) : null}
          {!errorState && screen === 'forgot' ? <ForgotScreen onBack={() => setScreen('login')} /> : null}
          {!errorState && screen === 'chats' ? (
            <ChatsScreen
              chats={chats}
              loading={loadingChats}
              onRefresh={loadChats}
              onOpenChat={(chat) => {
                setActiveChat(chat);
                setScreen('chat');
              }}
              onStartChat={(chat) => {
                setActiveChat(chat);
                setScreen('chat');
              }}
            />
          ) : null}
          {!errorState && screen === 'chat' && activeChat ? (
            <ChatDetailScreen
              chat={activeChat}
              onBack={async () => {
                await loadChats();
                setScreen('chats');
              }}
            />
          ) : null}
        </>
      )}

      {status ? (
        <View style={styles.statusWrap}>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      ) : null}
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b1226',
  },
  statusWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    padding: 10,
  },
  statusText: {
    color: '#e2e8f0',
    fontSize: 12,
    textAlign: 'center',
  },
});
