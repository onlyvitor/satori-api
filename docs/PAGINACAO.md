# Paginação – RateBooks

## Resumo
Implementada paginação **offset-based** (`page` + `limit`) com **contrato compartilhado em `src/common`** e **implementação per-domínio** (cada service define seus defaults e limites). A API permanece compatível onde possível e retorna envelope paginado com `meta`.

## Por que `common` + per-domínio?
- **Contrato único** evita divergência (`page` vs `offset`, `limit` vs `take`, resposta `{data,meta}` vs `[]`).
- **Defaults per-domínio** permitem otimizar custo:
  - `users` lista leve → `limit` default 10, max 20
  - `rating` custa N chamadas ao Google Books (enriquecimento) → limit 10, max 20
  - `books` proxy Google (custo de rede) → limit 10, max 20 (Google suporta até 40, limitado a 20 para consistência)

Alternativa de contrato rígido global perderia otimização; alternativa totalmente per-domínio perderia consistência.

---

## Contrato Compartilhado (`src/common`)

### Interfaces
`src/common/interfaces/pagination.interface.ts:1`
```ts
IPaginationOptions { page, limit, skip, take }
IPaginatedMeta { total, page, limit, totalPages, hasNextPage, hasPrevPage }
IPaginatedResult<T> { data: T[], meta: IPaginatedMeta }
ISuccessPaginatedResult<T> // para compatibilidade com wrapper {success:true}
```

### DTO Base
`src/common/dto/pagination.dto.ts:1`
```ts
export class PaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 10
  get skip() { return (page-1)*limit }
  get take() { return limit }
}
```
Validação via `class-validator` + `class-transformer`. Requer `ValidationPipe` com `transform:true`.

### Resposta Paginada
`src/common/dto/paginated-response.dto.ts:1`
```ts
buildPaginatedResponse(data, total, page, limit) => { data, meta }
buildPaginatedMeta(total,page,limit) => { total, page, limit, totalPages: ceil(total/limit), hasNextPage: page < totalPages, hasPrevPage: page>1 }
buildSuccessPaginatedResponse(...) => { success:true, data, meta }
```

### Constantes por Domínio
`src/common/constants/pagination.constants.ts:1`
```ts
PAGINATION_CONSTANTS = {
  DEFAULT_PAGE: 1, DEFAULT_LIMIT: 10, MAX_LIMIT: 50,
  USERS: { DEFAULT_LIMIT:10, MAX_LIMIT:20 },
  RATING: { DEFAULT_LIMIT:10, MAX_LIMIT:20 },
  BOOKS: { DEFAULT_LIMIT:10, MAX_LIMIT:20, GOOGLE_MAX:40 }
}
```

### DTOs Per-Domínio (herdam contrato, sobrescrevem limites)
- `src/users/dto/users-pagination.dto.ts:1` → `page` + `limit @Max(20)`, getters `skip/take`
- `src/rating/dto/rating-pagination.dto.ts:1` → `page` + `limit @Max(20)` + `googleBookId?`
- `src/books/dto/books-pagination.dto.ts:1` → `q?` + `page` + `limit @Max(20)` + `skip/startIndex/maxResults`

Cada DTO é usado no `@Query()` do controller; o `ValidationPipe` transforma `?page=2&limit=5` (string) em números.

---

## Alterações por Domínio

### 1. Infra Global
- `src/main.ts:5` – `ValidationPipe` agora `whitelist:true, forbidNonWhitelisted:true, transform:true, enableImplicitConversion:true`. Necessário para converter query strings.
- `test/helpers/test-app.helper.ts:40` já tinha `whitelist/transform`; mantido sincronizado.
- Criados diretórios `src/common/{dto,interfaces,constants}`.

### 2. Users – `GET /api/users`
**Antes:** `src/users/users.service.ts:31` `find()` sem paginação, retorno `{success:true, data: User[]}`.

**Depois:** `src/users/users.service.ts:11` + `UsersPaginationDto`
```ts
async findAll(paginationDto?: UsersPaginationDto) {
  const page = dto.page ?? 1, limit = dto.limit ?? 10;
  const [data, total] = await repo.findAndCount({ order:{id:'DESC'}, skip:(page-1)*limit, take:limit });
  return buildSuccessPaginatedResponse(data, total, page, limit); // {success:true, data, meta}
}
```
`src/users/users.controller.ts:19` → `findAll(@Query() dto: UsersPaginationDto)`.

**Exemplo:**
```
GET /api/users?page=2&limit=5 → { success:true, data:[...5], meta:{total:25, page:2, limit:5, totalPages:5, hasNextPage:true, hasPrevPage:true} }
GET /api/users → defaults page1 limit10
```

### 3. Rating – `GET /api/rating`
**Antes:** `src/rating/rating.service.ts:29` `find({where, relations:['user']})` + `Promise.all(enrich)` retornava `Rating[]`.

**Depois:** `src/rating/rating.service.ts:17` + `RatingPaginationDto`
```ts
async findAll(dto?: RatingPaginationDto | string) // compatível com legado string
  const [ratings,total] = await repo.findAndCount({ where, relations:['user'], order:{id:'DESC'}, skip, take });
  const data = await Promise.all(ratings.map(enrich com getBookById)); // só da página!
  return buildPaginatedResponse(data, total, page, limit); // {data, meta}
```
`src/rating/rating.controller.ts:15` → `findAll(@Query() dto: RatingPaginationDto)`.

