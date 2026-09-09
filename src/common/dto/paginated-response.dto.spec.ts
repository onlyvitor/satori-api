import { buildPaginatedMeta, buildPaginatedResponse, buildSuccessPaginatedResponse, PaginatedMetaDto } from './paginated-response.dto';

describe('PaginatedResponse helpers', () => {
  it('should build meta correctly for first page', () => {
    const meta = buildPaginatedMeta(20, 1, 10);
    expect(meta).toEqual({
      total: 20,
      page: 1,
      limit: 10,
      totalPages: 2,
      hasNextPage: true,
      hasPrevPage: false,
    });
  });

  it('should build meta for last page', () => {
    const meta = buildPaginatedMeta(20, 2, 10);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPrevPage).toBe(true);
  });

  it('should handle total 0 (totalPages 1)', () => {
    const meta = buildPaginatedMeta(0, 1, 10);
    expect(meta.totalPages).toBe(1);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPrevPage).toBe(false);
  });

  it('should ceil totalPages', () => {
    const meta = buildPaginatedMeta(15, 1, 10);
    expect(meta.totalPages).toBe(2);
  });

  it('should build paginated response', () => {
    const data = [{ id: 1 }];
    const res = buildPaginatedResponse(data, 1, 1, 10);
    expect(res.data).toEqual(data);
    expect(res.meta.total).toBe(1);
  });

  it('should build success paginated response', () => {
    const data = [{ id: 1 }];
    const res = buildSuccessPaginatedResponse(data, 1, 1, 10);
    expect(res.success).toBe(true);
    expect(res.data).toEqual(data);
    expect(res.meta.total).toBe(1);
  });

  it('should instantiate DTO classes', () => {
    const meta = new PaginatedMetaDto();
    meta.total = 10;
    expect(meta.total).toBe(10);
  });
});
