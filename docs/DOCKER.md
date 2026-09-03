# Docker – RateBooks

## Resumo
Containerização **multi-stage** com `node:22-slim` (escolha do usuário), usuário **não-root** (`appuser`), **`HEALTHCHECK`** público via `GET /api/health` e exigência explícita de `--env-file` (nenhum `.env` copiado para a imagem). `docker-compose.yml` orquestra `api` + `postgres:16`.

## Por que cada escolha?

### 1. `node:22-slim` ao invés de `node:22-alpine`
- **Alpine** é menor (~50MB vs ~170MB), mas `bcrypt 6.0.0` (`package.json:33`) é nativo (`node-gyp`) e exige `python3`/`make`/`g++`. Em Alpine isso obriga `apk add` e ainda há incompatibilidades de `musl` vs `glibc`.
- **Slim (Debian)** é `glibc` nativo, compatível com `bcrypt` sem hacks, mantém `apt-get` simples e foi explicitamente preferido pelo usuário. Tamanho extra (~120MB) é compensado por build estável e `curl` já via `apt`.
- **Alternativa descartada:** `bcryptjs` (JS puro) eliminaria toolchain, mas perde ~30% performance em hash (relevante em `POST /api/users` com `bcrypt.hash 10` `src/users/users.service.ts:22`).

### 2. Multi-stage (3 estágios)
`Dockerfile:1`
```dockerfile
deps    → npm ci (com toolchain python3/make/g++)
builder → copy node_modules + source + npm run build (nest build) + npm prune --production
runner  → node:22-slim + curl, groupadd/useradd appuser, COPY dist/node_modules, USER appuser
```
- **Por quê?** `builder` mantém `devDependencies` (@nestjs/cli, jest, typescript) para compilar; `runner` leva apenas `dist` + `node_modules` de produção (~150MB vs ~600MB se fosse single-stage). `npm prune` remove dev deps após build.
- **Sem `.env` na imagem:** `COPY` não inclui `.env` (`.dockerignore:6` bloqueia). Isso força `--env-file` em `docker run` e `env_file` em compose – evita vazar `JWT_SECRET`/`DB_PASSWORD` na imagem (princípio 12-factor).
- **`.dockerignore` `/.dockerignore:1`** – `node_modules`, `dist`, `.git`, `test`, `coverage`, `*.log` – contexto de 597kB vs dezenas de MB sem ele.

### 3. Usuário não-root (obrigatório)
`Dockerfile:20`
```dockerfile
groupadd -r appgroup && useradd -r -g appgroup appuser
chown -R appuser:appgroup /app
USER appuser
```
- **Por quê?** Rodar como `root` no container permite escape para host via volume montado e viola CIS Docker Benchmark. `EXPOSE 3000` >1024 não precisa root. Verificado via `docker inspect --format '{{.Config.User}}'` → `appuser`.

### 4. HEALTHCHECK público
**Problema:** `GET /api` é protegido por `AuthGuard` global (`src/auth/auth.module.ts:17` `APP_GUARD`) – exige `Bearer` validado em `src/auth/auth.guard.ts:14`, retornaria `401` para o healthcheck interno do Docker.

**Solução:**
- Criado `GET /api/health` **público** `src/app.controller.ts:13` com `@Public()` (`src/auth/decorators/public.decorator.ts:4` → `SetMetadata('isPublic',true)`). O `AuthGuard` verifica `reflector.getAllAndOverride(IS_PUBLIC_KEY)` e retorna `true` sem verificar token.
- `src/app.service.ts:8` `getHealth()` retorna `{status:'ok', timestamp, uptime}` – sem acesso a DB (não falha se DB cair momentaneamente, mas poderia checar DB se desejado).
- `Dockerfile:25` `HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD curl -f http://localhost:3000/api/health || exit 1`
- `docker-compose.yml:32` replica healthcheck para `api` + `healthcheck: pg_isready` para `db`.

**Alternativa descartada:** `GET /api` com token fake ou `wget` sem `curl` (Alpine usa `wget`, mas `slim` já tem `curl` via `apt`).

**Por que `curl -f`?** `-f` faz `curl` retornar código ≠0 em 4xx/5xx, essencial para `HEALTHCHECK` falhar corretamente.

