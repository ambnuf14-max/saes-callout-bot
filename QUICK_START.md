# Быстрый запуск на VDS (Ubuntu)

## 1. Установка Docker

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
docker --version
```

---

## 2. Загрузка проекта

**Вариант A — Git:**
```bash
cd /root
git clone <репозиторий> saes-callout-bot
cd saes-callout-bot
```

**Вариант B — SCP с локальной машины:**
```bash
# На локальной машине (Windows: использовать Git Bash или PowerShell)
scp -r C:/Users/sexorcist/Desktop/saes-callout-bot root@IP_СЕРВЕРА:/root/saes-callout-bot
```

Затем на сервере:
```bash
cd /root/saes-callout-bot
```

---

## 3. Настройка .env

```bash
cp .env.example .env
nano .env
```

Заполнить:

```env
DISCORD_TOKEN=MTQ3...
DISCORD_CLIENT_ID=1471924296812073161

VK_TOKEN=vk1.a...
VK_GROUP_ID=235998906

TELEGRAM_BOT_TOKEN=8571082251:AAH...
TELEGRAM_BOT_USERNAME=SAES Callout Bot

DATABASE_PATH=/app/data/database.sqlite
LOG_LEVEL=info
LOG_FILE=/app/logs/bot.log

AUTO_DELETE_CHANNELS=true
CHANNEL_DELETE_DELAY=180000
```

Сохранить: `Ctrl+O` → `Enter` → `Ctrl+X`

Закрыть права на файл:
```bash
chmod 600 .env
```

---

## 4. Запуск

```bash
docker compose build && docker compose up -d
```

Проверить, что бот запустился:
```bash
docker compose logs --tail=50
```

Должно быть что-то вроде:
```
saes-callout-bot  | Discord bot connected as SAES Callout Bot#1234
saes-callout-bot  | VK bot started
saes-callout-bot  | Telegram bot started
```

---

## 5. Перенос базы данных (если есть)

Если на локальной машине уже есть данные:

```bash
# На локальной машине
scp C:/Users/sexorcist/Desktop/saes-callout-bot/data/database.sqlite root@IP_СЕРВЕРА:/root/saes-callout-bot/data/
```

Затем перезапустить:
```bash
docker compose restart
```

---

## Основные команды

```bash
# Логи в реальном времени
docker compose logs -f

# Последние 100 строк
docker compose logs --tail=100

# Остановить
docker compose down

# Запустить
docker compose up -d

# Пересобрать и перезапустить (после обновления кода)
docker compose build && docker compose up -d

# Статус
docker ps
```

---

## Обновление бота

```bash
git pull
docker compose build && docker compose up -d
```

Данные (БД, логи) при пересборке не теряются — они хранятся в `./data/` и `./logs/` на хосте.

---

Подробнее — **DEPLOY.md**
