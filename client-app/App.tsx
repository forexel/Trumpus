import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import * as Linking from 'expo-linking';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ForgotScreen from './src/screens/ForgotScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import ChatsScreen from './src/screens/ChatsScreen';
import ChatDetailScreen from './src/screens/ChatDetailScreen';
import ErrorScreen from './src/screens/ErrorScreen';
import { clearTokens, getAccessToken, refreshTokens } from './src/lib/auth';
import { ChatItem, fetchChats } from './src/lib/api';

export default function App() {
  const [screen, setScreen] = useState<'login' | 'register' | 'forgot' | 'reset' | 'chats' | 'chat'>('login');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{
    title: string;
    message: string;
    retry: () => void;
  } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [activeChat, setActiveChat] = useState<ChatItem | null>(null);
  const [loadingChats, setLoadingChats] = useState(false);
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  const theme = { mode: themeMode };
  const isLight = themeMode === 'light';

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

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      const parsed = Linking.parse(url);
      const token = typeof parsed.queryParams?.token === 'string' ? parsed.queryParams.token : '';
      if (!token) return;
      setResetToken(token);
      setScreen('reset');
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', (event) => handleUrl(event.url));
    return () => sub.remove();
  }, []);

  const handleLogout = async () => {
    await clearTokens();
    setChats([]);
    setActiveChat(null);
    setScreen('login');
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.screen, { backgroundColor: isLight ? '#f8fafc' : '#0b0b0b' }]} edges={['top', 'bottom']}>
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
          {!errorState && screen === 'reset' && resetToken ? (
            <ResetPasswordScreen
              token={resetToken}
              onBack={() => setScreen('login')}
              onSuccess={async () => {
                setResetToken(null);
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
              theme={theme}
              onToggleTheme={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
              onLogout={handleLogout}
            />
          ) : null}
          {!errorState && screen === 'chat' && activeChat ? (
            <ChatDetailScreen
              chat={activeChat}
              onBack={async () => {
                await loadChats();
                setScreen('chats');
              }}
              theme={theme}
              onToggleTheme={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
              onLogout={handleLogout}
            />
          ) : null}
        </>
      )}

      <StatusBar style={isLight ? 'dark' : 'light'} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b1226',
  },
});
