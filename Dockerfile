# Build stage
FROM node:22-bullseye-slim AS builder

WORKDIR /app

# Copy only package files first to leverage Docker layer caching for dependencies
COPY package.json yarn.lock ./

# Install dependencies with specific flags for build time
RUN yarn install --frozen-lockfile

# Copy only necessary source files
COPY prisma ./prisma/
COPY src ./src/

# Generate Prisma client
RUN yarn workspace backend prisma generate

# Production stage
FROM node:22-bullseye-slim AS runner

WORKDIR /app

# Install production dependencies only
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production \
    && yarn cache clean

# Copy only the necessary files from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma/
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma/
COPY --from=builder /app/src ./src/

# Set user to non-root
USER node

# Set environment variables
ENV NODE_ENV=production

# Start the server
CMD ["yarn", "start"]