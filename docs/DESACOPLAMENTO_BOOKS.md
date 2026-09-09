# Desacoplamento da Camada `books` da Google Books API

> **Objetivo:** tornar o domínio de livros agnóstico de provedor externo, aplicando Clean Architecture / Hexagonal (Ports & Adapters) e Dependency Inversion. Este documento explica **o que mudou, por que mudou e como evoluir**.

---

## 1. Problema (Antes)

### 1.1 Acoplamento total
- `src/books/books.controller.ts:6` injetava diretamente `GoogleBooksService`
- `src/books/google-books.service.ts:9` continha toda a lógica HTTP (`q`, `startIndex`, `maxResults`, `key`, fallback `403`), mapeamento `volumeInfo -> BookResponseDto` e tratamento `BAD_GATEWAY/NOT_FOUND`
- `src/rating/rating.service.ts:7,17,22,59,86,103` consumia `GoogleBooksService` para validar (`create`/`update`) e enriquecer (`findAll`/`findOne`), espalhando conhecimento de Google por todo o domínio de avaliação
- Vazamento de vocabulário externo: rota `GET /books/:googleBookId` (`src/books/books.controller.ts:14`), campo `googleBookId` em `Rating` (`src/rating/entities/rating.entity.ts:28`), getters `startIndex/maxResults` em `BooksPaginationDto` (`src/books/dto/books-pagination.dto.ts:33,37`)
- `BookResponseDto` (`src/books/dto/book-response.dto.ts:1`) era DTO de saída **e** entidade implícita; não havia `Book` de domínio
- `BooksModule` (`src/books/books.module.ts:6`) exportava implementação concreta, não contrato

**Consequências:** trocar de provedor (OpenLibrary, cache, mock) exigia tocar em `Rating` e `BooksController`; testes exigiam mock de `HttpService` do Google; qualquer mudança no contrato externo quebrava o core.

### 1.2 Evidência (grep antes)
```bash
grep -R "GoogleBooksService" src --include="*.ts" # aparecia em books.controller, rating.service, rating.service.spec
grep -R "https://www.googleapis.com" src --include="*.ts" # aparecia em google-books.service
grep -R "googleBookId" src --include="*.ts" # espalhado em rating.entity, dto, pagination
```

---

## 2. Solução — Clean Architecture / Ports & Adapters

### 2.1 Princípios aplicados
| Princípio | Onde |
|---|---|
| **Dependency Rule** | `domain <- application <- infrastructure` e `domain <- application <- presentation` |
| **Entities** | `Book` puro (`src/books/domain/entities/book.entity.ts:1`) sem `HttpService`/`TypeORM` |
| **Use Cases** | `SearchBooksUseCase`, `GetBookByIdUseCase` (`src/books/application/use-cases/*:1`) com zero `HttpService` |
| **Ports** | `BookProvider` (`src/books/domain/ports/book-provider.port.ts:1`) define `search(query, params)` e `findById(id)` |
| **Adapters** | `GoogleBooksAdapter implements BookProvider` (`src/books/infrastructure/adapters/google-books.adapter.ts:1`) encapsula HTTP e `GoogleBooksMapper` |
| **Dependency Inversion** | `BooksController` e `RatingService` dependem de `BOOK_PROVIDER` / `BooksService` (fachada), nunca de `GoogleBooksService` |
| **Agnosticismo** | `googleBookId -> bookId` (com alias), `startIndex/maxResults -> page/limit` no domínio |

### 2.2 Arquitetura alvo
```
Presentation (BooksController)  →  Application (Search/GetBookByIdUseCase, BooksService)
         ↓                                  ↓ (port)
       Domain (Book, BookProvider)  ←  Infrastructure (GoogleBooksAdapter, Mapper)
```
Fluxo NestJS: `BOOK_PROVIDER (Symbol)` → `GoogleBooksAdapter` → injetado em Use Cases → injetado em `BooksController` e `RatingService`.

---

## 3. Estrutura de Pastas (Depois)

