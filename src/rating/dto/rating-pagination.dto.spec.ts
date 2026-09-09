import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RatingPaginationDto } from './rating-pagination.dto';
import { PAGINATION_CONSTANTS } from 'src/common/constants/pagination.constants';

describe('RatingPaginationDto', () => {
  it('should have defaults', () => {
    const dto = new RatingPaginationDto();
    expect(dto.page).toBe(PAGINATION_CONSTANTS.DEFAULT_PAGE);
    expect(dto.limit).toBe(PAGINATION_CONSTANTS.RATING.DEFAULT_LIMIT);
    expect(dto.googleBookId).toBeUndefined();
    expect(dto.bookId).toBeUndefined();
    expect(dto.effectiveBookId).toBeUndefined();
  });

  it('should compute skip/take', () => {
    const dto = plainToInstance(RatingPaginationDto, { page: 2, limit: 5 });
    expect(dto.skip).toBe(5);
    expect(dto.take).toBe(5);
  });

  it('should use defaults when undefined', () => {
    const dto = new RatingPaginationDto();
    dto.page = undefined as any;
    dto.limit = undefined as any;
    expect(dto.skip).toBe(0);
    expect(dto.take).toBe(PAGINATION_CONSTANTS.RATING.DEFAULT_LIMIT);
  });

  it('should resolve effectiveBookId with bookId priority', () => {
    const dto = plainToInstance(RatingPaginationDto, { googleBookId: 'g123', bookId: 'b456' });
    expect(dto.effectiveBookId).toBe('b456');
  });

  it('should resolve effectiveBookId with googleBookId fallback', () => {
    const dto = plainToInstance(RatingPaginationDto, { googleBookId: 'g123' });
    expect(dto.effectiveBookId).toBe('g123');
  });

  it('should return undefined when no book id', () => {
    const dto = new RatingPaginationDto();
    expect(dto.effectiveBookId).toBeUndefined();
  });

  it('should validate page min 1', async () => {
    const dto = plainToInstance(RatingPaginationDto, { page: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('should validate limit max 20', async () => {
    const dto = plainToInstance(RatingPaginationDto, { limit: 100 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('should validate googleBookId as string when provided', async () => {
    const dto = plainToInstance(RatingPaginationDto, { googleBookId: 123 as any });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'googleBookId')).toBe(true);
  });

  it('should pass validation with valid data', async () => {
    const dto = plainToInstance(RatingPaginationDto, { page: 1, limit: 10, bookId: 'abc' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should transform string numbers', async () => {
    const dto = plainToInstance(RatingPaginationDto, { page: '3', limit: '5' } as any);
    expect(typeof dto.page).toBe('number');
    expect(dto.page).toBe(3);
  });
});
