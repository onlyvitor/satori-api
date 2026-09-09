import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BooksPaginationDto } from './books-pagination.dto';
import { PAGINATION_CONSTANTS } from 'src/common/constants/pagination.constants';

describe('BooksPaginationDto', () => {
  it('should have default values', () => {
    const dto = new BooksPaginationDto();
    expect(dto.page).toBe(PAGINATION_CONSTANTS.DEFAULT_PAGE);
    expect(dto.limit).toBe(PAGINATION_CONSTANTS.BOOKS.DEFAULT_LIMIT);
    expect(dto.q).toBeUndefined();
  });

  it('should compute skip/take correctly', () => {
    const dto = plainToInstance(BooksPaginationDto, { page: 2, limit: 5 });
    expect(dto.skip).toBe(5);
    expect(dto.take).toBe(5);
    expect(dto.startIndex).toBe(5);
    expect(dto.maxResults).toBe(5);
  });

  it('should handle first page', () => {
    const dto = plainToInstance(BooksPaginationDto, { page: 1, limit: 10 });
    expect(dto.skip).toBe(0);
    expect(dto.take).toBe(10);
  });

  it('should use defaults when undefined', () => {
    const dto = new BooksPaginationDto();
    dto.page = undefined as any;
    dto.limit = undefined as any;
    expect(dto.skip).toBe(0);
    expect(dto.take).toBe(PAGINATION_CONSTANTS.BOOKS.DEFAULT_LIMIT);
  });

  it('should validate page min 1', async () => {
    const dto = plainToInstance(BooksPaginationDto, { page: 0, limit: 10 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('should validate limit max 20', async () => {
    const dto = plainToInstance(BooksPaginationDto, { page: 1, limit: 100 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('should validate limit min 1', async () => {
    const dto = plainToInstance(BooksPaginationDto, { page: 1, limit: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('should pass validation with valid pagination', async () => {
    const dto = plainToInstance(BooksPaginationDto, { page: 1, limit: 10, q: 'Harry' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should transform string page/limit to number', async () => {
    const dto = plainToInstance(BooksPaginationDto, { page: '2', limit: '5' } as any);
    expect(typeof dto.page).toBe('number');
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(5);
  });

  it('should keep startIndex/maxResults as deprecated aliases', () => {
    const dto = plainToInstance(BooksPaginationDto, { page: 3, limit: 10 });
    expect(dto.startIndex).toBe(dto.skip);
    expect(dto.maxResults).toBe(dto.take);
    expect(dto.startIndex).toBe(20);
  });
});
