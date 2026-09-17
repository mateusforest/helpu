FROM node:22-bookworm-slim
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && install -d -m 0700 -o node -g node /data
WORKDIR /app
COPY --chown=node:node services/runtime/server.mjs services/runtime/video.mjs ./services/runtime/
COPY --chown=node:node deploy/video/start.mjs ./deploy/video/
ENV NODE_ENV=production PORT=8080 HELPU_RUNTIME_DATA=/data HELPU_RUNTIME_MODE=video
USER node
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/bin/tini", "--", "node", "/app/deploy/video/start.mjs"]
