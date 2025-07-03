FROM node:18-alpine

WORKDIR /usr/src/app

# Copia package.json + lock e instala deps
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copia todo o código
COPY . .

# Cria pastas para mídia e sessões
RUN mkdir -p media sessions

EXPOSE 3001

CMD ["node", "server.js"]
