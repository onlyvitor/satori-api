import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PAGINATION_CONSTANTS } from 'src/common/constants/pagination.constants';

export class RatingPaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = PAGINATION_CONSTANTS.DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION_CONSTANTS.RATING.MAX_LIMIT)
  limit?: number = PAGINATION_CONSTANTS.RATING.DEFAULT_LIMIT;

  @IsOptional()
  @IsString()
  googleBookId?: string;

  get skip(): number {
    const page = this.page ?? PAGINATION_CONSTANTS.DEFAULT_PAGE;
    const limit = this.limit ?? PAGINATION_CONSTANTS.RATING.DEFAULT_LIMIT;
    return (page - 1) * limit;
  }

  get take(): number {
    return this.limit ?? PAGINATION_CONSTANTS.RATING.DEFAULT_LIMIT;
  }
}
