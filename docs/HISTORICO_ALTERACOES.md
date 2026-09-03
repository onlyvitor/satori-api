# Histórico Completo de Alterações – RateBooks

> Documentação de **todas** as alterações realizadas, em ordem cronológica, com commits granulares.

## Visão Geral
Projeto inicial: NestJS + TypeORM + PostgreSQL + JWT + Google Books, sem paginação e com apenas 1 teste E2E quebrado (`test/app.e2e-spec.ts:1`).

Ao final: **202 testes unitários + 98 E2E** (antes: ~190 unit + 1 E2E), infraestrutura E2E isolada em `db_test` no mesmo container Docker, bug corrigido em `Rating`, paginação completa com contrato compartilhado.

---

## 1. Infraestrutura E2E – Opção A (mesmo container Docker)

**Problema:** `test/app.e2e-spec.ts` usava `AppModule` mas não replicava `app.setGlobalPrefix('api')` e `ValidationPipe` de `src/main.ts:7`, e `AppModule:16` conectava direto no DB de desenvolvimento (`db_legal`), poluindo dados. `test/jest-e2e.json:1` sem `moduleNameMapper` para `src/*`.

**Solução (commit `fed18ba`):**
- Criado database `db_test` **no mesmo container** `postgres_db_legal`:
  ```bash
  PGPASSWORD=12345678 psql -h localhost -U postgres -c "CREATE DATABASE db_test;"
  # via docker: docker exec postgres_db_legal psql -U postgres -c "CREATE DATABASE db_test;"
  ```
  Verificado via `psql -l` (exibe `db_legal` + `db_test`).
- Criado `.env.test` apontando para `db_test` (mesmo `DB_HOST/USER/PASSWORD`, `DB_NAME=db_test`).
- Atualizado `test/jest-e2e.json` com `moduleNameMapper: {"^src/(.*)$": "<rootDir>/../src/$1"}` e `setupFiles: ["<rootDir>/jest-e2e.setup.ts"]`.
- Criado `test/jest-e2e.setup.ts` para carregar `.env.test` antes de qualquer import de `AppModule`/`jwtConstants`.
- Criados helpers:
  - `test/helpers/fixtures.ts` – `mockBook`, `mockBook2`, `userFixtures`, `ratingFixtures`
  - `test/helpers/db.helper.ts` – `cleanDb(dataSource)` com `TRUNCATE ... RESTART IDENTITY CASCADE`
  - `test/helpers/test-app.helper.ts` – `createTestApp()` que faz `Test.createTestingModule({imports:[AppModule]}).overrideProvider(GoogleBooksService).useValue(mock).compile()`, aplica `setGlobalPrefix('api')` + `ValidationPipe{whitelist, forbidNonWhitelisted, transform}`, retorna `app`, `dataSource`, `mockGoogleBooksService`
  - `test/helpers/auth.helper.ts` – `createUser` (via `POST /api/users` ou repo direto para admin), `login`, `createUserAndLogin`, `authHeader`
- Corrigido `test/app.e2e-spec.ts` para usar `createTestApp`, `cleanDb`, testar `GET /api` com e sem token (global `AuthGuard`).

**Scripts adicionados (`package.json:20`):**
- `test:e2e: "jest --config ./test/jest-e2e.json --runInBand"` (runInBand evita race no `db_test` compartilhado)
- `test:e2e:docker` e `db:create:test` para garantir `db_test` via host ou docker exec.

## 2. Fix – `Rating.status` (commit `a57e3ae`)

**Erro:** `DataTypeNotSupportedError: Data type "Object" in "Rating.status"` ao rodar `npm run test:e2e` (só no Jest, não em `ts-node` direto). Causa: `src/rating/entities/rating.entity.ts:18` `@Column({ enum: Status })` sem `type:'enum'` – TypeORM Postgres exige `type:'enum'` para inferência correta com `ts-jest` (`module: nodenext` + `isolatedModules`).

**Correção:** ` @Column({ type:'enum', enum: Status, default: Status.NOT_READ })`.

## 3. Suites E2E Completas (commits granulares)

### 3.1 Auth – `8a5d775` (19 testes)
`test/auth.e2e-spec.ts:1` cobre `POST /api/auth/login` (sucesso, isAdmin, 401 email/senha, 400 validação), `POST /api/auth/refresh` (válido, access como refresh, malformado), `GET /api/auth/profile` (access válido, sem token, refresh como auth).

### 3.2 Users – `d473d1d` (24 testes)
`test/users.e2e-spec.ts:1` cobre `POST /api/users` (criação, duplicidade email/nome, hash), `GET /api/users` (401, lista), `GET /:id` (404), `PATCH /:id` e `DELETE /:id` com `OwnerOrAdminGuard` (`src/auth/guards/owner-or-admin.guard.ts:22` – owner vs admin vs 403).

### 3.3 Books – `8f83567` (13 testes)
`test/books.e2e-spec.ts:1` com mock `GoogleBooksService`, cobre `GET /api/books/search` (401, lista, vazio, múltiplos, BAD_GATEWAY, query encoding) e `GET /api/books/:googleBookId` (200, 404).

### 3.4 Rating – `71c709a` (34 testes)
`test/rating.e2e-spec.ts:1` cobre `POST /api/rating` (força `userId` do token `src/rating/rating.service.ts:22`, 404 googleBookId, 400 validações), `GET /api/rating` (lista com enrich, filtro `googleBookId`, book null), `GET /:id`, `PATCH /:id` (owner/admin/403, validação googleBookId), `DELETE`.

