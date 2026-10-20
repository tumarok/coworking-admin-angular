# The mock API for demos and compose. The server is TypeScript with no build output, so it is
# bundled into one file (the contract, zod and faker included) and the final image holds nothing else.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.server.json ./
COPY server ./server
COPY src/app/shared/api/contract ./src/app/shared/api/contract
RUN npm run build:mock

FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/dist/mock/mock.mjs ./
ENV PORT=4010 \
    MOCK_LATENCY_MS=150
USER node
EXPOSE 4010
CMD ["node", "mock.mjs"]
