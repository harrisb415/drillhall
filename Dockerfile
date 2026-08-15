# Optional container path — see DEPLOY.md (pm2/systemd is the verified path).
FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
COPY packages/content/package.json packages/content/
COPY packages/shared-types/package.json packages/shared-types/
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3001
CMD ["sh", "-c", "npm run db:migrate && npm start"]
