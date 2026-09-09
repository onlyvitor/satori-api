import { BookResponseDto } from './book-response.dto';
import { Book } from '../../domain/entities/book.entity';

describe('BookResponseDto', () => {
  it('should instantiate and assign fields', () => {
    const dto = new BookResponseDto();
    dto.id = '1';
    dto.title = 'T';
    dto.authors = ['A'];
    dto.description = 'D';
    dto.thumbnail = 'thumb';
    dto.publishedDate = '2020';
    dto.pageCount = 100;
    expect(dto.id).toBe('1');
    expect(dto.pageCount).toBe(100);
  });

  it('should match Book.toResponseDto output', () => {
    const book = Book.create({ id: '1', title: 'T', authors: ['A'], description: 'D', thumbnail: 'thumb', publishedDate: '2020', pageCount: 10 });
    const dto = book.toResponseDto();
    const expected = new BookResponseDto();
    Object.assign(expected, dto);
    expect(expected.id).toBe('1');
  });
});
