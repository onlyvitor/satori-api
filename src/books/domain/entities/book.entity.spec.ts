import { Book, BookEntity } from './book.entity';

describe('Book (domain entity)', () => {
  it('should create via constructor with all fields', () => {
    const book = new Book('id123', 'Title', ['Author A'], 'Desc', 'thumb.jpg', '2020', 100, 'google');
    expect(book.id).toBe('id123');
    expect(book.title).toBe('Title');
    expect(book.authors).toEqual(['Author A']);
    expect(book.description).toBe('Desc');
    expect(book.thumbnail).toBe('thumb.jpg');
    expect(book.publishedDate).toBe('2020');
    expect(book.pageCount).toBe(100);
    expect(book.provider).toBe('google');
  });

  it('should create via factory with defaults', () => {
    const book = Book.create({ id: '1', title: 'T' });
    expect(book.id).toBe('1');
    expect(book.title).toBe('T');
    expect(book.authors).toEqual([]);
    expect(book.description).toBe('');
    expect(book.thumbnail).toBe('');
    expect(book.publishedDate).toBe('');
    expect(book.pageCount).toBe(0);
    expect(book.provider).toBeUndefined();
  });

  it('should apply title default when undefined', () => {
    const book = Book.create({ id: '1', title: undefined as any });
    expect(book.title).toBe('Título não disponível');
  });

  it('should handle undefined optional fields with defaults', () => {
    const book = Book.create({
      id: '2',
      title: undefined as any,
      authors: undefined,
      description: undefined,
      thumbnail: undefined,
      publishedDate: undefined,
      pageCount: undefined,
    });
    expect(book.title).toBe('Título não disponível');
    expect(book.authors).toEqual([]);
    expect(book.description).toBe('');
    expect(book.thumbnail).toBe('');
    expect(book.publishedDate).toBe('');
    expect(book.pageCount).toBe(0);
  });

  it('should preserve provided optional fields', () => {
    const book = Book.create({
      id: '3',
      title: 'My Book',
      authors: ['A', 'B'],
      description: 'Desc',
      thumbnail: 'thumb',
      publishedDate: '2021',
      pageCount: 200,
      provider: 'openlibrary',
    });
    expect(book.authors).toEqual(['A', 'B']);
    expect(book.provider).toBe('openlibrary');
    expect(book.pageCount).toBe(200);
  });

  it('should map to response DTO without provider', () => {
    const book = new Book('id', 'T', ['A'], 'D', 'thumb', '2020', 10, 'google');
    const dto = book.toResponseDto();
    expect(dto).toEqual({
      id: 'id',
      title: 'T',
      authors: ['A'],
      description: 'D',
      thumbnail: 'thumb',
      publishedDate: '2020',
      pageCount: 10,
    });
    expect((dto as any).provider).toBeUndefined();
  });

  it('should keep provider out of DTO even when set', () => {
    const book = Book.create({ id: '1', title: 'T', provider: 'google' });
    expect(book.provider).toBe('google');
    expect((book.toResponseDto() as any).provider).toBeUndefined();
  });

  it('should re-export Book as BookEntity', () => {
    expect(BookEntity).toBe(Book);
    const book = new BookEntity('1', 'T', [], '', '', '', 0);
    expect(book).toBeInstanceOf(Book);
    expect(book.id).toBe('1');
  });

  it('should create identical instance via BookEntity alias', () => {
    const viaAlias = BookEntity.create({ id: 'alias1', title: 'Alias Book', authors: ['A'] });
    expect(viaAlias).toBeInstanceOf(Book);
    expect(viaAlias.id).toBe('alias1');
    expect(viaAlias.title).toBe('Alias Book');
  });
});
