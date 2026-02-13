# 🚀 Инструкция по деплою на Ubuntu через Docker

## Предварительные требования

На вашем Ubuntu сервере должны быть установлены:
- Docker
- Docker Compose

### Установка Docker на Ubuntu

```bash
# Обновляем систему
sudo apt update && sudo apt upgrade -y

# Устанавливаем Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Добавляем пользователя в группу docker (чтобы не использовать sudo)
sudo usermod -aG docker $USER

# Перелогиньтесь после этого!
# Проверка установки
docker --version
docker-compose --version
```

---

## Деплой бота

### 1. Загрузите проект на сервер

Вариант A - через Git:
```bash
git clone <ваш-репозиторий>
cd saes-callout-bot
```

Вариант B - через SCP/SFTP:
```bash
# На вашем локальном компьютере
scp -r /путь/к/проекту user@ваш-сервер:/home/user/saes-callout-bot
```

### 2. Настройте переменные окружения

```bash
# Скопируйте пример конфига
cp .env.example .env

# Отредактируйте .env файл
nano .env
```

Заполните все необходимые токены:
- `DISCORD_TOKEN` - токен Discord бота
- `DISCORD_CLIENT_ID` - ID приложения Discord
- `VK_TOKEN` - токен группы VK
- `VK_GROUP_ID` - ID группы VK

### 3. Запустите бота

**Вариант A - Быстрый запуск (используя скрипт):**
```bash
chmod +x deploy.sh
./deploy.sh
```

**Вариант B - Ручной запуск:**
```bash
# Сборка образа
docker-compose build

# Запуск в фоновом режиме
docker-compose up -d

# Просмотр логов
docker-compose logs -f
```

---

## Управление ботом

### Просмотр логов
```bash
# Все логи
docker-compose logs

# Последние 100 строк
docker-compose logs --tail=100

# Следить за логами в реальном времени
docker-compose logs -f
```

### Перезапуск бота
```bash
docker-compose restart
```

### Остановка бота
```bash
docker-compose down
```

### Обновление бота
```bash
# Загрузите новую версию кода
git pull

# Пересоберите и перезапустите
docker-compose down
docker-compose build
docker-compose up -d
```

### Полная переустановка (с очисткой)
```bash
# ВНИМАНИЕ: Удалит все данные!
docker-compose down -v
rm -rf data logs
docker-compose up -d
```

---

## Автозапуск при старте сервера

Docker с флагом `restart: unless-stopped` уже настроен на автозапуск.

Убедитесь, что Docker запускается при старте системы:
```bash
sudo systemctl enable docker
```

---

## Мониторинг

### Проверка статуса контейнера
```bash
docker ps
```

### Использование ресурсов
```bash
docker stats saes-callout-bot
```

### Вход в контейнер (для отладки)
```bash
docker-compose exec saes-callout-bot sh
```

---

## Решение проблем

### Бот не запускается
```bash
# Проверьте логи
docker-compose logs

# Проверьте .env файл
cat .env
```

### База данных повреждена
```bash
# Создайте бэкап
cp data/database.sqlite data/database.sqlite.backup

# Пересоздайте БД
docker-compose down
rm data/database.sqlite
docker-compose up -d
```

### Нет места на диске
```bash
# Очистка неиспользуемых Docker образов
docker system prune -a

# Проверка места
df -h
```

---

## Структура файлов на сервере

```
saes-callout-bot/
├── data/              # База данных SQLite (персистентные данные)
├── logs/              # Логи бота (персистентные данные)
├── src/               # Исходный код
├── .env               # Переменные окружения (НЕ коммитить!)
├── Dockerfile         # Инструкции для сборки образа
├── docker-compose.yml # Конфигурация Docker Compose
└── deploy.sh          # Скрипт деплоя
```

---

## Безопасность

1. **Никогда не коммитьте .env файл!** (уже в .gitignore)
2. Используйте файрвол на сервере
3. Регулярно обновляйте систему: `sudo apt update && sudo apt upgrade`
4. Ограничьте доступ по SSH (используйте ключи вместо паролей)

---

## Полезные команды

```bash
# Посмотреть все запущенные контейнеры
docker ps

# Посмотреть все образы
docker images

# Войти в контейнер
docker exec -it saes-callout-bot sh

# Скопировать файл из контейнера
docker cp saes-callout-bot:/app/logs/bot.log ./bot.log

# Просмотр использования диска Docker
docker system df
```