```
src/books/
├── domain/
│   ├── entities/
│   │   ├── book.entity.ts              # Book agnóstico (id, title, authors, description, thumbnail, publishedDate, pageCount, provider)
│   │   └── books.entity.ts             # re-export + LegacyBookEntity para compat
│   └── ports/
│       └── book-provider.port.ts       # interface BookProvider + BOOK_PROVIDER token + BookSearchParams
├── application/
│   ├── books.service.ts                # Fachada que delega aos use-cases (ponto único agnóstico)
│   └── use-cases/
│       ├── search-books.use-case.ts
│       └── get-book-by-id.use-case.ts
├── infrastructure/
│   ├── adapters/
│   │   └── google-books.adapter.ts     # implementa BookProvider (HTTP, fallback 403, mapper)
│   ├── mappers/
│   │   └── google-books.mapper.ts      # volumeInfo -> Book
│   ├── books.controller.ts             # injeta BooksService, rota :bookId (compatível com :googleBookId)
│   ├── books.module.ts                 # provê BOOK_PROVIDER -> GoogleBooksAdapter
│   └── google-books.service.ts         # legado mantido para compatibilidade (deprecated)
└── presentation/
    └── dto/
        ├── book-response.dto.ts
        └── books-pagination.dto.ts     # page/limit/q + skip/take (startIndex/maxResults deprecated)
```

`Rating` evoluiu para alias agnóstico:
- `src/rating/entities/rating.entity.ts:30` `get/set bookId` ↔ `googleBookId`
- `src/rating/dto/create-rating.dto.ts:17` aceita `bookId` (agnóstico) ou `googleBookId` (legado) via `@ValidateIf`
- `src/rating/dto/rating-pagination.dto.ts:28` `effectiveBookId`

---

## 4. Mudanças por Arquivo (com porquê)

### 4.1 Domain
- **`src/books/domain/entities/book.entity.ts:1`** — Criado `Book` com construtor puro + `static create()` com defaults (`'Título não disponível'`, `[]`, etc) e `toResponseDto()` que exclui `provider`. **Por quê?** Entidade deve existir sem depender de HTTP/TypeORM; defaults evitam `null` na UI; `provider` fica fora do DTO para não vazar infra.
- **`src/books/domain/entities/books.entity.ts:1`** — Re-exporta `Book` como `BookEntity` e mantém `LegacyBookEntity` + `createLegacy()`. **Por quê?** Não quebrar commits anteriores que importavam `BookEntity` com `author` singular e `coverURL`.
- **`src/books/domain/ports/book-provider.port.ts:1`** — Define `BOOK_PROVIDER = Symbol('BOOK_PROVIDER')`, `BookSearchParams {q,page,limit}` e `BookProvider {search, findById}`. **Por quê?** Domínio define **contrato**; infra implementa. `Symbol` evita colisão de strings; `BookSearchParams` é VO agnóstico (sem `startIndex`).

### 4.2 Infrastructure
- **`src/books/infrastructure/mappers/google-books.mapper.ts:1`** — Extraído de `google-books.service.ts:84` `mapToBookResponse`. **Por quê?** Mapper isolado é testável e reutilizável (adapter e service legado compartilham lógica); evita duplicação.
- **`src/books/infrastructure/adapters/google-books.adapter.ts:1`** — Novo `GoogleBooksAdapter implements BookProvider` com mesma lógica de `google-books.service.ts:14` (cálculo `startIndex=(page-1)*limit`, `maxResults=min(limit,40)`, fallback `403` sem `key`, `GOOGLE_MAX`). **Por quê?** Adapter é **único** lugar que conhece `https://www.googleapis.com` e `HttpService`; retorna `Book` (domínio) com `provider='google'`.
- **`src/books/infrastructure/books.controller.ts:1`** — Antes `constructor(private googleBooksService: GoogleBooksService)` agora `constructor(private booksService: BooksService)`; `search` faz `booksService.searchBooks(q, dto).map(b=>b.toResponseDto())`; `findOne` com `@Param() params` resolve `bookId ?? googleBookId` e `typeof params === 'string'` para testes diretos. **Por quê?** Controller (presentation) não pode conhecer `HttpService`; rota `:bookId` é agnóstica mas compatível com `:googleBookId` (URL `/books/abc` funciona para ambos).
- **`src/books/infrastructure/books.module.ts:1`** — Registra `SearchBooksUseCase`, `GetBookByIdUseCase`, `BooksService`, `GoogleBooksAdapter` e ` {provide: BOOK_PROVIDER, useClass: GoogleBooksAdapter}`. Mantém `GoogleBooksService` legado para `RatingService` ainda não migrado (depois removido). **Por quê?** `useClass` permite trocar para `OpenLibraryAdapter` sem tocar em controller/rating; `BOOK_PROVIDER` é ponto de troca.
- **`src/books/infrastructure/google-books.service.ts:1`** — Mantido intacto (legado) mas imports corrigidos para `../presentation/dto`. **Por quê?** Compatibilidade retroativa até Fase 8 do plano; depois será removido quando `grep GoogleBooksService` só retornar `infrastructure`.