**Exemplo:**
```
GET /api/rating?page=1&limit=1 → { data:[{...book:{...}}], meta:{total:2, page:1, limit:1, totalPages:2} }
GET /api/rating?googleBookId=zyTCAlFPjgYC&page=2&limit=5 → filtro + paginação
```

**Benefício:** antes carregava todas as linhas + N chamadas GoogleBooks; agora só página.

### 4. Books – `GET /api/books/search`
**Antes:** `src/books/google-books.service.ts:12` `params:{q, maxResults:20}` fixo, `src/books/books.controller.ts:9` `search(@Query('q') query)`.

**Depois:** `src/books/google-books.service.ts:12` `searchBooks(query, paginationDto?: BooksPaginationDto)` calcula `startIndex=(page-1)*limit`, `maxResults=min(limit,40)` e envia `{q, startIndex, maxResults}`.  
`src/books/books.controller.ts:9` → `search(@Query() dto: BooksPaginationDto)` onde `dto.q` é a query.

**Exemplo:**
```
GET /api/books/search?q=Harry&page=2&limit=5 → Google: ?q=Harry&startIndex=5&maxResults=5 → retorna [...5]
GET /api/books/search?q=Harry → defaults page1 limit10 → startIndex 0
```

---

## Validação e Erros
- `page` deve ser `>=1` (int) → `400 Bad Request` se `0`, `-1`, string
- `limit` deve ser `1..maxDomínio` (users/rating/books max 20, global max 50) → `400` se `limit=100`
- Campos extras não permitidos (`?foo=bar`) → `400` devido a `forbidNonWhitelisted`

Exemplos E2E:
```
GET /api/rating?limit=100 → 400
GET /api/rating?page=0 → 400
GET /api/books/search?q=test&limit=100 → 400
```

---

## Testes Atualizados

### Unitários (202 testes)
- `src/users/__tests__/unit/users.service.spec.ts:152` – mock `findAndCount`, valida `meta`, testa `page 2 limit 5 → skip 5`, max limit 20.
- `src/users/__tests__/unit/users.controller.spec.ts:80` – controller repassa `PaginationDto`.
- `src/rating/rating.service.spec.ts:129` – `findAndCount` com `order/skip/take`, valida `meta`, legacy string ainda funciona, paginação `page2 limit5`.
- `src/rating/rating.controller.spec.ts:109` – controller com `RatingPaginationDto`, valida `data/meta`, paginação.
- `src/books/google-books.service.spec.ts:62` – espera `startIndex:0, maxResults:10` em todos os casos, fallback com chave mantém paginação.
- `src/books/books.controller.spec.ts:40` – nova assinatura `search({q,...})`, testa `q` e `pagination`.

### E2E (98 testes, antes 93)
- `test/rating.e2e-spec.ts:196` – adaptado para `{data,meta}`, adicionados `paginar page&limit`, `400 limit>max`, `400 page inválido`.
- `test/books.e2e-spec.ts:50` – adaptado para nova assinatura, adicionados `page/limit → startIndex` e `400 limit>max`.
- `test/users.e2e-spec.ts` – mantém `success` wrapper; meta adicionada não quebra testes existentes (compatível). Recomendado adicionar testes de paginação lá também.

Rodar:
```bash
npm run test         # 11 suites, 202 testes
npm run test:e2e     # 5 suites, 98 testes (com --runInBand)
```

---

## Estrutura Final
```
src/
├── common/
│   ├── constants/pagination.constants.ts
│   ├── dto/pagination.dto.ts, paginated-response.dto.ts
│   ├── interfaces/pagination.interface.ts
├── users/dto/users-pagination.dto.ts
├── rating/dto/rating-pagination.dto.ts
├── books/dto/books-pagination.dto.ts
├── users/users.service.ts, users.controller.ts
├── rating/rating.service.ts, rating.controller.ts
├── books/google-books.service.ts, books.controller.ts
├── main.ts (ValidationPipe)
```

---

## Decisão Arquitetural Documentada
**Escolhido:** contrato em `common` + defaults per-domínio via DTOs que herdam/estendem o contrato.

**Prós:** consistência para o cliente (`?page&limit` + `meta` igual), otimização por domínio (limites distintos), fácil evolução (ex: cursor futuramente só muda `common`).

**Contras:** exige `ValidationPipe` com `transform` (breaking se cliente enviava campos extras – já mitigado em prod).

**Alternativas descartadas:** contrato rígido global (perderia otimização), totalmente per-domínio sem `common` (divergência).

---

## Histórico de Commits (granulares)
1. `0ba7bd3 feat(common): cria contrato compartilhado` – 8 arquivos
2. `45a3ac5 feat(users): aplica paginação` – 4 arquivos
3. `3b021f4 feat(rating): paginação paginada` – 4 arquivos
4. `94901c4 feat(books): paginação Google Books` – 4 arquivos
5. `abf5970 test(e2e): adapta suites` – 2 arquivos

Todos seguidos de `npm run test` e `npm run test:e2e` verdes.

---

## Próximos Passos Sugeridos
- Adicionar `createdAt/updatedAt` nas entidades para ordenação por data (hoje `id DESC`).
- Adicionar índices DB em `rating.googleBookId` e `user.email`.
- Implementar cache para `getBookById` por página (reduz N chamadas Google).
- Considerar cursor-based para `rating` se volume >10k.
- Documentar paginação em OpenAPI/Swagger se adotado.
