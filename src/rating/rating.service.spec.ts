import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RatingService } from './rating.service';
import { Rating } from './entities/rating.entity';
import { BooksService } from '../books/application/books.service';
import { Book } from '../books/domain/entities/book.entity';
import { Status } from './status.enum';

describe('RatingService', () => {
  let service: RatingService;
  let ratingRepository: jest.Mocked<Repository<Rating>>;
  let booksService: jest.Mocked<BooksService>;

  const mockRating = {
    id: 1,
    score: 5,
    comment: 'Great book!',
    status: Status.FINISHED,
    userId: 1,
    googleBookId: 'abc123',
    user: { id: 1, name: 'John' } as any,
  } as Rating;

  const mockBookDto = {
    id: 'abc123',
    title: 'Test Book',
    authors: ['Author'],
    description: 'Desc',
    thumbnail: 'thumb',
    publishedDate: '2020',
    pageCount: 200,
  };

  const mockBook = Book.create({ ...mockBookDto, provider: 'google' });

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const mockBooksService = {
    getBookById: jest.fn(),
    searchBooks: jest.fn(),
  };

  const currentUser = { sub: 1, email: 'john@example.com', isAdmin: false };
  const adminUser = { sub: 99, email: 'admin@example.com', isAdmin: true };
  const otherUser = { sub: 2, email: 'other@example.com', isAdmin: false };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatingService,
        { provide: getRepositoryToken(Rating), useValue: mockRepository },
        { provide: BooksService, useValue: mockBooksService },
      ],
    }).compile();

    service = module.get<RatingService>(RatingService);
    ratingRepository = module.get(getRepositoryToken(Rating));
    booksService = module.get(BooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto: any = {
      score: 5,
      comment: 'Great!',
      status: Status.FINISHED,
      googleBookId: 'abc123',
      userId: 999, // should be ignored
    };

    it('should create rating successfully and force userId from currentUser', async () => {
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);
      const created = { ...createDto, userId: currentUser.sub };
      mockRepository.create.mockReturnValue(created as any);
      mockRepository.save.mockResolvedValue({ id: 1, ...created } as any);

      const result = await service.create(createDto, currentUser);

      expect(mockBooksService.getBookById).toHaveBeenCalledWith('abc123');
      expect(mockRepository.create).toHaveBeenCalledWith({
        ...createDto,
        userId: currentUser.sub,
      });
      // ensure userId forced, not 999
      expect(mockRepository.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 1 }));
      expect(mockRepository.save).toHaveBeenCalledWith(created);
      expect(result).toEqual({ id: 1, ...created });
    });

    it('should ignore userId from dto and use currentUser.sub', async () => {
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);
      mockRepository.create.mockReturnValue({} as any);
      mockRepository.save.mockResolvedValue({} as any);

      await service.create({ ...createDto, userId: 555 }, { sub: 10, isAdmin: false });

      expect(mockRepository.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 10 }));
    });

    it('should propagate error when googleBookId invalid (getBookById throws)', async () => {
      mockBooksService.getBookById.mockRejectedValue(new NotFoundException('not found'));

      await expect(service.create(createDto, currentUser)).rejects.toThrow(NotFoundException);
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should call getBookById with correct googleBookId', async () => {
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);
      mockRepository.create.mockReturnValue({} as any);
      mockRepository.save.mockResolvedValue({} as any);

      await service.create({ ...createDto, googleBookId: 'xyz' }, currentUser);

      expect(mockBooksService.getBookById).toHaveBeenCalledWith('xyz');
    });
  });

  describe('findAll', () => {
    it('should return all ratings with book enrichment when no filter', async () => {
      const ratings = [mockRating, { ...mockRating, id: 2, googleBookId: 'def456' }];
      mockRepository.findAndCount.mockResolvedValue([ratings, 2] as any);
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);

      const result = await service.findAll();

      expect(mockRepository.findAndCount).toHaveBeenCalledWith({ where: {}, relations: ['user'], order: { id: 'DESC' }, skip: 0, take: 10 });
      expect(mockBooksService.getBookById).toHaveBeenCalledTimes(2);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual(expect.objectContaining({ ...mockRating, book: mockBookDto }));
      expect(result.meta).toEqual({ total: 2, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: false });
    });

    it('should filter by googleBookId when provided', async () => {
      mockRepository.findAndCount.mockResolvedValue([[mockRating], 1] as any);
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);

      const result = await service.findAll('abc123');

      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        where: { googleBookId: 'abc123' },
        relations: ['user'],
        order: { id: 'DESC' },
        skip: 0,
        take: 10,
      });
      expect(result.data).toHaveLength(1);
    });

    it('should return ratings with book null when googleBooks fails', async () => {
      mockRepository.findAndCount.mockResolvedValue([[mockRating], 1] as any);
      mockBooksService.getBookById.mockRejectedValue(new Error('failed'));

      const result = await service.findAll();

      expect(result.data[0]).toEqual(expect.objectContaining({ ...mockRating, book: null }));
    });

    it('should handle mix of success and failure in enrichment', async () => {
      const ratings = [
        { ...mockRating, id: 1, googleBookId: 'good' },
        { ...mockRating, id: 2, googleBookId: 'bad' },
      ];
      mockRepository.findAndCount.mockResolvedValue([ratings, 2] as any);
      mockBooksService.getBookById
        .mockResolvedValueOnce(mockBook as any)
        .mockRejectedValueOnce(new Error('not found'));

      const result = await service.findAll();

      expect(result.data[0].book).toEqual(mockBookDto);
      expect(result.data[1].book).toBeNull();
    });

    it('should return empty array when no ratings', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0] as any);

      const result = await service.findAll();

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(mockBooksService.getBookById).not.toHaveBeenCalled();
    });

    it('should not call getBookById when no ratings', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0] as any);

      await service.findAll('filter');

      expect(mockBooksService.getBookById).not.toHaveBeenCalled();
    });

    it('should handle pagination with page and limit', async () => {
      mockRepository.findAndCount.mockResolvedValue([[mockRating], 15] as any);
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);

      const result = await service.findAll({ page: 2, limit: 5 } as any);

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 5, take: 5 }));
      expect(result.meta).toEqual({ total: 15, page: 2, limit: 5, totalPages: 3, hasNextPage: true, hasPrevPage: true });
    });
  });

  describe('findOne', () => {
    it('should return rating with book when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockRating as any);
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);

      const result = await service.findOne(1);

      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 }, relations: ['user'] });
      expect(mockBooksService.getBookById).toHaveBeenCalledWith('abc123');
      expect(result).toEqual(expect.objectContaining({ ...mockRating, book: mockBookDto }));
    });

    it('should return rating with book null when book fetch fails', async () => {
      mockRepository.findOne.mockResolvedValue(mockRating as any);
      mockBooksService.getBookById.mockRejectedValue(new Error('not found'));

      const result = await service.findOne(1);

      expect(result).toEqual(expect.objectContaining({ ...mockRating, book: null }));
    });

    it('should throw NotFoundException when rating not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(999)).rejects.toThrow('Rating #999 not found');
      expect(mockBooksService.getBookById).not.toHaveBeenCalled();
    });

    it('should include correct message in NotFoundException', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      try {
        await service.findOne(42);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(NotFoundException);
        expect((e as NotFoundException).message).toContain('Rating #42 not found');
      }
    });
  });

  describe('update', () => {
    const updateDto: any = { score: 4, comment: 'Updated' };

    it('should update rating when owner', async () => {
      const existing = { ...mockRating, userId: currentUser.sub };
      mockRepository.findOne.mockResolvedValue(existing as any);
      mockRepository.save.mockResolvedValue({ ...existing, ...updateDto } as any);

      const result = await service.update(1, updateDto, currentUser);

      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(mockRepository.save).toHaveBeenCalledWith(expect.objectContaining(updateDto));
      expect(result).toEqual(expect.objectContaining(updateDto));
    });

    it('should allow admin to update any rating', async () => {
      const existing = { ...mockRating, userId: otherUser.sub };
      mockRepository.findOne.mockResolvedValue(existing as any);
      mockRepository.save.mockResolvedValue({ ...existing, ...updateDto } as any);

      const result = await service.update(1, updateDto, adminUser);

      expect(result).toEqual(expect.objectContaining(updateDto));
    });

    it('should throw ForbiddenException when non-owner non-admin tries to update', async () => {
      const existing = { ...mockRating, userId: otherUser.sub };
      mockRepository.findOne.mockResolvedValue(existing as any);

      await expect(service.update(1, updateDto, currentUser)).rejects.toThrow(ForbiddenException);
      await expect(service.update(1, updateDto, currentUser)).rejects.toThrow(
        'You can only modify your own ratings',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when rating not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.update(999, updateDto, currentUser)).rejects.toThrow(NotFoundException);
      await expect(service.update(999, updateDto, currentUser)).rejects.toThrow('Rating #999 not found');
    });

    it('should validate new googleBookId when provided', async () => {
      const existing = { ...mockRating, userId: currentUser.sub };
      mockRepository.findOne.mockResolvedValue(existing as any);
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);
      mockRepository.save.mockResolvedValue({ ...existing, googleBookId: 'newId' } as any);

      await service.update(1, { googleBookId: 'newId' }, currentUser);

      expect(mockBooksService.getBookById).toHaveBeenCalledWith('newId');
    });

    it('should not call getBookById when googleBookId not in updateDto', async () => {
      const existing = { ...mockRating, userId: currentUser.sub };
      mockRepository.findOne.mockResolvedValue(existing as any);
      mockRepository.save.mockResolvedValue(existing as any);

      await service.update(1, { score: 3 }, currentUser);

      expect(mockBooksService.getBookById).not.toHaveBeenCalled();
    });

    it('should throw when new googleBookId invalid', async () => {
      const existing = { ...mockRating, userId: currentUser.sub };
      mockRepository.findOne.mockResolvedValue(existing as any);
      mockBooksService.getBookById.mockRejectedValue(new NotFoundException('book not found'));

      await expect(service.update(1, { googleBookId: 'invalid' }, currentUser)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should check ownership before validating googleBookId? Actually code checks ownership then validates', async () => {
      const existing = { ...mockRating, userId: otherUser.sub };
      mockRepository.findOne.mockResolvedValue(existing as any);

      await expect(service.update(1, { googleBookId: 'newId' }, currentUser)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockBooksService.getBookById).not.toHaveBeenCalled();
    });

    it('should Object.assign correctly', async () => {
      const existing = { ...mockRating, userId: currentUser.sub, score: 5 };
      mockRepository.findOne.mockResolvedValue(existing as any);
      const savedCaptor: any = {};
      mockRepository.save.mockImplementation(async (entity) => entity as any);

      const result = await service.update(1, { score: 2, comment: 'new' }, currentUser);

      expect(result.score).toBe(2);
      expect(result.comment).toBe('new');
    });
  });

  describe('remove', () => {
    it('should remove rating when owner', async () => {
      const existing = { ...mockRating, userId: currentUser.sub };
      mockRepository.findOne.mockResolvedValue(existing as any);
      mockRepository.remove.mockResolvedValue(existing as any);

      const result = await service.remove(1, currentUser);

      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(mockRepository.remove).toHaveBeenCalledWith(existing);
      expect(result).toEqual(existing);
    });

    it('should allow admin to remove any rating', async () => {
      const existing = { ...mockRating, userId: otherUser.sub };
      mockRepository.findOne.mockResolvedValue(existing as any);
      mockRepository.remove.mockResolvedValue(existing as any);

      const result = await service.remove(1, adminUser);

      expect(result).toEqual(existing);
    });

    it('should throw ForbiddenException when non-owner non-admin tries to remove', async () => {
      const existing = { ...mockRating, userId: otherUser.sub };
      mockRepository.findOne.mockResolvedValue(existing as any);

      await expect(service.remove(1, currentUser)).rejects.toThrow(ForbiddenException);
      expect(mockRepository.remove).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when rating not found for remove', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999, currentUser)).rejects.toThrow(NotFoundException);
      await expect(service.remove(999, currentUser)).rejects.toThrow('Rating #999 not found');
    });

    it('should not remove when not owner even if admin check fails', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockRating, userId: 999 } as any);

      await expect(service.remove(1, { sub: 1, isAdmin: false })).rejects.toThrow(ForbiddenException);
      expect(mockRepository.remove).not.toHaveBeenCalled();
    });
  });

  describe('checkOwnershipOrAdmin', () => {
    // Indirectly tested via update/remove, but test direct behavior through those methods

    it('should not throw when isAdmin true even if different userId', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockRating, userId: 999 } as any);
      mockRepository.save.mockResolvedValue(mockRating as any);

      await expect(service.update(1, { score: 1 }, { sub: 1, isAdmin: true })).resolves.toBeDefined();
    });

    it('should not throw when userId matches sub', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockRating, userId: 5 } as any);
      mockRepository.save.mockResolvedValue(mockRating as any);

      await expect(service.update(1, { score: 1 }, { sub: 5, isAdmin: false })).resolves.toBeDefined();
    });

    it('should throw when userId does not match and not admin', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockRating, userId: 5 } as any);

      await expect(service.update(1, { score: 1 }, { sub: 6, isAdmin: false })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('agnostic bookId alias', () => {
    it('should create with bookId alias', async () => {
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);
      mockRepository.create.mockReturnValue({} as any);
      mockRepository.save.mockResolvedValue({} as any);
      await service.create({ score: 5, comment: 'x', status: Status.FINISHED, bookId: 'b-alias' } as any, currentUser);
      expect(mockBooksService.getBookById).toHaveBeenCalledWith('b-alias');
      expect(mockRepository.create).toHaveBeenCalledWith(expect.objectContaining({ googleBookId: 'b-alias' }));
    });

    it('should throw when neither bookId nor googleBookId provided', async () => {
      await expect(service.create({ score: 5, comment: 'x', status: Status.FINISHED } as any, currentUser)).rejects.toThrow(NotFoundException);
      await expect(service.create({ score: 5, comment: 'x', status: Status.FINISHED } as any, currentUser)).rejects.toThrow('Livro não informado');
      expect(mockBooksService.getBookById).not.toHaveBeenCalled();
    });

    it('should prioritize bookId over googleBookId', async () => {
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);
      mockRepository.create.mockReturnValue({} as any);
      mockRepository.save.mockResolvedValue({} as any);
      await service.create({ score: 5, comment: 'x', status: Status.FINISHED, bookId: 'b1', googleBookId: 'g1' } as any, currentUser);
      expect(mockBooksService.getBookById).toHaveBeenCalledWith('b1');
    });

    it('should filter by bookId alias in findAll', async () => {
      mockRepository.findAndCount.mockResolvedValue([[mockRating], 1] as any);
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);
      await service.findAll({ bookId: 'b123' } as any);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ where: { googleBookId: 'b123' } }));
    });

    it('should filter by effectiveBookId alias in findAll', async () => {
      mockRepository.findAndCount.mockResolvedValue([[mockRating], 1] as any);
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);
      await service.findAll({ effectiveBookId: 'eff123' } as any);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ where: { googleBookId: 'eff123' } }));
    });

    it('should handle findAllLegacy', async () => {
      mockRepository.findAndCount.mockResolvedValue([[mockRating], 1] as any);
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);
      const result = await service.findAllLegacy('legacy123');
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ where: { googleBookId: 'legacy123' } }));
      expect(result.data).toHaveLength(1);
    });

    it('should handle findAllLegacy with undefined', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0] as any);
      const result = await service.findAllLegacy(undefined);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
      expect(result.data).toEqual([]);
    });

    it('should update with bookId alias', async () => {
      const existing = { ...mockRating, userId: currentUser.sub };
      mockRepository.findOne.mockResolvedValue(existing as any);
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);
      mockRepository.save.mockResolvedValue(existing as any);
      await service.update(1, { bookId: 'newB' } as any, currentUser);
      expect(mockBooksService.getBookById).toHaveBeenCalledWith('newB');
    });

    it('should handle enrichment when book returns plain DTO without toResponseDto', async () => {
      const plainDto = { ...mockBookDto };
      mockRepository.findAndCount.mockResolvedValue([[mockRating], 1] as any);
      mockBooksService.getBookById.mockResolvedValue(plainDto as any);
      const result = await service.findAll();
      expect(result.data[0].book).toEqual(plainDto);
    });
  });
});
