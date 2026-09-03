export const PAGINATION_CONSTANTS = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 50,
  // Domínio específico pode sobrescrever
  USERS: {
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 20,
  },
  RATING: {
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 20,
  },
  BOOKS: {
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 20, // Google permite até 40, mas limitamos para consistência e custo
    GOOGLE_MAX: 40,
  },
} as const;
