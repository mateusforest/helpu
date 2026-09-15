FROM node:22-bookworm-slim AS node22
FROM mcr.microsoft.com/playwright:v1.63.0-noble

USER root
COPY --from=node22 /usr/local/bin/node /usr/local/bin/node
COPY --from=node22 /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -sf ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -sf ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && install -d -m 0700 -o pwuser -g pwuser /data \
 && node -e "if(process.versions.node.split('.')[0]!=='22')process.exit(1)"

WORKDIR /app
COPY deploy/runtime/package.json deploy/runtime/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force
COPY services/runtime/ ./services/runtime/
COPY deploy/runtime/entrypoint.mjs deploy/runtime/healthcheck.mjs ./deploy/runtime/

ENV NODE_ENV=production \
    PORT=8080 \
    HELPU_RUNTIME_DATA=/data \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    HOME=/tmp/pwuser \
    XDG_CACHE_HOME=/tmp/pwuser/.cache \
    XDG_CONFIG_HOME=/tmp/pwuser/.config
USER pwuser
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["node", "/app/deploy/runtime/entrypoint.mjs"]