### 4.3 Application
- **`src/books/application/use-cases/search-books.use-case.ts:1`** — Injeta `@Inject(BOOK_PROVIDER) bookProvider: BookProvider` (com `import type` para evitar `emitDecoratorMetadata` com interface) e `execute(query, params)` normaliza `q` e delega. **Por quê?** Use case contém regra de aplicação (validação/normalização) sem HTTP; `import type` resolve `TS1272` com `isolatedModules`.
- **`src/books/application/use-cases/get-book-by-id.use-case.ts:1`** — Valida `id` vazio (`NOT_FOUND`) e delega. **Por quê?** Validação de domínio antes de chamar adapter.
- **`src/books/application/books.service.ts:1`** — Fachada com `searchBooks/getBookById` + aliases `search/findById` que delegam aos use-cases. **Por quê?** `RatingService` e `BooksController` dependem de **um** serviço agnóstico, não de dois use-cases nem do provider direto; aliases permitem migração gradual (`searchBooks` legado vs `search` agnóstico).

### 4.4 Presentation / DTOs
- **`src/books/presentation/dto/books-pagination.dto.ts:1`** — Mantém `q, page, limit` + `skip/take`; `startIndex/maxResults` marcados `@deprecated` como alias. **Por quê?** Vocabulário `startIndex` é exclusivo Google; `skip/take` é agnóstico (TypeORM). Deprecar em vez de remover evita breaking change imediato.
- **`src/common/dto/pagination.dto.ts:1`** — Mantido como base.

### 4.5 Rating (desacoplamento)
- **`src/rating/rating.service.ts:1`** — Troca `import { GoogleBooksService }` por `import { BooksService }`; `constructor(private booksService: BooksService)`; `resolveBookId(dto)` prioriza `bookId ?? googleBookId ?? effectiveBookId`; `create/update` validam via `booksService.getBookById(bookId)` e normalizam para `googleBookId` na persistência; `findAll/findOne` enriquecem com `book.toResponseDto()`. **Por quê?** Rating não deve saber se livro vem de Google ou OpenLibrary; `resolveBookId` permite receber `bookId` (novo) ou `googleBookId` (legado).
- **`src/rating/entities/rating.entity.ts:30`** — Adiciona `get/set bookId`. **Por quê?** Alias em entidade permite `rating.bookId = 'xyz'` mapear para coluna `googleBookId` sem migration imediata.
- **`src/rating/dto/create-rating.dto.ts:1`** — `googleBookId` com `@ValidateIf(o=>!o.bookId) @IsNotEmpty()` e `bookId` com `@ValidateIf(o=>!o.googleBookId) @IsOptional()`. **Por quê?** Pelo menos um deve ser provido; `ValidateIf` evita exigir ambos (compatível com cliente antigo que só envia `googleBookId` e novo que envia `bookId`).
- **`src/rating/dto/rating-pagination.dto.ts:1`** — Adiciona `bookId` + `effectiveBookId`. **Por quê?** `GET /api/rating?bookId=xyz` ou `?googleBookId=xyz` filtram igual.

