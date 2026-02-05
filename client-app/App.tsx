import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ForgotScreen from './src/screens/ForgotScreen';
import ChatsScreen from './src/screens/ChatsScreen';
import ChatDetailScreen from './src/screens/ChatDetailScreen';
import ErrorScreen from './src/screens/ErrorScreen';

export default function App() {
  const [screen, setScreen] = useState<'login' | 'register' | 'forgot' | 'chats' | 'chat'>('login');
  const [status, setStatus] = useState('');
  const [errorState, setErrorState] = useState<{
    title: string;
    message: string;
    retry: () => void;
  } | null>(null);

  return (
    <SafeAreaView style={styles.screen}>
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
          onLogin={() => setScreen('chats')}
          onError={(title, message, retry) => setErrorState({ title, message, retry })}
        />
      ) : null}
      {!errorState && screen === 'register' ? <RegisterScreen onBack={() => setScreen('login')} /> : null}
      {!errorState && screen === 'forgot' ? <ForgotScreen onBack={() => setScreen('login')} /> : null}
      {!errorState && screen === 'chats' ? <ChatsScreen onOpenChat={() => setScreen('chat')} /> : null}
      {!errorState && screen === 'chat' ? <ChatDetailScreen onBack={() => setScreen('chats')} /> : null}

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
