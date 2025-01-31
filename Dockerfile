# Build stage
FROM node:22-bullseye-slim AS builder
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY prisma ./prisma/
COPY src ./src/

RUN yarn prisma generate

# Production stage
FROM node:22-bullseye-slim AS runner
WORKDIR /app

# Install production dependencies only
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production \
    && yarn cache clean

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma/
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma/
COPY --from=builder /app/src ./src/

USER node
ENV NODE_ENV=production

# Expose the port the app runs on
EXPOSE 3000

CMD ["yarn", "start"]