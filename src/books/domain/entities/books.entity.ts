import { Book } from './book.entity';

// Re-export para compatibilidade: antigo BookEntity agora é Book de domínio agnóstico
export { Book, Book as BookEntity } from './book.entity';

// Mantém compatibilidade de import tipo `from "./books.entity"`
export type BookProviderId = unknown;

export class LegacyBookEntity extends Book {
  constructor(
    title: string,
    author: string,
    coverURL: string,
    description: string,
    bookProviderId?: unknown,
  ) {
    super('', title, [author], description, coverURL, '', 0, bookProviderId as string);
  }

  // factory legado: mantido para não quebrar commits anteriores, delega ao Book.create
  static createLegacy(
    title: string,
    author: string,
    coverURL: string,
    description: string,
    bookProviderId?: unknown,
  ): Book {
    return Book.create({
      id: (bookProviderId as string) ?? '',
      title,
      authors: [author],
      description,
      thumbnail: coverURL,
      provider: bookProviderId as string,
    });
  }
}