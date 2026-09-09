import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { BookResponseDto } from './dto/book-response.dto';
import { BooksPaginationDto } from './dto/books-pagination.dto';
import { PAGINATION_CONSTANTS } from 'src/common/constants/pagination.constants';

@Injectable()
export class GoogleBooksService {
  private readonly baseUrl = 'https://www.googleapis.com/books/v1/volumes';

  constructor(private readonly httpService: HttpService) { }

  async searchBooks(query: string, paginationDto?: BooksPaginationDto): Promise<BookResponseDto[] | any> {
    // Compatibilidade: paginationDto pode vir como string vazia em testes antigos, tratar
    let page: number = PAGINATION_CONSTANTS.DEFAULT_PAGE;
    let limit: number = PAGINATION_CONSTANTS.BOOKS.DEFAULT_LIMIT;
    if (paginationDto && typeof paginationDto === 'object') {
      page = paginationDto.page ?? page;
      limit = paginationDto.limit ?? limit;
    }

    const startIndex = (page - 1) * limit;
    const maxResults = Math.min(limit, PAGINATION_CONSTANTS.BOOKS.GOOGLE_MAX);

    try {
      const params: any = {
        q: query,
        startIndex,
        maxResults,
      };

      if (process.env.GOOGLE_BOOKS_API_KEY) {
        params.key = process.env.GOOGLE_BOOKS_API_KEY;
      }

      let response;
      try {
        response = await firstValueFrom(
          this.httpService.get(this.baseUrl, { params }),
        );
      } catch (error: any) {
        // Try fallback without the API key if it's forbidden/blocked
        if (error.response?.status === 403 && params.key) {
          console.warn('Google Books API key is blocked or invalid. Falling back to public quota.');
          delete params.key;
          response = await firstValueFrom(
            this.httpService.get(this.baseUrl, { params }),
          );
        } else {
          throw error;
        }
      }

      if (!response.data.items) {
        return [];
      }

      return response.data.items.map((item: any) => this.mapToBookResponse(item));
    } catch (error: any) {
      console.error('Google Books API Error details:', error.response?.data || error.message);
      throw new HttpException(
        'Erro ao buscar livros na Google Books API',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async getBookById(googleBookId: string): Promise<BookResponseDto> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/${googleBookId}`),
      );

      return this.mapToBookResponse(response.data);
    } catch (error) {
      throw new HttpException(
        `Livro com ID "${googleBookId}" não encontrado`,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private mapToBookResponse(item: any): BookResponseDto {
    const volumeInfo = item.volumeInfo || {};
    return {
      id: item.id,
      title: volumeInfo.title || 'Título não disponível',
      authors: volumeInfo.authors || [],
      description: volumeInfo.description || '',
      thumbnail: volumeInfo.imageLinks?.thumbnail || '',
      publishedDate: volumeInfo.publishedDate || '',
      pageCount: volumeInfo.pageCount || 0,
    };
  }
}
