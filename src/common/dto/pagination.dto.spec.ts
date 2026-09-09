import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationDto } from './pagination.dto';
import { PAGINATION_CONSTANTS } from '../constants/pagination.constants';

describe('PaginationDto', () => {
  it('should have defaults', () => {
    const dto = new PaginationDto();
    expect(dto.page).toBe(PAGINATION_CONSTANTS.DEFAULT_PAGE);
    expect(dto.limit).toBe(PAGINATION_CONSTANTS.DEFAULT_LIMIT);
  });

  it('should compute skip/take', () => {
    const dto = plainToInstance(PaginationDto, { page: 2, limit: 10 });
    expect(dto.skip).toBe(10);
    expect(dto.take).toBe(10);
  });

  it('should handle first page', () => {
    const dto = plainToInstance(PaginationDto, { page: 1, limit: 10 });
    expect(dto.skip).toBe(0);
  });

  it('should use defaults when undefined', () => {
    const dto = new PaginationDto();
    dto.page = undefined as any;
    dto.limit = undefined as any;
    expect(dto.skip).toBe(0);
    expect(dto.take).toBe(PAGINATION_CONSTANTS.DEFAULT_LIMIT);
  });

  it('should validate page min', async () => {
    const dto = plainToInstance(PaginationDto, { page: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('should validate limit max', async () => {
    const dto = plainToInstance(PaginationDto, { limit: 1000 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('should pass valid', async () => {
    const dto = plainToInstance(PaginationDto, { page: 1, limit: 10 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should transform string to number', async () => {
    const dto = plainToInstance(PaginationDto, { page: '2', limit: '5' } as any);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(5);
  });
});