### 3.5 Correção App + Serialização – `d0508e5`
- `test/app.e2e-spec.ts:24` – `GET /api` exige auth (global guard, não público) → teste 401 sem token + 200 com token.
- `package.json:20` – `--runInBand` obrigatório; adicionados `test:e2e:docker`, `db:create:test`.

**Resultado:** `npm run test:e2e` → 5 suites, 93 testes (antes 1 quebrado).

---

## 4. Paginação – Contrato `common` + Per-Domínio

**Motivação:** `find()` sem limites em `users` e `rating` + `searchBooks` fixo `maxResults:20` causavam carga total + N+1 GoogleBooks.

**Decisão:** contrato em `src/common` (interface única) + implementação per-domínio (cada service define seu `default`/`max`). Alternativas: contrato rígido global (perderia otimização) vs totalmente per-domínio (divergência). Meio-termo escolhido.

### 4.1 Contrato Compartilhado (commit `0ba7bd3`)

- `src/common/interfaces/pagination.interface.ts` – `IPaginationOptions`, `IPaginatedMeta`, `IPaginatedResult`
- `src/common/constants/pagination.constants.ts` – `DEFAULT_PAGE=1, DEFAULT_LIMIT=10, MAX 50`, por domínio `USERS 20, RATING 20, BOOKS 20 (GOOGLE_MAX 40)`
- `src/common/dto/pagination.dto.ts` – `PaginationDto` com `@Type`, `@IsInt`, `@Min/@Max`
- `src/common/dto/paginated-response.dto.ts` – `PaginatedMetaDto`, `PaginatedResponseDto`, `buildPaginatedMeta/Response/Success`
- `src/users/dto/users-pagination.dto.ts` – `page/limit Max20`
- `src/rating/dto/rating-pagination.dto.ts` – `page/limit Max20 + googleBookId?`
- `src/books/dto/books-pagination.dto.ts` – `q? + page/limit Max20 + skip/startIndex/maxResults`
- `src/main.ts:5` – `ValidationPipe` com `whitelist, forbidNonWhitelisted, transform, enableImplicitConversion`

### 4.2 Users (commit `45a3ac5`)

- `src/users/users.service.ts:11` → `findAll(paginationDto?: UsersPaginationDto)` usa `findAndCount({order:{id:'DESC'}, skip, take})` + `buildSuccessPaginatedResponse` → `{success:true, data, meta}`
- `src/users/users.controller.ts:19` → `findAll(@Query() dto: UsersPaginationDto)`
- Tests: `users.service.spec` mock `findAndCount` e valida `meta`, `users.controller.spec` repassa DTO.

### 4.3 Rating (commit `3b021f4`)

- `src/rating/rating.service.ts:17` → `findAll(dto?: RatingPaginationDto | string)` (compatível com legado string), `findAndCount` + enrich só na página → `buildPaginatedResponse`
- `src/rating/rating.controller.ts:15` → `findAll(@Query() dto: RatingPaginationDto)`
- Tests: `rating.service.spec` e `rating.controller.spec` atualizados para `findAndCount` e `data/meta`.

### 4.4 Books (commit `94901c4`)

- `src/books/google-books.service.ts:12` → `searchBooks(query, paginationDto?)` calcula `startIndex=(page-1)*limit`, `maxResults=min(limit,40)`, envia `{q, startIndex, maxResults}`
- `src/books/books.controller.ts:9` → `search(@Query() dto: BooksPaginationDto)` com `dto.q`
- Tests: `google-books.service.spec` espera `startIndex:0, maxResults:10`, `books.controller.spec` nova assinatura `search({q})`.

### 4.5 E2E Adaptação (commit `abf5970`)

- `test/rating.e2e-spec.ts:196` → espera `{data,meta}`, adiciona `page&limit`, `400 limit>max`, `400 page inválido`.
- `test/books.e2e-spec.ts:50` → espera `searchBooks` com DTO, adiciona `page/limit` e `400`.
- `test/users.e2e-spec.ts` mantém compatível (meta adicionada não quebra; testes ainda validam `data`).

**Resultado:** `npm run test` 202 (era 196) + `npm run test:e2e` 98 (era 93).

---

## 5. Documentação (commit atual)

- `docs/PAGINACAO.md` – documentação técnica completa (contrato, per-domínio, exemplos, validação, estrutura, decisões, commits).
- `docs/HISTORICO_ALTERACOES.md` (este arquivo) – histórico total.
- `README.md` – atualizados tabelas de endpoints (`?page&limit`), seção `Pagination` com exemplo `meta`, estrutura `src/common`, e seção `Tests` com comandos `db:create:test` e contagem 202/98.

---

## 6. Estado Final Validado

```bash
npm run test         # 11 suites, 202 testes
npm run test:e2e     # 5 suites, 98 testes (--runInBand, db_test isolado)
```

- E2E `db_test` no mesmo container `postgres_db_legal` (Opção A), criado via `docker exec` ou `psql`.
- Nenhum teste quebrado; todos os fixos granulares com `git log --oneline` documentado.

---

## 7. Comandos Úteis

```bash
# Infra E2E
PGPASSWORD=12345678 psql -h localhost -U postgres -l | grep db_test
npm run db:create:test
npm run test:e2e:docker  # cria via docker exec + roda

# Paginação exemplos
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/users?page=2&limit=5"
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/rating?googleBookId=zyTCAlFPjgYC&page=1&limit=1"
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/books/search?q=Harry&page=2&limit=5"
```

---

## 8. Próximos Passos Sugeridos

- Adicionar `createdAt/updatedAt` + índices (`rating.googleBookId`, `user.email`).
- Cache `getBookById` por página.
- Cursor-based se volume >10k.
- OpenAPI/Swagger para paginação.
