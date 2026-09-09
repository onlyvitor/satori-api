# Plano de Desacoplamento – Camada `books` da Google Books API

> Objetivo: tornar o domínio de livros agnóstico de provedor externo, aplicando princípios de Clean Architecture / Hexagonal (Ports & Adapters) e Dependency Inversion.

---

## 1. Contexto e Pano de Fundo

### 1.1 Situação atual – alto acoplamento

Hoje `src/books/` está 100% acoplado ao Google Books:

- `src/books/books.controller.ts:6` injeta diretamente `GoogleBooksService`
- `src/books/google-books.service.ts:9` contém toda a lógica de consulta HTTP, montagem de `params` (`q`, `startIndex`, `maxResults`, `key`), fallback de `403`, mapeamento `volumeInfo -> BookResponseDto` e tratamento de erro `BAD_GATEWAY / NOT_FOUND`
- `src/rating/rating.service.ts:7,17,22,59,86,103` consome `GoogleBooksService` diretamente para validação (`create`/`update`) e enriquecimento (`findAll`/`findOne`). Isso espalha conhecimento de Google por todo o domínio de avaliação.
- Vazamento de vocabulário externo: rota `GET /books/:googleBookId` (`src/books/books.controller.ts:14`), campo `googleBookId` em `Rating` (`src/rating/entities/rating.entity.ts:28`), e getters `startIndex`/`maxResults` em `BooksPaginationDto` (`src/books/dto/books-pagination.dto.ts:33,37`) — termos exclusivos da API do Google.
- `BookResponseDto` (`src/books/dto/book-response.dto.ts:1`) hoje funciona como DTO de saída **e** como entidade implícita de domínio. Não há `Book` de domínio.
- `BooksModule` (`src/books/books.module.ts:6`) exporta a implementação concreta, não um contrato.

**Consequências:** impossível trocar de provedor (OpenLibrary, ISBNdb, cache local, mock para testes), impossível testar `BooksController`/`RatingService` sem mockar HTTP do Google, e qualquer mudança de contrato externo quebra o core.

### 1.2 Motivação

Aplicar Clean Architecture resolve os três eixos de acoplamento:

1. **Direção de dependência:** domínio não conhece infraestrutura.
2. **Substituibilidade de provedor:** adicionar/remover provedores sem tocar em `Rating` ou `BooksController`.
3. **Testabilidade:** use cases testáveis com `InMemoryBookProvider`/`Fake`.

---

## 2. Objetivo

Construir uma camada `books` agnóstica onde:

- O **domínio** define o que é um `Book` e o que significa “buscar um livro”.
- A **aplicação** orquestra casos de uso (`SearchBooks`, `GetBookById`) via portas.
- A **infraestrutura** implementa portas (`GoogleBooksAdapter`, futuros `OpenLibraryAdapter`, `CachedBookAdapter`, `CompositeBookAdapter`).
- A **apresentação** (`BooksController`) depende apenas de casos de uso / portas, nunca de `HttpService`.

Critério de sucesso: remover `import { GoogleBooksService }` de qualquer arquivo fora de `src/books/infrastructure/`.

---

## 3. Princípios de Clean Architecture Aplicados

| Princípio | Aplicação no `books` |
|---|---|
| **Dependency Rule** | `domain <- application <- infrastructure` e `domain <- application <- presentation`. Setas apontam para dentro. |
| **Entities (Enterprise Business Rules)** | `Book` como entidade pura, sem anotações Nest/TypeORM/Http. |
| **Use Cases (Application Business Rules)** | `SearchBooksUseCase`, `GetBookByIdUseCase` — contêm paginação, validação e orquestração, zero `HttpService`. |
| **Ports (Interfaces)** | `BookProvider` (ou `BookRepository`/`BookGateway`) no `domain/ports/`. Define `search(query, pagination): Promise<PaginatedBooks>` e `findById(id): Promise<Book>`. |
| **Adapters (Interface Adapters + Frameworks/Drivers)** | `GoogleBooksApiAdapter implements BookProvider` encapsula `HttpService`, `mapToBook`, fallback de `key`, erros. |
| **Dependency Inversion (SOLID-D)** | `RatingService` e `BooksController` dependem de `BOOK_PROVIDER` (token) ou de `BooksService` (fachada de aplicação), nunca de `GoogleBooksService`. |
| **Agnosticismo de vocabulário** | Renomear `googleBookId -> bookId` (com `externalId`/`provider` se multi-provider) e `startIndex/maxResults -> page/limit` no domínio. Manter `googleBookId` apenas como alias compatível para migração. |

---

## 4. Arquitetura Alvo