### 4.6 Testes (ver `plan.md:10`)
- `google-books.service.spec.ts` mantido (legado) + novo `google-books.adapter.spec.ts:1` (cobre `Book` com `provider`, paginação, fallback, branch `string`/`null`)
- `books.controller.spec.ts:1` agora mocka `BooksService` com `Book.create` e `toResponseDto`
- `search-books.use-case.spec.ts:1` e `get-book-by-id.use-case.spec.ts:1` com `BOOK_PROVIDER` fake
- `books.service.spec.ts:1` testa fachada
- `book.entity.spec.ts:1` testa `create` defaults, `toResponseDto`, `LegacyBookEntity`
- `google-books.mapper.spec.ts:1` testa `toDomain`/`toDomainList`/`toResponseDto`
- `books-pagination.dto.spec.ts:1`, `rating-pagination.dto.spec.ts:1`, `pagination.dto.spec.ts:1`, `paginated-response.dto.spec.ts:1`, `book-response.dto.spec.ts:1`, `rating.entity.spec.ts:1`, `create-rating.dto.spec.ts:1`
- `books.module.spec.ts:1` verifica `Test.createTestingModule({imports:[BooksModule]})` provê `BOOK_PROVIDER`

**Resultado:** `25 suites, 326 tests, All files 86.9%` (antes `11 suites, 205 tests, 76.02%`).

---

## 5. Decisões Arquiteturais e Alternativas Descartadas

| Decisão | Por quê | Alternativa descartada | Por que descartada |
|---|---|---|---|
| `Book` como classe pura com `static create()` e `toResponseDto()` | Única fonte de defaults e conversão; `provider` fora do DTO | `interface Book` + `BookResponseDto` separado duplicaria defaults | Duplicação de `volumeInfo.title || 'Título...'` |
| `BOOK_PROVIDER = Symbol` | Evita colisão de strings (`'BOOK_PROVIDER'`) e permite múltiplos providers | `provide: 'BOOK_PROVIDER'` string | Risco de conflito em testes |
| `BooksService` fachada | Um ponto único para `RatingService`/`Controller`; aliases `searchBooks`/`search` permitem migração sem big-bang | Controller injetar diretamente `SearchBooksUseCase` e `GetBookByIdUseCase` | Duplicaria injeções; fachada é mais ergonômica e compatível com legado `searchBooks` |
| `GoogleBooksAdapter` separado de `GoogleBooksService` | Adapter retorna `Book` (domínio); Service legado retorna `BookResponseDto` (DTO). Fase de transição sem quebrar `RatingService` | Reescrever `GoogleBooksService` para implementar `BookProvider` diretamente | Quebraria `rating.service.spec` e `google-books.service.spec` prematuramente |
| Manter `googleBookId` como alias + `bookId` | Migração gradual sem `migration` imediata em `Rating.googleBookId` (coluna DB) | Renomear coluna para `bookId` + `provider` + migration | Breaking change para front e DB; alias permite evoluir em releases |
| `BooksPaginationDto` deprecar `startIndex/maxResults` em vez de remover | Compatibilidade com cliente que já usa `skip`/`take` | Remover imediatamente | Quebraria quem acessa `dto.startIndex` |
| `import type { BookProvider }` em use-cases | Resolve `TS1272` com `isolatedModules` + `emitDecoratorMetadata` (interface não pode ser `design:type`) | `// @ts-ignore` | Perde segurança de tipos |

---

## 6. Como Adicionar Novo Provedor (ex: OpenLibrary)

