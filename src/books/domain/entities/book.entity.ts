export class Book {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly authors: string[],
    public readonly description: string,
    public readonly thumbnail: string,
    public readonly publishedDate: string,
    public readonly pageCount: number,
    public readonly provider?: string,
  ) {}

  static create(params: {
    id: string;
    title: string;
    authors?: string[];
    description?: string;
    thumbnail?: string;
    publishedDate?: string;
    pageCount?: number;
    provider?: string;
  }): Book {
    return new Book(
      params.id,
      params.title ?? 'Título não disponível',
      params.authors ?? [],
      params.description ?? '',
      params.thumbnail ?? '',
      params.publishedDate ?? '',
      params.pageCount ?? 0,
      params.provider,
    );
  }

  toResponseDto() {
    return {
      id: this.id,
      title: this.title,
      authors: this.authors,
      description: this.description,
      thumbnail: this.thumbnail,
      publishedDate: this.publishedDate,
      pageCount: this.pageCount,
    };
  }
}

// Alias legado para compatibilidade com código que importava BookEntity
export { Book as BookEntity };
