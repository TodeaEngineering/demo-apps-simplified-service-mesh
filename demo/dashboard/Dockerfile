# Dashboard — Next.js standalone build.
# Multi-stage: install deps → build → minimal runner.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app

# kubectl, for the in-cluster live controls (sniff + authorization toggle).
ARG TARGETARCH
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -sSLo /usr/local/bin/kubectl "https://dl.k8s.io/release/v1.31.5/bin/linux/${TARGETARCH:-amd64}/kubectl" \
 && chmod +x /usr/local/bin/kubectl \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
# Bind all interfaces. NOTE: orchestrators set HOSTNAME to the container/pod
# name, which Next would try to bind to — compose/k8s override it to 0.0.0.0.
ENV HOSTNAME=0.0.0.0
# gRPC client loads the contract from this path at runtime.
ENV PROTO_PATH=/app/proto/echo.proto

# Next.js standalone server bundle + assets + the proto contract.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/proto ./proto

EXPOSE 3000
CMD ["node", "server.js"]
