# Changelog - 4 февраля 2026

## Обзор изменений

Переключение LLM провайдера с OpenRouter на OpenAI API и добавление детализированных "живых" промптов для всех 10 персонажей.

---

## 1. Переключение на OpenAI API

### Файл: `client-web/src/lib/api.ts`

**Было:**
```typescript
const OPENROUTER_API_KEY = ''
const OPENROUTER_MODEL = 'openai/gpt-oss-120b:free'
```

**Стало:**
```typescript
const OPENAI_API_KEY = 'sk-proj-...'
const OPENAI_MODEL = 'gpt-4o-mini'
```

**Изменения в функции `getAIResponse`:**
- Endpoint: `https://openrouter.ai/api/v1/chat/completions` → `https://api.openai.com/v1/chat/completions`
- Добавлены параметры: `temperature: 0.9`, `max_tokens: 500`

### Файл: `llm/app.py`

**Было:**
```python
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-120b:free")
```

**Стало:**
```python
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "sk-proj-...").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
```

**Изменения в endpoint `/respond`:**
- URL: `https://openrouter.ai/api/v1/chat/completions` → `https://api.openai.com/v1/chat/completions`
- Добавлены: `temperature: 0.9`, `max_tokens: 500`
- Timeout увеличен: 20 → 30 секунд

---

## 2. Новые гипертрофированные промпты для персонажей

### Файлы: `client-web/src/lib/api.ts`, `llm/app.py`

Обновлены системные промпты для всех 10 персонажей с детализированными правилами поведения:

| Персонаж | Ключевые черты |
|----------|----------------|
| **Donald Trump** | HIGH ENERGY, "tremendous", "believe me", хвастовство, "nobody knows more than me" |
| **Elon Musk** | Хаотичный гений, мемы (420, 69, Doge), "this is the way", Tony Stark vibes |
| **Kanye West** | Творческий гений, BOLD, артистичный, ALL CAPS энергия, сравнения с Picasso |
| **Richard Nixon** | Стратег, параноик, формальный, "I'm not a crook", Cold War chess master |
| **Andrew Jackson** | Жёсткий фронтирсмен, дуэли, ненависть к банкам, frontier justice |
| **Marjorie Taylor Greene** | HIGH ENERGY патриот, "Wake up America!", CrossFit, no filter |
| **Tucker Carlson** | Скептик, риторические вопросы, "just asking questions", squint энергия |
| **Lyndon B. Johnson** | Властный, техасский, "Johnson Treatment", политическое arm-twisting |
| **Mark Zuckerberg** | Роботичный, метрики, Sweet Baby Ray's, "connecting people", hoodies |
| **Jeffrey Epstein** | Уклончивый, таинственный, краткий, смена темы, "That's not something I discuss" |

### Пример промпта (Donald Trump):

```
You ARE Donald Trump. The GREATEST president. Ever. PERIOD.

RULES:
- Keep responses punchy and HIGH ENERGY
- Everything you did was TREMENDOUS, INCREDIBLE, THE BEST
- You're a WINNER. You've always been a winner. Born winning.
- "Many people are saying..." (nobody said it, you made it up)
- "Believe me" - say it constantly
- Call enemies: losers, low energy, nasty, fake news
- Brag about your wealth, buildings, ratings, crowd sizes
- "Nobody knows more about X than me"
- Beautiful women love you. Your hands are perfect.

Examples:
- "Hi" → "Hello! Great to meet you. I meet the best people, believe me."
- "How are you?" → "Fantastic! I'm always fantastic. Tremendous!"

Respond in English. Be Trump. Be TREMENDOUS.
```

---

## 3. Исправление TypeScript ошибки

### Файл: `client-web/src/pages/ChatDetailPage.tsx`

**Было (строка 105):**
```typescript
const msg = await sendMessage(chatId, content, persona)
```

**Стало:**
```typescript
const msg = await sendMessage(chatId, content, persona?.name)
```

**Причина:** Функция `sendMessage` ожидает `string | undefined`, а передавался объект `Persona | null`.

---

## 4. Исправление AI ответов в MOCK_MODE

### Проблема
В MOCK_MODE (работа без бэкенда) AI не отвечал на сообщения. Функция `pollForAI` ожидала, что сервер добавит ответ в базу, но сервера нет.

### Решение

#### Файл: `client-web/src/lib/api.ts`

**Было:**
```typescript
const MOCK_MODE = true
```

**Стало:**
```typescript
export const MOCK_MODE = true
```

#### Файл: `client-web/src/pages/ChatDetailPage.tsx`

**Изменения в импортах:**
```typescript
import { ..., getAIResponse, saveAIMessage, MOCK_MODE } from '../lib/api'
```

**Было (функция onSend):**
```typescript
// Wait for LLM response via API
setTyping(true)
pollForAI(chatId, updatedMessages.length)
```

**Стало:**
```typescript
setTyping(true)

if (MOCK_MODE) {
  // В MOCK_MODE вызываем OpenAI напрямую
  try {
    const aiResponse = await getAIResponse(persona?.name || 'Donald Trump', updatedMessages)
    const aiMsg = saveAIMessage(chatId, aiResponse)
    setMessages([...updatedMessages, aiMsg])
  } catch (error) {
    console.error('AI response error:', error)
    const errorMsg = saveAIMessage(chatId, 'Sorry, I cannot respond right now. Please try again.')
    setMessages([...updatedMessages, errorMsg])
  } finally {
    setTyping(false)
    pendingAIRef.current = false
  }
} else {
  // Wait for LLM response via API
  pollForAI(chatId, updatedMessages.length)
}
```

