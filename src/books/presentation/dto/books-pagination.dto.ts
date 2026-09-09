import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PAGINATION_CONSTANTS } from 'src/common/constants/pagination.constants';

export class BooksPaginationDto {
  @IsOptional()
  @IsString()
  q?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = PAGINATION_CONSTANTS.DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION_CONSTANTS.BOOKS.MAX_LIMIT)
  limit?: number = PAGINATION_CONSTANTS.BOOKS.DEFAULT_LIMIT;

  get skip(): number {
    const page = this.page ?? PAGINATION_CONSTANTS.DEFAULT_PAGE;
    const limit = this.limit ?? PAGINATION_CONSTANTS.BOOKS.DEFAULT_LIMIT;
    return (page - 1) * limit;
  }

  get take(): number {
    return this.limit ?? PAGINATION_CONSTANTS.BOOKS.DEFAULT_LIMIT;
  }

  // Para Google Books API, startIndex = skip
  get startIndex(): number {
    return this.skip;
  }

  get maxResults(): number {
    return this.take;
  }
}
