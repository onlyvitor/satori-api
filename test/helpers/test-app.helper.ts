import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { DataSource } from 'typeorm';
import { GoogleBooksService } from '../../src/books/google-books.service';
import { mockBook, mockBooksSearchResult } from './fixtures';

export interface TestAppContext {
  app: INestApplication;
  dataSource: DataSource;
  mockGoogleBooksService: {
    searchBooks: jest.Mock;
    getBookById: jest.Mock;
  };
}

export async function createTestApp(): Promise<TestAppContext> {
  const mockGoogleBooksService = {
    searchBooks: jest.fn().mockResolvedValue(mockBooksSearchResult),
    getBookById: jest.fn().mockImplementation((id: string) => {
      if (id === mockBook.id || id === 'def456') {
        const book = id === mockBook.id ? mockBook : { ...mockBook, id: 'def456', title: 'Second Book' };
        return Promise.resolve(book);
      }
      // Simula comportamento real: lança NOT_FOUND
      const { HttpException, HttpStatus } = require('@nestjs/common');
      throw new HttpException(`Livro com ID "${id}" não encontrado`, HttpStatus.NOT_FOUND);
    }),
  };

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(GoogleBooksService)
    .useValue(mockGoogleBooksService)
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

  return { app, dataSource, mockGoogleBooksService };
}

export async function closeTestApp(ctx: TestAppContext) {
  await ctx.app.close();
  if (ctx.dataSource?.isInitialized) {
    await ctx.dataSource.destroy();
  }
}
