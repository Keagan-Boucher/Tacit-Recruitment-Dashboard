# Dev environment: Node + every npm dependency. Source code and secrets are mounted at runtime (compose.yaml),
# so edits on the laptop hot-reload and no secret is ever baked into the image.
FROM node:22-bookworm-slim

WORKDIR /app

# Only the manifests, so the install layer is cached until a dependency changes.
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci

EXPOSE 5173 8787

# Same as `npm run dev`, but Vite listens on 0.0.0.0 so the laptop's browser can reach it.
CMD ["npx", "concurrently", "-k", "-n", "web,server", "-c", "green,blue", "npm run dev -w web -- --host 0.0.0.0", "npm run dev -w server"]
