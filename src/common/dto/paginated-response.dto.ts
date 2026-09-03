export class PaginatedMetaDto {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export class PaginatedResponseDto<T> {
  data: T[];
  meta: PaginatedMetaDto;
}

export class SuccessPaginatedResponseDto<T> extends PaginatedResponseDto<T> {
  success: boolean = true;
}

export function buildPaginatedMeta(total: number, page: number, limit: number): PaginatedMetaDto {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export function buildPaginatedResponse<T>(data: T[], total: number, page: number, limit: number): PaginatedResponseDto<T> {
  return {
    data,
    meta: buildPaginatedMeta(total, page, limit),
  };
}

export function buildSuccessPaginatedResponse<T>(data: T[], total: number, page: number, limit: number): SuccessPaginatedResponseDto<T> {
  return {
    success: true,
    data,
    meta: buildPaginatedMeta(total, page, limit),
  };
}
