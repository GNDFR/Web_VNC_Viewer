# 1단계: 빌드
FROM node:18 AS builder
WORKDIR /app

# 의존성 정의 파일 복사 및 설치
COPY package.json package-lock.json* tsconfig.json ./
RUN npm install

# 소스 복사 & 빌드
COPY src ./src
COPY public ./public
RUN npm run build:ts

# 2단계: 실행 환경
FROM node:18-slim AS runner
WORKDIR /app

# 빌드 산출물 복사
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
# 런타임에 Express만 있으면 되므로 설치
COPY --from=builder /app/node_modules/express ./node_modules/express

EXPOSE 8080
CMD ["node", "dist/server.js"]
