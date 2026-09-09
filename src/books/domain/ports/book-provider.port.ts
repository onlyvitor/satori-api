import { Book } from '../entities/book.entity';

/**
 * Porta de domínio (Port) – contrato agnóstico para qualquer provedor de livros.
 * Segue Dependency Inversion: domínio define a interface, infraestrutura implementa.
 */
export const BOOK_PROVIDER = Symbol('BOOK_PROVIDER');

export interface BookSearchParams {
  q?: string;
  page?: number;
  limit?: number;
}

export interface BookProvider {
  /**
   * Busca livros por query com paginação agnóstica.
   * Deve retornar array vazio quando nada encontrado, nunca null.
   */
  search(query: string, params?: BookSearchParams): Promise<Book[]>;

  /**
   * Busca um livro pelo ID opaco do provedor.
   * Deve lançar NotFoundException quando não encontrado e
   * BadGatewayException (ou similar) em falha de infraestrutura.
   */
  findById(id: string): Promise<Book>;
}
