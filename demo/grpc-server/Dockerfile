# Tiny gRPC echo server — run TypeScript directly with tsx (no build step).
FROM node:22-slim

WORKDIR /app

# Install deps first for layer caching.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# App code + proto contract.
COPY proto ./proto
COPY src ./src

ENV NODE_ENV=production
ENV PORT=50051
EXPOSE 50051

CMD ["npm", "start"]
