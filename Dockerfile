FROM node:20-alpine

WORKDIR /app

# Устанавливаем зависимости для сборки нативных модулей (sqlite3)
RUN apk add --no-cache python3 py3-setuptools make g++

# Копируем package.json
COPY package.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY . .

# Собираем TypeScript (incremental — кэш сохраняется между сборками)
RUN --mount=type=cache,target=/tmp/ts-build-cache \
    npm run build

# Создаём директории для данных и логов с правильными правами
RUN mkdir -p /app/data /app/logs && \
    chmod -R 777 /app/data /app/logs

CMD ["node", "dist/index.js"]
