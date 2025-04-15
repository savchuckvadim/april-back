# Используем Node.js 20
FROM node:20-slim

# Рабочая директория
WORKDIR /app

# Копируем зависимости
COPY package*.json ./
RUN npm install

# Копируем исходный код
COPY . .

# Собираем
RUN npm run build

# Открываем порт
EXPOSE 3000

# Запуск приложения
CMD ["node", "dist/main"]