```
                    ┌─────────────────────┐
                    │   Presentation      │
                    │ BooksController     │  depende → Application
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │   Application       │
                    │ SearchBooksUseCase  │  depende → Domain Ports
                    │ GetBookByIdUseCase  │
                    │ BooksService (facade)│
                    └─────────┬───────────┘
                              │  (port)
                    ┌─────────▼───────────┐
                    │     Domain          │
                    │ Book (entity)       │
                    │ BookProvider (port) │
                    │ Pagination VO       │
                    └─────────┬───────────┘
                              ▲
                    ┌─────────┴───────────┐
                    │ Infrastructure      │
                    │ GoogleBooksAdapter  │
                    │ OpenLibraryAdapter  │ (futuro)
                    │ CachedAdapter (decorator) │
                    └─────────────────────┘
```

Fluxo de dependência NestJS: `BOOK_PROVIDER` token → `GoogleBooksAdapter` → injetado em Use Cases → injetado em Controller e RatingService.

---

## 5. Estrutura de Pastas Proposta

```
src/books/
├── domain/
│   ├── entities/
│   │   └── book.entity.ts              # Book puro (id, title, authors, description, thumbnail, publishedDate, pageCount, provider? )
│   └── ports/
│       └── book-provider.port.ts       # interface BookProvider { search(...): Promise<Book[]>; findById(...): Promise<Book> }
├── application/
│   ├── dto/
│   │   ├── book-response.dto.ts        # mapeia Book -> resposta HTTP (mantém compatibilidade)
│   │   └── books-pagination.dto.ts     # move getters startIndex/maxResults para adapter; DTO fica só page/limit/q
│   ├── use-cases/
│   │   ├── search-books.use-case.ts
│   │   └── get-book-by-id.use-case.ts
│   └── books.service.ts                # Fachada opcional que delega aos use-cases (mantém API atual para compatibilidade)
├── infrastructure/
│   ├── adapters/
│   │   └── google-books.adapter.ts     # atual google-books.service.ts renomeado + implementa BookProvider
│   ├── mappers/
│   │   └── google-books.mapper.ts      # mapToBook isolado (testável)
│   └── http/
│       └── google-books.http.config.ts # baseUrl, timeout, interceptors
└── presentation/
    └── books.controller.ts             # injeta BooksService / use-cases, rota :bookId (alias :googleBookId legado)
```

Alternativa minimalista (se quiser menos churn): manter `src/books/books.module.ts` com `provide: 'BOOK_PROVIDER'` sem reestruturar pastas fisicamente — mas recomenda-se a separação por pastas para explicitar a regra de dependência e permitir `eslint` boundaries.

> A entidade `Rating` permanece em `src/rating/`, mas seu campo `googleBookId` evolui para `bookId` (ou `externalBookId` + `bookProvider`). Migração de coluna via TypeORM migration com alias.

---

## 6. Contratos (Esboço)

### 6.1 Domínio – `Book`

```ts
// src/books/domain/entities/book.entity.ts
export class Book {
  constructor(
    public readonly id: string,          // id opaco do provedor (ex: "zyTCAlFPjgYC")
    public readonly title: string,
    public readonly authors: string[],
    public readonly description: string,
    public readonly thumbnail: string,
    public readonly publishedDate: string,
    public readonly pageCount: number,
    public readonly provider?: string,   // 'google' | 'openlibrary' — futuro
  ) {}
}
```

### 6.2 Porta – `BookProvider`

```ts
// src/books/domain/ports/book-provider.port.ts
import { Book } from '../entities/book.entity';
import { BooksPaginationDto } from '../../application/dto/books-pagination.dto';

export const BOOK_PROVIDER = Symbol('BOOK_PROVIDER');

export interface BookProvider {
  search(query: string, pagination: BooksPaginationDto): Promise<Book[]>;
  findById(id: string): Promise<Book>; // lança NotFoundException / BadGateway conforme domínio
}
```

> Se preferir paginação agnóstica, usar `PaginatedResult<Book>` com `total` e `pageInfo`. Hoje Google não retorna `totalItems` confiável — adapter normaliza para `Book[]` e deixa contagem para camada externa quando necessário.

### 6.3 Casos de Uso

```ts
// src/books/application/use-cases/search-books.use-case.ts
@Injectable()
export class SearchBooksUseCase {
  constructor(@Inject(BOOK_PROVIDER) private readonly provider: BookProvider) {}
  execute(query: string, dto: BooksPaginationDto): Promise<Book[]> {
    // valida query, normaliza page/limit, delega ao provider
  }
}

// src/books/application/use-cases/get-book-by-id.use-case.ts
@Injectable()
export class GetBookByIdUseCase {
  constructor(@Inject(BOOK_PROVIDER) private readonly provider: BookProvider) {}
  execute(id: string): Promise<Book> { ... }
}
```

