ARG NODE_IMAGE=node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /dependencies
COPY runtime/package.json runtime/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3181 \
    AGENT_DATA_DIR=/data \
    AGENT_STATIC_DIR=/app/public
WORKDIR /app
COPY --from=dependencies /dependencies/node_modules ./node_modules
COPY runtime/package.json ./package.json
COPY runtime/server.mjs runtime/bundle-manifest.json ./
COPY public ./public
USER 1000:1000
EXPOSE 3181
CMD ["node", "/app/server.mjs"]
