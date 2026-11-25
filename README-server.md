# SECTOR 09 — выделенный сервер

Один авторитетный Node.js 24 / WebSocket-сервер. Клиент размещён на GitHub Pages, игровой сервер — отдельно (текущий адрес `wss://sector-09.enzonic.dev/ws`, задаётся также в `public/network-config.json`). Тестовый Pages-билд не подключается к боевому серверу.

## Запуск

```sh
npm ci --omit=dev
npm start
```

Docker: `docker build -t sector09 .`, запуск с переменными окружения из `.env.example` и постоянным томом для `/app/data`. Внешний TLS/WSS обеспечивает хостинг или reverse proxy с WebSocket Upgrade. Внутренний HTTP-порт — 8080 по умолчанию. `GET /health` возвращает состояние, версию и протокол. Не публикуйте токены или сервисные ключи в клиентском коде.

## Переменные окружения

| Переменная | По умолчанию | Назначение |
|---|---:|---|
| PORT | 8080 | HTTP/WS порт |
| TICK_HZ | 60 | Симуляция, 30–60 |
| SNAPSHOT_HZ | 30 | Снимки, 10–30 |
| MAX_PLAYERS | 7 | Игроки, 2–7 |
| BOTS | 8 | Боты по умолчанию |
| MAX_BOTS | 30 | Максимум ботов |
| RECONNECT_SECONDS | 30 | Окно переподключения |
| EMPTY_ROOM_SECONDS | 60 | Удаление пустой комнаты |
| ALLOWED_ORIGINS | — | Разрешённые Origin через запятую |
| LAG_COMPENSATION | 1 | Компенсация задержки |
| LOG_METRICS | 0 | Периодический вывод метрик |

Метрики: `METRICS_TOKEN`, `METRICS_ALLOW_LOCAL`, `GET /metrics`; защищайте токен. `node scripts/server-traffic.mjs http://127.0.0.1:8080 60` помогает измерить трафик. 30 ботов и 7 игроков — предел настройки, а не гарантия производительности.

## Профили и данные

Firebase: `FIREBASE_DATABASE_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` — серверные переменные. Учётные данные хранить в секретах хостинга. Публичная конфигурация SDK передаётся через `SECTOR_FIREBASE_WEB_CONFIG`. При работе без Firebase файл кейсов задаётся `CASE_INVENTORY_FILE` (по умолчанию `data/case-inventory.json`); сохраняйте его между перезапусками. Правила RTDB — `firebase/database.rules.json`.

## Публикация клиента

В GitHub Actions задайте `SECTOR_SERVER_URL` с публичным WSS-адресом. Обновляйте main и сервер совместимыми коммитами; несовпадение протокола или ревизии карт блокирует соединение. [Спецификация протокола](docs/network-protocol.md), [профили](docs/player-profile.md).