### 6.4 Adapter – `GoogleBooksAdapter`

Extrair de `src/books/google-books.service.ts:14-96` :

- Mantém `HttpService`, `baseUrl`, lógica de `startIndex = (page-1)*limit`, `maxResults = min(limit, 40)`, fallback de `403` sem `key`, `mapToBookResponse`.
- Implementa `BookProvider`.
- Usa `GoogleBooksMapper` dedicado (`volumeInfo -> Book`).
- Traduz erros HTTP para exceções de domínio (`BookNotFoundException` → mapeada para `404` na presentation).

### 6.5 Fachada opcional – `BooksService`

Mantém compatibilidade para `RatingService`:

```ts
@Injectable()
export class BooksService {
  constructor(
    private readonly searchUseCase: SearchBooksUseCase,
    private readonly getByIdUseCase: GetBookByIdUseCase,
  ) {}
  searchBooks = (q, dto) => this.searchUseCase.execute(q, dto);
  getBookById = (id) => this.getByIdUseCase.execute(id);
}
```

> `RatingService` passa a depender de `BooksService` ou diretamente de `BOOK_PROVIDER` / `GetBookByIdUseCase`. Preferência: `BooksService` (fachada) para não vazar `BookProvider` para fora do módulo `books`.

---

## 7. Impacto em `Rating`

- **Hoje:** `src/rating/rating.service.ts:22,59,86,103` chama `googleBooksService.getBookById` para validar existência e enriquecer resposta.
- **Depois:** injeta `BooksService` (ou `GetBookByIdUseCase`) — nome agnóstico `booksService.getBookById(bookId)`. Renomear `googleBookId` para `bookId` (manter getter `get googleBookId()` para compatibilidade temporária). Se multi-provider, `Rating` guarda `{ bookId, provider }` ou `externalId`.

Isso elimina `import { GoogleBooksService }` de `src/rating/` — prova de desacoplamento.

---

## 8. Configuração e Injeção (NestJS)

```ts
// src/books/books.module.ts
@Module({
  imports: [HttpModule],
  controllers: [BooksController],
  providers: [
    SearchBooksUseCase,
    GetBookByIdUseCase,
    BooksService,
    { provide: BOOK_PROVIDER, useClass: GoogleBooksAdapter },
    // futuro: { provide: BOOK_PROVIDER, useClass: CachedBookAdapter } // decorator
    // futuro: Composite: resolve provider por prefixo do id
  ],
  exports: [BooksService, BOOK_PROVIDER, SearchBooksUseCase, GetBookByIdUseCase],
})
export class BooksModule {}
```

Vantagens: trocar `useClass` para `OpenLibraryAdapter` sem tocar em controller/rating; testar com `useValue: InMemoryBookProvider`; aplicar `CacheInterceptor` / decorator sem herança.

---

## 9. Plano de Migração em Fases (sem big-bang)

| Fase | Escopo | Arquivos | Verificação |
|------|--------|----------|-------------|
| **0 – Prep** | Congelar contrato atual, adicionar testes de caracterização para `search`/`getById` e `RatingService` com `googleBookId` | `google-books.service.spec.ts`, `books.controller.spec.ts` | `npm test` verde |
| **1 – Domínio** | Criar `Book` entity + `BookProvider` port + `BOOK_PROVIDER` token | `domain/entities/book.entity.ts`, `domain/ports/book-provider.port.ts` | `tsc --noEmit` |
| **2 – Adapter** | Extrair `GoogleBooksAdapter implements BookProvider` + `GoogleBooksMapper` a partir do service atual; manter `GoogleBooksService` como alias deprecated que delega ao adapter | `infrastructure/adapters/google-books.adapter.ts` | testes do adapter isolados |
| **3 – Aplicação** | Criar `SearchBooksUseCase`, `GetBookByIdUseCase`, `BooksService` fachada; mover regras de paginação para use-case | `application/use-cases/*` | testes de use-case com `FakeProvider` |
| **4 – Wiring** | `BooksModule` provê `BOOK_PROVIDER -> GoogleBooksAdapter`; `BooksController` passa a injetar `BooksService`/`UseCases` (manter injeção de `GoogleBooksService` como fallback compatível por 1 sprint) | `books.controller.ts:6-7`, `books.module.ts` | `GET /books/search?q=...` e `GET /books/:id` manuais |
| **5 – Rating** | `RatingService` migra para `BooksService`; renomear `googleBookId` → `bookId` (migration TypeORM + DTO alias) | `rating/rating.service.ts`, `rating/entities/rating.entity.ts` | `npm test src/rating` + teste e2e de criação de rating |
| **6 – DTOs/Rotas** | `BooksPaginationDto` remove `startIndex/maxResults` (fica só `page/limit/q` com `skip/take`); `BookResponseDto` mapeia `Book` → DTO; rota `:bookId` com redirect/alias `:googleBookId` | `dto/books-pagination.dto.ts:33-39`, `books.controller.ts:14` | contrato da API validado (Postman/e2e) |
| **7 – Testes** | Reescrever `google-books.service.spec.ts` → `google-books.adapter.spec.ts` + `search-books.use-case.spec.ts` + `books.controller.spec.ts` com `BOOK_PROVIDER` mock; `rating.service.spec.ts` com `BooksService` mock | `*.spec.ts` | cobertura ≥ atual |
| **8 – Limpeza** | Remover `GoogleBooksService` deprecated, `googleBookId` alias, e getters legados; atualizar `docs/` | — | `grep -r "googleBookId\|GoogleBooksService\|startIndex" src --include="*.ts"` deve retornar só adapter/mapper |

