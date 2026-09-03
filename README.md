# RateBooks — Book Rating API

A REST API for rating books, integrated with the **Google Books API**. Authenticated users can search for books and log their reviews with a score, comment, and reading status.

## Stack

- **[NestJS](https://nestjs.com/)** — Node.js framework
- **[TypeORM](https://typeorm.io/)** + **PostgreSQL** — data persistence
- **[JWT](https://jwt.io/)** — authentication via access/refresh tokens
- **[Google Books API](https://developers.google.com/books)** — external book data integration

---

## Installation and setup

### Prerequisites

- Node.js 18+
- PostgreSQL running locally

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd rateBooks
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=rate_everithing

JWT_SECRET=your_secret_key
```

### 3. Run

```bash
# Development (with hot reload)
npm run start:dev

# Production
npm run start:prod
```

The API will be available at `http://localhost:3000/api`.

### Health
- `GET /api/health` – **público**, sem auth, retorna `{ status:'ok', timestamp, uptime }` – usado pelo `HEALTHCHECK` do Docker.

---

## Docker

> **Sempre use `--env-file`**: o container não copia `.env`; as variáveis (`DB_*`, `JWT_SECRET`, `PORT`) devem ser injetadas.

**Dockerfile:** multi-stage com `node:22-slim` (conforme solicitado), `non-root` (`appuser:appgroup`), `HEALTHCHECK` via `curl -f http://localhost:3000/api/health`. Detalhes e porquês em [`docs/DOCKER.md`](docs/DOCKER.md).

```bash
# Build
docker build -t ratebooks:local .

# Run (exige --env-file, usa --network host para acessar postgres local)
docker run -d --name ratebooks_api --env-file .env --network host ratebooks:local
# ou com bridge + host.docker.internal:
docker run -d -p 3000:3000 --env-file .env -e DB_HOST=host.docker.internal ratebooks:local

# Logs e health
docker logs -f ratebooks_api
curl http://localhost:3000/api/health  # {"status":"ok", ...}
docker inspect --format '{{.State.Health.Status}}' ratebooks_api
```

**Docker Compose (recomendado):**

```bash
# Sobe db (postgres:16) + api com env_file .env, DB_HOST=db, healthchecks
docker compose up --build -d
docker compose logs -f
curl http://localhost:3000/api/health
docker compose down

# Alternativa sem compose (db manual)
docker run -d --name postgres_db_legal -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=12345678 -e POSTGRES_DB=db_legal -p 5432:5432 postgres:16
PGPASSWORD=12345678 psql -h localhost -U postgres -c "CREATE DATABASE db_test;"
```

Arquivos: `Dockerfile`, `.dockerignore`, `docker-compose.yml`.

---

## Endpoints

### Authentication (`/api/auth`)

| Method | Route | Auth Required | Description |
|--------|-------|---------------|-------------|
| `POST` | `/api/auth/login` | No | Login with email and password |
| `POST` | `/api/auth/refresh` | No | Refresh access token using a refresh token |
| `GET`  | `/api/auth/profile` | Yes | Get the logged-in user's data |

**Example — Login:**
```json
POST /api/auth/login
{
  "email": "user@email.com",
  "password": "password123"
}
```

---

### Users (`/api/users`)

| Method | Route | Auth Required | Description |
|--------|-------|---------------|-------------|
| `POST`   | `/api/users`     | No  | Register a new user |
| `GET`    | `/api/users?page=1&limit=10`     | Yes | List all users (**paginated**) |
| `GET`    | `/api/users/:id` | Yes | Get a user by ID |
| `PATCH`  | `/api/users/:id` | Yes | Update a user |
| `DELETE` | `/api/users/:id` | Yes | Delete a user |

**Pagination (Users):** `page` (default 1, min 1), `limit` (default 10, max 20). Response: `{ success:true, data: User[], meta:{ total, page, limit, totalPages, hasNextPage, hasPrevPage } }`.

**Example — List users paginated:**
```
GET /api/users?page=2&limit=5
→ { success:true, data:[...5], meta:{ total:25, page:2, limit:5, totalPages:5 } }
```

**Example — Register a user:**
```json
POST /api/users
{
  "name": "John",
  "email": "john@email.com",
  "password": "password123"
}
```

---

### Books (`/api/books`)

Proxy endpoints for the Google Books API.

| Method | Route | Auth Required | Description |
|--------|-------|---------------|-------------|
| `GET` | `/api/books/search?q=query&page=1&limit=10` | Yes | Search books by title or author (**paginated**: `page` default 1, `limit` default 10 max 20 → `startIndex`/`maxResults` no Google) |
| `GET` | `/api/books/:googleBookId`  | Yes | Get details of a specific book |

**Example — Search books:**
```
GET /api/books/search?q=Harry+Potter&page=2&limit=5
→ [...5] (internamente: startIndex=5, maxResults=5)
```

**Response:**
```json
[
  {
    "id": "zyTCAlFPjgYC",
    "title": "Harry Potter and the Philosopher's Stone",
    "authors": ["J.K. Rowling"],
    "description": "...",
    "thumbnail": "https://...",
    "publishedDate": "1997-06-26",
    "pageCount": 223
  }
]
```

---

### Ratings (`/api/rating`)

| Method | Route | Auth Required | Description |
|--------|-------|---------------|-------------|
| `POST`   | `/api/rating`                    | Yes | Create a rating |
| `GET`    | `/api/rating?page=1&limit=10`                    | Yes | List all ratings (**paginated**) |
| `GET`    | `/api/rating?googleBookId=id&page=1&limit=10`    | Yes | Filter ratings by book (**paginated**) |
| `GET`    | `/api/rating/:id`                | Yes | Get a specific rating |
| `PATCH`  | `/api/rating/:id`                | Yes | Update a rating |
| `DELETE` | `/api/rating/:id`                | Yes | Delete a rating |

**Pagination (Ratings):** `page` default 1, `limit` default 10 max 20. Response: `{ data: Rating[], meta:{ total, page, limit, totalPages, hasNextPage, hasPrevPage } }`. Combina `googleBookId` + paginação: `?googleBookId=xxx&page=2&limit=5`. Erros: `400` se `limit>20` ou `page<1`.

**Example — List ratings paginated:**
```
GET /api/rating?page=1&limit=1 → { data:[{...book:{...}}], meta:{total:2, page:1, limit:1, totalPages:2} }
```

**Example — Create a rating:**
```json
POST /api/rating
{
  "googleBookId": "zyTCAlFPjgYC",
  "userId": 1,
  "score": 5,
  "comment": "A timeless classic.",
  "status": "finished"
}
```

The `googleBookId` is validated against the Google Books API before saving. Read responses include enriched book data.

**Available status values:**

| Value | Description |
|-------|-------------|
| `not_read` | Not yet read |
| `reading` | Currently reading |
| `finished` | Finished |

---

## Pagination

Contrato compartilhado em `src/common` (`interfaces`, `dto`, `constants`) com implementação per-domínio (`UsersPaginationDto`, `RatingPaginationDto`, `BooksPaginationDto` – cada um define `default`/`max` via `PAGINATION_CONSTANTS`). Detalhes completos em [`docs/PAGINACAO.md`](docs/PAGINACAO.md).

Exemplo de `meta`:
```json
{
  "data": [...],
  "meta": { "total": 25, "page": 2, "limit": 10, "totalPages": 3, "hasNextPage": true, "hasPrevPage": true }
}
```

### Project structure

```
src/
├── common/             # Contrato compartilhado de paginação
│   ├── constants/pagination.constants.ts
│   ├── dto/pagination.dto.ts, paginated-response.dto.ts
│   ├── interfaces/pagination.interface.ts
├── auth/               # JWT authentication (login, refresh, guard)
├── books/              # Google Books API integration (paginated search via startIndex)
│   ├── dto/books-pagination.dto.ts
│   ├── books.controller.ts
│   ├── books.module.ts
│   └── google-books.service.ts
├── rating/             # Book ratings (paginated findAndCount + enrich)
│   ├── dto/rating-pagination.dto.ts
│   ├── entities/
│   ├── rating.controller.ts
│   ├── rating.module.ts
│   ├── rating.service.ts
│   └── status.enum.ts
├── users/              # User CRUD (paginated findAndCount)
│   ├── dto/users-pagination.dto.ts
├── app.module.ts
└── main.ts (ValidationPipe com transform)
```

---

## Tests

```bash
# Unit tests (202 testes)
npm run test

# Test coverage
npm run test:cov

# End-to-end tests (98 testes, db_test isolado)
npm run db:create:test        # cria db_test no mesmo container postgres_db_legal (opção A)
npm run test:e2e              # --runInBand para evitar race no db_test
npm run test:e2e:docker       # cria db_test via docker exec + roda E2E
```

**Cobertura de paginação:** unitários validam `findAndCount` + `meta`, E2E validam `?page&limit`, `400` para limites inválidos e `hasNextPage/hasPrevPage`. Ver `docs/PAGINACAO.md`.

---

## License

MIT
