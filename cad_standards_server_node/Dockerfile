FROM node:24-bookworm-slim AS server-builder

WORKDIR /workspace/cad_standards_server_node
COPY cad_standards_server_node/package.json cad_standards_server_node/tsconfig.json ./
RUN npm install --no-audit --no-fund
COPY cad_standards_server_node/src ./src
RUN npm run check
RUN ./node_modules/.bin/tsc

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app/server

COPY cad_standards_server_node/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=server-builder /workspace/cad_standards_server_node/dist ./dist
COPY cad_standards_server_node/widget/cad-standards.html /app/assets/cad-standards.html

EXPOSE 8010
CMD ["node", "dist/server.js"]