Cada fase é mergeável isoladamente e mantém compatibilidade retroativa (alias + fachada).

---

## 10. Estratégia de Testes

- **Domínio:** testes puros de `Book` e `BookProvider` (contrato).
- **Adapter:** teste de `GoogleBooksAdapter` com `HttpService` mockado — herdará casos de `google-books.service.spec.ts:61-375` (fallback 403, mapeamento de `volumeInfo`, erros `BAD_GATEWAY`/`NOT_FOUND`).
- **Use Cases:** teste com `InMemoryBookProvider` (fake) — valida paginação, normalização de `limit` vs `GOOGLE_MAX`, propagação de erros.
- **Controller:** teste com `BooksService` mockado — já coberto em `books.controller.spec.ts:41-108`, só trocar `provide: GoogleBooksService` → `provide: BooksService`.
- **RatingService:** mockar `BooksService` ao invés de `GoogleBooksService`; garantir que `enrich` retorna `book: null` em falha (comportamento atual `rating.service.ts:61-63`).

---

## 11. Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Quebra de contrato para front que usa `googleBookId` | Manter alias `googleBookId` ↔ `bookId` por 1–2 releases; transformar no mapper/serializer. |
| `Rating` com FK string sem validação de provedor | Adicionar `bookProvider` nullable e migration; validação no use-case. |
| Perda de `totalItems` do Google (paginação futura) | Adapter retorna `PaginatedBooks { items, total }` quando disponível; controller adapta. |
| Over-engineering (4 pastas para 1 adapter) | Começar minimalista: `domain/ports` + `infrastructure/google-books.adapter.ts` + `application/books.service.ts` — evoluir pastas sob demanda. |

---

## 12. Critérios de Aceitação (DoD)

- [ ] Nenhum arquivo fora de `src/books/infrastructure/` importa `HttpService` ou `https://www.googleapis.com`.
- [ ] `BooksController` e `RatingService` dependem apenas de `BooksService` / `BOOK_PROVIDER` / use-cases.
- [ ] `grep -R "GoogleBooksService" src --include="*.ts"` retorna apenas `infrastructure/` + `books.module.ts`.
- [ ] Testes existentes verdes + novos testes de adapter/use-case.
- [ ] Documentação de como adicionar novo provedor (ex: `OpenLibraryAdapter implements BookProvider`) em `docs/books-provider.md`.

---

## 13. Evoluções Futuras Habilitadas

- `CachedBookAdapter` (decorator que envolve `BOOK_PROVIDER` com `CACHE_MANAGER`).
- `CompositeBookProvider` que roteia por prefixo (`google:xyz` vs `openlibrary:xyz`) ou faz fallback.
- `BookRepository` local (TypeORM) para catálogo próprio, com mesma porta.
- Eventos de domínio (`BookViewed`, `BookSearchPerformed`) sem acoplar ao Google.

---

## 14. Referências

- Clean Architecture (Robert C. Martin) – Dependency Rule, Entities/Use Cases/Adapters.
- Hexagonal Architecture (Alistair Cockburn) – Ports & Adapters.
- NestJS Docs – Custom Providers (`useClass`/`useFactory`, `Symbol` tokens) e `HttpModule`.

---

*Próximo passo recomendado: Fase 1 (criar `Book` + `BookProvider`) — mudança sem risco, desbloqueia todo o resto.*
