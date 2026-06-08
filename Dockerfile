FROM node:18-slim

RUN apt-get update && apt-get install -y \
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libasound2 \
    libx11-xcb1 \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

COPY . .

ENV DISPLAY=:99

CMD ["sh", "-c", "Xvfb :99 -screen 0 1024x768x24 & sleep 2 && npm start"]
