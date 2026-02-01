# Tech Stack (draft)

## Клиент
- React Native + Expo (быстрый старт, OTA обновления, iOS/Android из одного кода)
- Сеть: fetch/axios + React Query
- Навигация: React Navigation
- State: Zustand (минималистично) или Redux Toolkit

## Админка (web)
- React + Vite
- UI: MUI/AntD или собственные компоненты
- Авторизация: JWT + refresh

## Сервер
- Go (Gin/Fiber + sqlc + pgx)
- БД: PostgreSQL
- Реалтайм: WebSocket (или SSE на старте)
- Очереди/фоновые задачи: в перспективе (Redis + worker)

## LLM-обвязка
- Отдельный сервис на Python, который вызывает LLM и пишет в API сервера

## Почему так
- Go — высокая производительность и простая эксплуатация при большой нагрузке
- React Native — нативная сборка без двух отдельных кодовых баз
- Web admin — быстро и дешево в поддержке