1. Criar `src/books/infrastructure/adapters/open-library.adapter.ts`:
```ts
@Injectable()
export class OpenLibraryAdapter implements BookProvider {
  constructor(private http: HttpService) {}
  async search(query: string, params?: BookSearchParams): Promise<Book[]> {
    const { data } = await firstValueFrom(this.http.get('https://openlibrary.org/search.json', { params: { q: query, page: params?.page, limit: params?.limit } }));
    return data.docs.map(d => Book.create({ id: d.key, title: d.title, authors: d.author_name, provider: 'openlibrary' }));
  }
  async findById(id: string): Promise<Book> { /* ... */ }
}
```
2. Trocar provider em `src/books/infrastructure/books.module.ts:1`:
```ts
{ provide: BOOK_PROVIDER, useClass: OpenLibraryAdapter } // ou Composite
```
3. Para fallback/composite:
```ts
@Injectable()
export class CompositeBookProvider implements BookProvider {
  constructor(@Inject(BOOK_PROVIDER) private providers: BookProvider[]) {}
  async findById(id: string): Promise<Book> {
    for (const p of this.providers) try { return await p.findById(id); } catch {}
    throw new NotFoundException();
  }
}
```
4. Para cache:
```ts
@Injectable()
export class CachedBookAdapter implements BookProvider {
  constructor(@Inject(BOOK_PROVIDER) private inner: BookProvider, @Inject(CACHE_MANAGER) private cache: Cache) {}
  async findById(id: string): Promise<Book> {
    const cached = await this.cache.get<Book>(id);
    if (cached) return cached;
    const book = await this.inner.findById(id);
    await this.cache.set(id, book, 3600);
    return book;
  }
}
```

Nenhum arquivo em `src/rating/` ou `src/books/application/` precisa mudar.

---

## 7. Como Verificar Desacoplamento

```bash
# Nenhum arquivo fora de infrastructure deve importar HttpService ou googleapis
grep -R "HttpService" src --include="*.ts" | grep -v "src/books/infrastructure" # deve retornar só specs
grep -R "googleapis" src --include="*.ts" # só src/books/infrastructure/adapters e google-books.service (legado)

# BooksController e RatingService agnósticos
grep -R "import" src/books/infrastructure/books.controller.ts # só BooksService, não GoogleBooksService
grep -R "import" src/rating/rating.service.ts # só BooksService

# GoogleBooksService só em infrastructure
grep -R "GoogleBooksService" src --include="*.ts" # só src/books/infrastructure/books.module.ts, google-books.service.ts e specs

# Testes e build verdes
npm test -- --coverage # 25 suites, 326 tests, All files 86.9%
npx tsc --noEmit
npm run build # nest build ok, dist/books/{domain,application,infrastructure,presentation} gerado
```

---

## 8. Commits Granulares (16)

```
eda590d fix(books): corrige imports após movimentação parcial
57e4e1d feat(books/domain): cria Book e porta BookProvider
7467231 feat(books/infrastructure): GoogleBooksMapper e Adapter agnóstico
54d0b86 feat(books/application): use-cases e fachada BooksService
5466ba4 refactor(books): desacopla controller e módulo da GoogleBooksService
0640137 refactor(rating): desacopla RatingService da GoogleBooksService
06d08e5 refactor(books/rating): vocabulário agnóstico com compatibilidade
c8c9066 test(books): adapter e use-cases
11d29bb test(books/domain): Book entity
1a0d5be test(books/mapper): GoogleBooksMapper
553bd9c test(books/application): BooksService facade
a8f43c0 test(dto/pagination): Books/Rating/Pagination DTOs
c85d0ae test(rating): entity alias e CreateRatingDto
f957992 test(coverage): branches string/aliases
58445b0 test(coverage): GoogleBooksService legacy string e DTOs finais
1df0c4a test(coverage): branches null e integração de módulos
```

Cada commit mantém `npm test` verde e `tsc --noEmit` limpo.

---

## 9. Próximos Passos (Fase 8 do plano)

- Remover `GoogleBooksService` legado e alias `googleBookId` quando `grep -R "googleBookId" src` só retornar `infrastructure` (após front migrar para `bookId`)
- `CachedBookAdapter` com `CACHE_MANAGER`
- `CompositeBookProvider` por prefixo (`google:xyz` vs `openlibrary:xyz`)
- `BookRepository` local (TypeORM) para catálogo próprio, mesma porta
- Documentar em `docs/books-provider.md` como adicionar provedor

---

*Referências: Clean Architecture (Robert C. Martin) – Dependency Rule, Hexagonal Architecture (Alistair Cockburn) – Ports & Adapters, NestJS Docs – Custom Providers (`Symbol` tokens, `useClass`).*
