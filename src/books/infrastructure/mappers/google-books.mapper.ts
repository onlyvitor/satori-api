import { Book } from '../../domain/entities/book.entity';

export class GoogleBooksMapper {
  static toDomain(item: any): Book {
    const volumeInfo = item.volumeInfo || {};
    return Book.create({
      id: item.id,
      title: volumeInfo.title || 'Título não disponível',
      authors: volumeInfo.authors || [],
      description: volumeInfo.description || '',
      thumbnail: volumeInfo.imageLinks?.thumbnail || '',
      publishedDate: volumeInfo.publishedDate || '',
      pageCount: volumeInfo.pageCount || 0,
      provider: 'google',
    });
  }

  static toResponseDto(book: Book) {
    // delega ao método da entidade para manter única fonte
    return book.toResponseDto();
  }

  static toDomainList(items: any[]): Book[] {
    if (!items) return [];
    return items.map((item) => this.toDomain(item));
  }
}
