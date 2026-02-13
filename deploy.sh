#!/bin/bash

# Скрипт для деплоя бота на Ubuntu сервере

set -e

echo "🚀 Deploying SAES Callout Bot..."

# Проверка наличия .env файла
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "📝 Please create .env file from .env.example"
    exit 1
fi

# Останавливаем старый контейнер если он запущен
echo "🛑 Stopping old container..."
docker-compose down || true

# Собираем новый образ
echo "🔨 Building Docker image..."
docker-compose build

# Запускаем контейнер
echo "▶️  Starting container..."
docker-compose up -d

# Показываем логи
echo "📋 Showing logs (Ctrl+C to exit)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker-compose logs -f
