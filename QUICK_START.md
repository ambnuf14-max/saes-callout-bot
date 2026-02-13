# ⚡ Быстрый старт (для root)

## 1️⃣ Установка Docker (если не установлен)

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
rm get-docker.sh
```

## 2️⃣ Загрузка проекта на сервер

**Вариант A - Git:**
```bash
cd /root
git clone <ваш-репозиторий> saes-callout-bot
cd saes-callout-bot
```

**Вариант B - Загрузка архива:**
```bash
# На локальной машине
scp -r ./saes-callout-bot root@ваш-сервер:/root/

# На сервере
cd /root/saes-callout-bot
```

## 3️⃣ Настройка переменных окружения

```bash
# Копируем шаблон
cp .env.example .env

# Редактируем
nano .env
```

**Заполните обязательные поля:**
- `DISCORD_TOKEN` - токен вашего Discord бота
- `DISCORD_CLIENT_ID` - ID приложения Discord
- `VK_TOKEN` - токен группы VK
- `VK_GROUP_ID` - ID группы VK

Сохраните: `Ctrl+O`, затем `Enter`, выйти: `Ctrl+X`

## 4️⃣ Запуск бота

```bash
chmod +x deploy.sh
./deploy.sh
```

**Готово!** Бот запущен и работает в фоне.

---

## 📋 Основные команды

```bash
# Просмотр логов
docker-compose logs -f

# Остановить бота
docker-compose down

# Запустить бота
docker-compose up -d

# Перезапустить бота
docker-compose restart

# Статус контейнера
docker ps
```

## 🔄 Обновление бота

```bash
# Если используете Git
git pull
docker-compose down
docker-compose build
docker-compose up -d

# Если загружаете файлы вручную
# Загрузите новые файлы, затем:
docker-compose down
docker-compose build
docker-compose up -d
```

## ⚠️ Важно

- Файлы `data/` и `logs/` НЕ удаляются при перезапуске
- Бот автоматически запустится после перезагрузки сервера
- `.env` файл не должен попадать в Git (уже в .gitignore)

---

Подробная инструкция: см. **DEPLOY.md**
