# Деплой на Ubuntu VDS через Docker

## Требования

- Ubuntu 20.04 / 22.04
- Минимум 512 MB RAM (рекомендуется 1 GB)
- Docker 24+

---

## Установка Docker

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
systemctl enable docker
docker --version
```

---

## Загрузка проекта

### Git

```bash
cd /root
git clone <репозиторий> saes-callout-bot
cd saes-callout-bot
```

### SCP (если нет репозитория)

Собрать архив на Windows и загрузить на сервер. Исключить `node_modules/`:

```bash
# На локальной машине (Git Bash)
cd /c/Users/sexorcist/Desktop
tar --exclude=saes-callout-bot/node_modules \
    --exclude=saes-callout-bot/data \
    --exclude=saes-callout-bot/logs \
    -czf saes-callout-bot.tar.gz saes-callout-bot

scp saes-callout-bot.tar.gz root@IP_СЕРВЕРА:/root/
```

```bash
# На сервере
cd /root
tar -xzf saes-callout-bot.tar.gz
cd saes-callout-bot
```

---

## Настройка .env

```bash
cp .env.example .env
nano .env
chmod 600 .env
```

Обязательные поля:

```env
DISCORD_TOKEN=<токен бота>
DISCORD_CLIENT_ID=<ID приложения>

VK_TOKEN=<токен группы VK>
VK_GROUP_ID=<ID группы VK>

TELEGRAM_BOT_TOKEN=<токен от @BotFather>
TELEGRAM_BOT_USERNAME=<username бота без @>

DATABASE_PATH=/app/data/database.sqlite
LOG_LEVEL=info
LOG_FILE=/app/logs/bot.log

AUTO_DELETE_CHANNELS=true
CHANNEL_DELETE_DELAY=180000
```

---

## Запуск

```bash
docker compose build
docker compose up -d
```

Проверить логи:
```bash
docker compose logs -f
```

---

## Перенос базы данных

Если переносите с другого сервера или с локальной машины:

```bash
# С Windows (Git Bash) на VDS
scp C:/Users/sexorcist/Desktop/saes-callout-bot/data/database.sqlite root@IP:/root/saes-callout-bot/data/

# Перезапустить контейнер
docker compose restart
```

---

## Управление

```bash
# Запустить
docker compose up -d

# Остановить (данные сохраняются)
docker compose down

# Перезапустить
docker compose restart

# Пересобрать и перезапустить (после git pull)
docker compose build && docker compose up -d

# Логи в реальном времени
docker compose logs -f

# Последние N строк
docker compose logs --tail=200

# Статус контейнера
docker ps

# Использование ресурсов
docker stats saes-callout-bot

# Вход в контейнер (отладка)
docker exec -it saes-callout-bot sh
```

---

## Обновление бота

```bash
git pull
docker compose build && docker compose up -d
```

БД и логи не затрагиваются — они в `./data/` и `./logs/` на хосте.

---

## Резервная копия

```bash
# Создать бэкап БД
cp data/database.sqlite data/database.sqlite.$(date +%Y%m%d)

# Восстановить из бэкапа
docker compose down
cp data/database.sqlite.20250220 data/database.sqlite
docker compose up -d
```

---

## Безопасность

```bash
# Закрыть права на .env
chmod 600 .env

# Файрвол — открыть только SSH
ufw allow 22
ufw enable

# SSH — только по ключу (в /etc/ssh/sshd_config):
# PasswordAuthentication no

# Обновление системы
apt update && apt upgrade -y
```

---

## Решение проблем

### Бот не запускается
```bash
docker compose logs
# Смотреть на строки с ERROR
```

### Бот запустился, но не отвечает в Discord
- Проверить `DISCORD_TOKEN` в `.env`
- Убедиться, что в Discord Developer Portal включены Privileged Intents:
  - Presence Intent
  - Server Members Intent
  - Message Content Intent

### VK не отвечает
- Проверить `VK_TOKEN` и `VK_GROUP_ID`
- Убедиться, что в настройках группы VK включён Long Poll

### Нет места на диске
```bash
df -h
docker system prune -a   # Удалить неиспользуемые образы/контейнеры
```

### Полный сброс (УДАЛИТ ВСЕ ДАННЫЕ)
```bash
docker compose down
rm -rf data/database.sqlite logs/
docker compose up -d
```

---

## Структура файлов на сервере

```
/root/saes-callout-bot/
├── data/
│   └── database.sqlite     ← БД (монтируется в контейнер)
├── logs/
│   └── bot.log             ← Логи (монтируются в контейнер)
├── src/                    ← Исходный код
├── .env                    ← Переменные окружения (chmod 600)
├── docker-compose.yml
└── Dockerfile
```
