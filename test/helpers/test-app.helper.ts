import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { DataSource } from 'typeorm';
import { GoogleBooksService } from '../../src/books/infrastructure/google-books.service';
import { BooksService } from '../../src/books/application/books.service';
import { Book } from '../../src/books/domain/entities/book.entity';
import { mockBook, mockBook2, mockBooksSearchResult } from './fixtures';

export interface TestAppContext {
  app: INestApplication;
  dataSource: DataSource;
  mockGoogleBooksService: {
    searchBooks: jest.Mock;
    getBookById: jest.Mock;
  };
  mockBooksService: {
    searchBooks: jest.Mock;
    getBookById: jest.Mock;
    search: jest.Mock;
    findById: jest.Mock;
  };
}

function toBookEntity(dto: any): Book {
  return Book.create({ ...dto, provider: 'google' });
}

function createNotFoundError(id: string) {
  const { HttpException, HttpStatus } = require('@nestjs/common');
  throw new HttpException(`Livro com ID "${id}" não encontrado`, HttpStatus.NOT_FOUND);
}

function resolveMockBookDto(id: string): any | null {
  if (id === mockBook.id) return mockBook;
  if (id === mockBook2.id || id === 'def456') return mockBook2;
  return null;
}

export async function createTestApp(): Promise<TestAppContext> {
  const mockSearchResultEntities = mockBooksSearchResult.map(toBookEntity);

  // ---- Mocks compartilhados: BooksService é fonte da verdade (agnóstico) ----
  // GoogleBooksService é legado; para compatibilidade mantemos o MESMO jest.fn
  // em ambos os providers. Assim testes que ainda mockam GoogleBooksService
  // automaticamente afetam BooksService até a migração completa.
  // Conversão DTO -> Entity é feita automaticamente para não quebrar
  // o controller (que chama b.toResponseDto()).

  const sharedSearchBooks = jest.fn().mockImplementation((query: string, params?: any) => {
    return Promise.resolve(mockSearchResultEntities);
  });

  const sharedGetBookById = jest.fn().mockImplementation((id: string) => {
    const dto = resolveMockBookDto(id);
    if (dto) return Promise.resolve(toBookEntity(dto));
    return createNotFoundError(id);
  });

  // Patch mockResolvedValue para converter DTOs em entidades automaticamente
  const patchSearchMock = (mock: jest.Mock) => {
    const origResolved = mock.mockResolvedValue.bind(mock);
    const origRejected = mock.mockRejectedValue.bind(mock);
    const origImpl = mock.mockImplementation.bind(mock);

    mock.mockResolvedValue = (value: any) => {
      // Se for array de DTOs simples, converte para entidades
      if (Array.isArray(value) && value.length > 0) {
        const first = value[0];
        if (first && typeof first === 'object' && !first.toResponseDto) {
          const converted = value.map(toBookEntity);
          return origResolved(converted);
        }
      }
      // Se for DTO único com id mas sem toResponseDto, converte
      if (value && typeof value === 'object' && !Array.isArray(value) && value.id && !value.toResponseDto) {
        return origResolved(toBookEntity(value));
      }
      return origResolved(value);
    };

    mock.mockRejectedValue = (err: any) => origRejected(err);

    mock.mockImplementation = (impl: (...args: any[]) => any) => {
      const wrapped = (...args: any[]) => {
        const result = impl(...args);
        if (result && typeof result.then === 'function') {
          return result.then((val: any) => {
            if (Array.isArray(val) && val.length > 0 && val[0] && !val[0].toResponseDto) {
              return val.map(toBookEntity);
            }
            if (val && typeof val === 'object' && !Array.isArray(val) && val.id && !val.toResponseDto) {
              return toBookEntity(val);
            }
            return val;
          });
        }
        if (Array.isArray(result) && result.length > 0 && result[0] && !result[0].toResponseDto) {
          return result.map(toBookEntity);
        }
        if (result && typeof result === 'object' && !Array.isArray(result) && result.id && !result.toResponseDto) {
          return toBookEntity(result);
        }
        return result;
      };
      return origImpl(wrapped);
    };

    // mockReset/mocks clear continuam funcionando via jest
    return mock;
  };

  patchSearchMock(sharedSearchBooks);
  patchSearchMock(sharedGetBookById);

  const mockGoogleBooksService = {
    searchBooks: sharedSearchBooks,
    getBookById: sharedGetBookById,
  };

  const mockBooksService = {
    searchBooks: sharedSearchBooks,
    getBookById: sharedGetBookById,
    // aliases do BooksService – mesma instância para contagem unificada
    search: sharedSearchBooks,
    findById: sharedGetBookById,
  };

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(GoogleBooksService)
    .useValue(mockGoogleBooksService)
    .overrideProvider(BooksService)
    .useValue(mockBooksService)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  const dataSource = moduleFixture.get<DataSource>(DataSource);

  return { app, dataSource, mockGoogleBooksService, mockBooksService };
}

export async function closeTestApp(ctx: TestAppContext) {
  await ctx.app.close();
  if (ctx.dataSource?.isInitialized) {
    await ctx.dataSource.destroy();
  }
}

/** Helper para resetar mocks para estado padrão (útil em beforeEach) */
export function resetBookMocks(ctx: TestAppContext) {
  ctx.mockBooksService.searchBooks.mockReset();
  ctx.mockBooksService.getBookById.mockReset();
  // re-aplica defaults via mockImplementation? O patch já cuida
  // Recria defaults manualmente:
  const mockSearchResultEntities = mockBooksSearchResult.map(toBookEntity);
  ctx.mockBooksService.searchBooks.mockImplementation(() => Promise.resolve(mockSearchResultEntities));
  ctx.mockBooksService.getBookById.mockImplementation((id: string) => {
    const dto = resolveMockBookDto(id);
    if (dto) return Promise.resolve(toBookEntity(dto));
    return createNotFoundError(id);
  });
}
