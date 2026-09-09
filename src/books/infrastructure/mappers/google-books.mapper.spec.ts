import { GoogleBooksMapper } from './google-books.mapper';
import { Book } from '../../domain/entities/book.entity';

describe('GoogleBooksMapper', () => {
  const fullItem = {
    id: 'abc123',
    volumeInfo: {
      title: 'Full Book',
      authors: ['A', 'B'],
      description: 'Desc',
      imageLinks: { thumbnail: 'http://thumb.jpg' },
      publishedDate: '2020',
      pageCount: 123,
    },
  };

  it('should map full item to Book with provider google', () => {
    const book = GoogleBooksMapper.toDomain(fullItem);
    expect(book).toBeInstanceOf(Book);
    expect(book.id).toBe('abc123');
    expect(book.title).toBe('Full Book');
    expect(book.authors).toEqual(['A', 'B']);
    expect(book.description).toBe('Desc');
    expect(book.thumbnail).toBe('http://thumb.jpg');
    expect(book.publishedDate).toBe('2020');
    expect(book.pageCount).toBe(123);
    expect(book.provider).toBe('google');
  });

  it('should map minimal item with defaults', () => {
    const minimal = { id: 'min', volumeInfo: {} };
    const book = GoogleBooksMapper.toDomain(minimal);
    expect(book.title).toBe('Título não disponível');
    expect(book.authors).toEqual([]);
    expect(book.description).toBe('');
    expect(book.thumbnail).toBe('');
    expect(book.publishedDate).toBe('');
    expect(book.pageCount).toBe(0);
  });

  it('should handle missing volumeInfo', () => {
    const noInfo = { id: 'noInfo' };
    const book = GoogleBooksMapper.toDomain(noInfo as any);
    expect(book.title).toBe('Título não disponível');
    expect(book.authors).toEqual([]);
  });

  it('should handle missing imageLinks', () => {
    const noThumb = {
      id: 'noThumb',
      volumeInfo: {
        title: 'T',
        authors: ['A'],
        description: 'D',
        publishedDate: '2020',
        pageCount: 10,
      },
    };
    const book = GoogleBooksMapper.toDomain(noThumb);
    expect(book.thumbnail).toBe('');
  });

  it('should map toDomainList with multiple items', () => {
    const second = {
      id: 'def',
      volumeInfo: { title: 'Second', authors: ['X'] },
    };
    const list = GoogleBooksMapper.toDomainList([fullItem, second]);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('abc123');
    expect(list[1].id).toBe('def');
    expect(list[1].title).toBe('Second');
  });

  it('should return empty array when items is null/undefined/empty', () => {
    expect(GoogleBooksMapper.toDomainList(null as any)).toEqual([]);
    expect(GoogleBooksMapper.toDomainList(undefined as any)).toEqual([]);
    expect(GoogleBooksMapper.toDomainList([])).toEqual([]);
  });

  it('should delegate toResponseDto to Book entity', () => {
    const book = Book.create({ id: '1', title: 'T', authors: ['A'], description: 'D', thumbnail: 'thumb', publishedDate: '2020', pageCount: 5 });
    const dto = GoogleBooksMapper.toResponseDto(book);
    expect(dto).toEqual(book.toResponseDto());
    expect(dto).toEqual({
      id: '1',
      title: 'T',
      authors: ['A'],
      description: 'D',
      thumbnail: 'thumb',
      publishedDate: '2020',
      pageCount: 5,
    });
    expect((dto as any).provider).toBeUndefined();
  });
});
