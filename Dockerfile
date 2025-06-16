# Используем Node.js 20
FROM node:20-slim


# Установка LibreOffice
# RUN apt update && \
#     apt install -y libreoffice libreoffice-writer && \
#     apt clean && rm -rf /var/lib/apt/lists/*

RUN apt-get update && \
    apt-get install -y openssl libssl-dev ca-certificates && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Рабочая директория
WORKDIR /app

# Копируем зависимости
COPY package*.json ./
RUN npm install

# Копируем исходный код
COPY . .


RUN npx prisma generate

# Собираем
RUN npm run build

# Открываем порт
EXPOSE 3000

# Запуск приложения
CMD ["node", "dist/main"]