### 5. `--env-file` sempre obrigatório
- **Dockerfile** nunca `COPY .env` – `.dockerignore` bloqueia `.env` e `.env.test`.
- **docker run** exige `docker run --env-file .env ...` (`README.md:71` documenta). Sem ele, `TypeOrmModule.forRoot` `src/app.module.ts:16` tenta `DB_HOST undefined` → `Unable to connect`.
- **docker-compose.yml:21** `env_file: - .env` + `environment: DB_HOST: db` (sobrescreve `DB_HOST=localhost` do `.env` para nome do serviço `db` dentro da rede compose). `PORT` também via `environment`.

### 6. `docker-compose.yml` – Opção A + paginação
`docker-compose.yml:1`
```yaml
services:
  db: postgres:16, env POSTGRES_*, ports 5432:5432, volumes pgdata, healthcheck pg_isready
  api: build ., env_file .env, DB_HOST=db, ports 3000:3000, depends_on db healthy, healthcheck curl /api/health
```
- **Por quê compose?** Usuário pediu `docker compose tbm`. Antes E2E usava `postgres_db_legal` manual (`docker run -d --name postgres_db_legal`). Compose cria mesma rede e garante `db_test` isolado (criado via `npm run db:create:test` dentro da rede – `DB_HOST=db`).
- **Health dependency:** `depends_on: db: condition: service_healthy` garante que `api` só sobe após `pg_isready`, evitando `Unable to connect` na largada.

---

## Arquivos Criados/Alterados

- `Dockerfile:1` – multi-stage `node:22-slim`, 3 stages, `HEALTHCHECK`, `USER appuser`, `EXPOSE 3000`
- `.dockerignore:1` – 15 linhas, bloqueia `node_modules`, `dist`, `.env*`, `test`, `coverage`
- `docker-compose.yml:1` – 47 linhas, `db` + `api` + `pgdata`
- `src/app.controller.ts:3` – `import {Public}` + `@Public() @Get('health')`
- `src/app.service.ts:8` – `getHealth()`
- `test/health.e2e-spec.ts:1` – 2 testes E2E (saúde pública vs `/api` protegido)
- `README.md:60` – seção `Docker` com build/run/compose
- `src/books/google-books.service.ts:16` e `src/rating/rating.service.ts:38` – fix tipagem para `nest build` (necessário para build da imagem)

---

## Como Usar

```bash
# Build (sempre com .env existente, mas não copiado)
docker build -t ratebooks:local .

# Run isolado (exige --env-file, network host para postgres local)
docker run -d --name ratebooks_api --env-file .env --network host ratebooks:local
curl http://localhost:3000/api/health  # {"status":"ok","timestamp":"...","uptime":5}
docker inspect --format '{{.State.Health.Status}}' ratebooks_api  # healthy
docker logs -f ratebooks_api
docker stop ratebooks_api && docker rm ratebooks_api

# Compose (recomendado, cria db + api)
docker compose up --build -d
docker compose logs -f
curl http://localhost:3000/api/health
docker compose down  # remove api + db (mantém pgdata, use -v para apagar)
```

**Variáveis obrigatórias em `.env` (`.env.example:1`):** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, opcional `PORT` e `GOOGLE_BOOKS_API_KEY`. Em compose, `DB_HOST` é sobrescrito para `db` automaticamente.

---

## Validação

```bash
npm run build              # nest build sem TS2322
docker build -t ratebooks:local .  # 23 steps, Successfully built (testado: 51s npm ci)
docker run --env-file .env --network host ratebooks:local
# Logs: Nest application successfully started, Mapped {/api/health, GET}
curl /api/health → 200, /api → 401
docker inspect → User:appuser, Healthcheck:curl
npm run test          # 202 unit
npm run test:e2e      # 100 E2E (inclui 2 health)
```

---

## Trade-offs e Próximos Passos

- **Tamanho vs compatibilidade:** `slim` + `bcrypt` é maior que `alpine` + `bcryptjs`, mas evita segfaults `musl`.
- **Health sem DB check:** atual não verifica `pg_isready`; poderia estender `getHealth()` para `dataSource.query('SELECT 1')` e retornar `503` se DB down (útil para orquestradores).
- **Compose sem `docker-compose` binário:** ambiente atual só tem `docker` 29.1.3 sem plugin `compose`; em CI instalar `docker-compose-plugin` ou usar `docker run` manual para db como antes.
- **Prod hardening:** adicionar `read_only: true`, `tmpfs`, `security_opt`, e multi-arch build (`buildx`) se necessário.
