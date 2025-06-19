# ----------------------------------------
# 1) Build Stage
# ----------------------------------------
FROM node:18 AS builder
WORKDIR /app

# 1.1 의존성 정의 파일 복사 & 설치
COPY package.json package-lock.json* tsconfig.json webpack.config.js ./
RUN npm ci

# 1.2 소스 및 정적 자산 복사
COPY src ./src
COPY public ./public

# 1.3 클라이언트 번들 + TypeScript 컴파일
#    - "build:client" 와 "build:ts" 스크립트는 package.json에 정의되어 있어야 합니다.
RUN npm run build:client
RUN npm run build:ts

# ----------------------------------------
# 2) Runtime Stage
# ----------------------------------------
FROM node:18-slim AS runner
WORKDIR /app

# 2.1 빌드산출물 복사
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# 2.2 프로덕션 의존성만 설치
COPY package.json package-lock.json* ./
RUN npm ci --production

# 2.3 컨테이너 포트 노출 및 실행 커맨드
EXPOSE 8080
CMD ["node", "dist/server.js"]
