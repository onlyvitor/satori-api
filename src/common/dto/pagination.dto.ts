import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PAGINATION_CONSTANTS } from '../constants/pagination.constants';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = PAGINATION_CONSTANTS.DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION_CONSTANTS.MAX_LIMIT)
  limit?: number = PAGINATION_CONSTANTS.DEFAULT_LIMIT;

  get skip(): number {
    const page = this.page ?? PAGINATION_CONSTANTS.DEFAULT_PAGE;
    const limit = this.limit ?? PAGINATION_CONSTANTS.DEFAULT_LIMIT;
    return (page - 1) * limit;
  }

  get take(): number {
    return this.limit ?? PAGINATION_CONSTANTS.DEFAULT_LIMIT;
  }
}
