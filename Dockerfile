FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN apk add --no-cache libxml2-utils && npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 8787
CMD ["npx", "tsx", "server/index.ts"]
