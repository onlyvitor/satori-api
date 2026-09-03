export const mockBook = {
  id: 'zyTCAlFPjgYC',
  title: 'Harry Potter and the Philosopher\'s Stone',
  authors: ['J.K. Rowling'],
  description: 'A timeless classic.',
  thumbnail: 'https://example.com/thumb.jpg',
  publishedDate: '1997-06-26',
  pageCount: 223,
};

export const mockBook2 = {
  id: 'def456',
  title: 'Second Book',
  authors: ['Other Author'],
  description: 'Second desc',
  thumbnail: 'https://example.com/thumb2.jpg',
  publishedDate: '2021',
  pageCount: 100,
};

export const mockBooksSearchResult = [mockBook, mockBook2];

export const userFixtures = {
  john: { name: 'john', email: 'john@email.com', password: 'password123' },
  jane: { name: 'jane', email: 'jane@email.com', password: 'password123' },
  admin: { name: 'admin', email: 'admin@email.com', password: 'admin123', isAdmin: true },
};

export const ratingFixtures = {
  valid: {
    score: 5,
    comment: 'A timeless classic.',
    status: 'finished' as const,
    googleBookId: mockBook.id,
    userId: 1, // será sobrescrito pelo service
  },
  reading: {
    score: 3,
    comment: 'Reading now',
    status: 'reading' as const,
    googleBookId: mockBook.id,
    userId: 1,
  },
};
