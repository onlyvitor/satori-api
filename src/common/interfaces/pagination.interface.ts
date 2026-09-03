export interface IPaginationOptions {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export interface IPaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface IPaginatedResult<T> {
  data: T[];
  meta: IPaginatedMeta;
}

// Para endpoints que mantêm wrapper { success, data, meta } (ex: users legado)
export interface ISuccessPaginatedResult<T> extends IPaginatedResult<T> {
  success: boolean;
}