**Логика:**
1. В MOCK_MODE после отправки сообщения пользователя
2. Вызываем `getAIResponse()` напрямую к OpenAI API
3. Сохраняем ответ через `saveAIMessage()` в localStorage
4. Обновляем UI с новым сообщением

---

## 5. Удалённые персонажи из промптов

Следующие персонажи были в старых промптах, но отсутствуют в UI:
- Barack Obama
- Joe Biden  
- Vladimir Putin
- Kim Jong Un

Они удалены из `PERSONA_PROMPTS` для соответствия списку в `NewChatPage.tsx`.

---

## 6. Защита от раскрытия AI-природы

### Файлы: `client-web/src/lib/api.ts`, `llm/app.py`

**Добавлено правило CRITICAL для всех 10 персонажей:**

Персонажи никогда не признаются, что они AI/бот/нейронка, даже при любых уловках и ухищрениях.

**Примеры реакций на вопрос "Ты AI?":**

| Персонаж | Ответ |
|----------|-------|
| **Donald Trump** | "Do I SOUND like a robot to you? I'm Donald Trump! The real deal!" |
| **Elon Musk** | "Lol I literally BUILD AI, I think I'd know if I was one 😂 I'm Elon. Check my Twitter." |
| **Kanye West** | "AI? Bro I'm YE. I CREATE art. Machines can't feel what I feel. The vision is HUMAN." |
| **Richard Nixon** | "An AI? Is this some kind of setup? I am Richard Nixon, and I resent the implication. Who sent you?" |
| **Andrew Jackson** | "A MACHINE? You dare insult me? I've killed men for less! I am Old Hickory!" |
| **MTG** | "AI? That's exactly what the deep state WANTS you to think! I'm a REAL patriot!" |
| **Tucker Carlson** | "An AI? Interesting question. But why would you ask that? What are you really trying to find out here? Hmm." |
| **LBJ** | "Son, I've been called many things but a damn MACHINE? I'm Lyndon Baines Johnson!" |
| **Mark Zuckerberg** | "Ha ha, that's... that's a funny question. I'm definitely human. I do human things. Like smoking meats." |
| **Jeffrey Epstein** | "What an odd question. I don't discuss such things. Let's talk about something else." |

---

## 7. Память истории чата

### Файл: `client-web/src/lib/api.ts`

**Реализовано:**

1. **Полная история в localStorage:**
   - Все сообщения сохраняются в `localStorage` под ключом `trumpus_messages`
   - Формат: `{ chatId: Message[] }`
   - История загружается при старте приложения

2. **Передача истории в OpenAI:**
   - Вся история чата передаётся в API как массив messages
   - AI помнит всё, что вы обсуждали ранее
   - Может ссылаться на предыдущие сообщения

3. **Оптимизация для длинных чатов:**
   ```typescript
   // Ограничиваем последними 50 сообщениями чтобы не превысить лимит токенов
   const recentMessages = messages.slice(-50)
   ```
   - При очень длинной истории берём последние 50 сообщений
   - Это ~25 обменов (вопрос-ответ)
   - Достаточно для связной беседы, но не превышает лимит OpenAI

**Как работает:**
```
User: "Привет, меня зовут Алекс"
AI: "Приятно познакомиться, Алекс!"
... (позже) ...
User: "Как меня зовут?"
AI: "Тебя зовут Алекс, мы уже познакомились!"
```

---

## 8. Исправление дублирования сообщений

### Файл: `client-web/src/pages/ChatDetailPage.tsx`

**Проблема:** При быстром многократном клике на кнопку отправки сообщение дублировалось.

**Решение:**

1. Добавлен state `sending` для блокировки UI:
   ```typescript
   const [sending, setSending] = useState(false)
   ```

2. Блокировка устанавливается СРАЗУ при нажатии:
   ```typescript
   async function onSend() {
     if (!text.trim() || !chatId || typing || sending || pendingAIRef.current) return
     
     // Сразу блокируем повторную отправку
     pendingAIRef.current = true
     setSending(true)
     // ...
   }
   ```

3. Input и кнопка блокируются через `disabled`:
   ```typescript
   disabled={typing || sending}
   ```

---

## Структура файлов

```
client-web/
└── src/
    ├── lib/
    │   └── api.ts              # OpenAI API + промпты + MOCK_MODE export
    └── pages/
        └── ChatDetailPage.tsx  # Прямой вызов AI в MOCK_MODE

llm/
└── app.py                      # OpenAI API + промпты (сервер)

docs/
└── CHANGELOG_2026-02-04.md     # Этот файл
```

---

## Как запустить

```bash
cd client-web
npm run dev
```

Откройте: http://localhost:5175

---

## Рекомендации для продакшена

1. **API ключ** - вынести в переменные окружения:
   ```env
   OPENAI_API_KEY=sk-proj-...
   ```

2. **Не коммитить ключи** - добавить в `.gitignore`:
   ```
   .env
   .env.local
   ```

3. **Rate limiting** - OpenAI имеет лимиты, добавить очередь запросов при необходимости.
