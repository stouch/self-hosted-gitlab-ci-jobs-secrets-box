FROM node:20.11.0
WORKDIR /app

COPY ./src ./src
COPY ./package* .
COPY ./tsconfig.json .

# Secrets will be mounted in /app/secrets later

RUN npm ci
RUN npm run build

CMD ["node", "dist/index.js"]