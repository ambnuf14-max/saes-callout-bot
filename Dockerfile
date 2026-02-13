# Multi-stage build для оптимизации размера образа

# Этап 1: Сборка
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости (включая dev для сборки)
RUN npm ci

# Копируем исходный код
COPY . .

# Собираем TypeScript
RUN npm run build

# Этап 2: Production образ
FROM node:20-alpine

WORKDIR /app

# Устанавливаем только production зависимости
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Копируем собранные файлы из builder
COPY --from=builder /app/dist ./dist

# Создаём директории для данных и логов
RUN mkdir -p /app/data /app/logs

# Запускаем от непривилегированного пользователя
USER node

# Expose не обязателен для ботов, но оставим на случай будущих изменений
# EXPOSE 3000

CMD ["node", "dist/index.js"]
