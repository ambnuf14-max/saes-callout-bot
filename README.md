# SAES Callout Bot

Discord + VK + Telegram бот для управления каллаутами (вызовами экстренных служб) на ролевом сервере Los Santos.

---

## Что делает бот

Автоматизирует систему вызовов между фракциями. Лидер или сотрудник создаёт каллаут в Discord — бот моментально рассылает уведомления в VK беседы и Telegram группы нужных подразделений. Те реагируют кнопкой прямо из мессенджера, Discord получает подтверждение.

**Поток:**
```
Создание каллаута (Discord)
    ↓
Уведомление → VK беседа подразделения
Уведомление → Telegram группа подразделения
    ↓
Реагирование кнопкой (VK / Telegram)
    ↓
Подтверждение в Discord канале инцидента
```

---

## Возможности

### Каллауты
- Создание через интерактивную панель с модальным окном (описание, локация, TAC-канал, краткое описание)
- Автоматическое создание отдельного канала для каждого инцидента
- Одновременная рассылка в VK и Telegram
- Реагирование из VK/Telegram — кнопка исчезает после первого ответа (дедупликация по подразделению)
- Закрытие инцидента с указанием причины
- Автозакрытие по таймауту
- История каллаутов в лидерской панели с пагинацией

### Структура организации
- **Фракции** — верхний уровень (LSPD, LSFD, EMS и др.)
- **Подразделения** — отделы внутри фракции, у каждого своя VK беседа и Telegram группа
- Система привязки VK/Telegram через токены верификации (команда `/verify TOKEN`)

### Панели управления
- **Админ-панель** — полное управление фракциями, подразделениями, ролями, настройками сервера
- **Лидерская панель** — управление своей фракцией, запросы на изменение структуры

### Система изменений (Pending Changes)
Лидеры не могут напрямую менять структуру — они создают запросы, которые администратор одобряет или отклоняет. Запрос появляется в audit log канале с кнопками. После решения сообщение обновляется, автор получает DM.

### Audit Log
Все важные события логируются в отдельный Discord канал:
- Создание/закрытие каллаутов (с VK/Telegram статусами)
- Реагирования из VK и Telegram
- Запросы на изменения (одобрение/отклонение/отмена)
- Привязка VK/Telegram бесед
- Изменения настроек сервера

---

## Стек

| Компонент | Технология |
|---|---|
| Язык | TypeScript |
| Discord | discord.js v14 |
| VK | vk-io |
| Telegram | node-telegram-bot-api |
| БД | SQLite (better-sqlite3) |
| Логирование | Winston |
| Деплой | Docker + Docker Compose |

---

## Структура проекта

```
saes-callout-bot/
├── src/
│   ├── index.ts                  # Точка входа
│   ├── config/                   # Конфигурация и константы
│   ├── database/
│   │   ├── models/               # Модели (Callout, Faction, Subdivision, ...)
│   │   ├── migrations/           # SQL миграции (001–020)
│   │   └── migrations.ts         # Запуск миграций
│   ├── discord/
│   │   ├── commands/             # Slash-команды (/setup, /callout, /history)
│   │   ├── events/               # Discord события
│   │   ├── interactions/         # Обработчики кнопок, модалок, select-меню
│   │   └── utils/                # Embed-билдеры, audit-logger, панели
│   ├── vk/                       # VK бот (Long Poll, обработчики)
│   ├── telegram/                 # Telegram бот (polling/webhook)
│   ├── services/                 # Бизнес-логика
│   │   ├── callout.service.ts
│   │   ├── sync.service.ts       # Синхронизация VK/TG → Discord
│   │   ├── pending-change.service.ts
│   │   └── notification.service.ts
│   ├── types/                    # TypeScript типы
│   └── utils/                    # Общие утилиты
├── data/                         # SQLite БД (персистентный volume)
├── logs/                         # Логи (персистентный volume)
├── .env                          # Переменные окружения
├── docker-compose.yml
└── Dockerfile
```

---

## Переменные окружения

```env
# Discord
DISCORD_TOKEN=              # Токен бота (Bot → Token)
DISCORD_CLIENT_ID=          # ID приложения (General Information → Application ID)

# VK
VK_TOKEN=                   # Токен группы (Управление → Работа с API)
VK_GROUP_ID=                # ID группы VK

# Telegram
TELEGRAM_BOT_TOKEN=         # Токен от @BotFather
TELEGRAM_BOT_USERNAME=      # Username бота (без @)

# База данных
DATABASE_PATH=/app/data/database.sqlite

# Логирование
LOG_LEVEL=info
LOG_FILE=/app/logs/bot.log

# Функции
AUTO_DELETE_CHANNELS=true   # Удалять канал после закрытия инцидента
CHANNEL_DELETE_DELAY=180000 # Задержка удаления (мс), по умолчанию 3 мин
```

---

## Быстрый запуск

```bash
git clone <репозиторий> saes-callout-bot
cd saes-callout-bot
cp .env.example .env
nano .env          # заполнить токены
docker compose build
docker compose up -d
```

Подробная инструкция по деплою на VDS — см. **QUICK_START.md** и **DEPLOY.md**.

---

## Discord — первоначальная настройка

После запуска бота на сервере Discord:

1. **`/setup`** — создаёт категорию и канал с кнопкой каллаута (только для администраторов)
2. **Открыть Админ-панель** → кнопка появится в настроенном канале
3. Создать фракции, добавить подразделения, настроить роли и audit log канал
4. Лидеры привязывают VK/Telegram через верификационный токен в лидерской панели

---

## Управление Docker

```bash
# Запуск
docker compose up -d

# Остановка
docker compose down

# Пересборка и перезапуск
docker compose build && docker compose up -d

# Логи в реальном времени
docker compose logs -f

# Последние 200 строк
docker compose logs --tail=200

# Статус контейнера
docker ps

# Вход в контейнер
docker exec -it saes-callout-bot sh
```

---

## База данных

SQLite, файл `/app/data/database.sqlite` (монтируется в `./data/` на хосте).

Таблицы:
- `servers` — настройки Discord серверов
- `factions` — фракции
- `subdivisions` — подразделения
- `callouts` — инциденты
- `callout_responses` — реагирования
- `pending_changes` — запросы на изменение структуры
- `faction_types` — типы фракций
- `subdivision_templates` — шаблоны подразделений
- `vk_verification_tokens` — токены привязки VK/Telegram

Миграции запускаются автоматически при старте бота.

---

## Резервная копия БД

```bash
# Создать бэкап
cp data/database.sqlite data/database.sqlite.bak

# Восстановить
cp data/database.sqlite.bak data/database.sqlite
docker compose restart
```
