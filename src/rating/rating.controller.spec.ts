import { Test, TestingModule } from '@nestjs/testing';
import { RatingController } from './rating.controller';
import { RatingService } from './rating.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { UpdateRatingDto } from './dto/update-rating.dto';
import { Status } from './status.enum';

describe('RatingController', () => {
  let controller: RatingController;
  let service: jest.Mocked<RatingService>;

  const mockBook = {
    id: 'abc123',
    title: 'Test Book',
    authors: ['Author'],
    description: 'Desc',
    thumbnail: 'thumb',
    publishedDate: '2020',
    pageCount: 200,
  };

  const mockRating = {
    id: 1,
    score: 5,
    comment: 'Great book!',
    status: Status.FINISHED,
    userId: 1,
    googleBookId: 'abc123',
    user: { id: 1, name: 'John' },
    book: mockBook,
  };

  const mockRatingService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const currentUser = { sub: 1, email: 'john@example.com', isAdmin: false };

  const createDto: CreateRatingDto = {
    score: 5,
    comment: 'Great!',
    status: Status.FINISHED,
    googleBookId: 'abc123',
    userId: 1,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RatingController],
      providers: [{ provide: RatingService, useValue: mockRatingService }],
    }).compile();

    controller = module.get<RatingController>(RatingController);
    service = module.get(RatingService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call ratingService.create with dto and req.user', async () => {
      mockRatingService.create.mockResolvedValue(mockRating as any);
      const req = { user: currentUser } as any;

      const result = await controller.create(createDto, req);

      expect(service.create).toHaveBeenCalledWith(createDto, currentUser);
      expect(service.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockRating);
    });

    it('should pass exact user object from request', async () => {
      mockRatingService.create.mockResolvedValue(mockRating as any);
      const adminUser = { sub: 99, isAdmin: true };
      const req = { user: adminUser } as any;

      await controller.create(createDto, req);

      expect(service.create).toHaveBeenCalledWith(createDto, adminUser);
    });

    it('should propagate errors from service', async () => {
      const error = new Error('book not found');
      mockRatingService.create.mockRejectedValue(error);
      const req = { user: currentUser } as any;

      await expect(controller.create(createDto, req)).rejects.toThrow(error);
    });

    it('should handle dto with different status', async () => {
      const dtoWithReading: CreateRatingDto = { ...createDto, status: Status.READING };
      mockRatingService.create.mockResolvedValue({ ...mockRating, status: Status.READING } as any);
      const req = { user: currentUser } as any;

      const result = await controller.create(dtoWithReading, req);

      expect(service.create).toHaveBeenCalledWith(dtoWithReading, currentUser);
      expect(result.status).toBe(Status.READING);
    });
  });

  describe('findAll', () => {
    it('should call ratingService.findAll without param when none provided', async () => {
      const paginated = { data: [mockRating], meta: { total: 1, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: false } };
      mockRatingService.findAll.mockResolvedValue(paginated as any);

      const result = await controller.findAll({} as any);

      expect(service.findAll).toHaveBeenCalledWith({} as any);
      expect(service.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual(paginated);
    });

    it('should call ratingService.findAll with googleBookId filter', async () => {
      const paginated = { data: [mockRating], meta: { total: 1, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: false } };
      mockRatingService.findAll.mockResolvedValue(paginated as any);

      const result = await controller.findAll({ googleBookId: 'abc123' } as any);

      expect(service.findAll).toHaveBeenCalledWith({ googleBookId: 'abc123' });
      expect(result).toEqual(paginated);
    });

    it('should return empty when service returns empty paginated', async () => {
      const paginated = { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: false } };
      mockRatingService.findAll.mockResolvedValue(paginated as any);

      const result = await controller.findAll({} as any);

      expect(result).toEqual(paginated);
    });

    it('should propagate errors from service', async () => {
      const error = new Error('DB error');
      mockRatingService.findAll.mockRejectedValue(error);

      await expect(controller.findAll({} as any)).rejects.toThrow(error);
    });

    it('should handle different googleBookId values', async () => {
      mockRatingService.findAll.mockResolvedValue({ data: [], meta: {} } as any);

      await controller.findAll({ googleBookId: 'xyz789' } as any);
      expect(service.findAll).toHaveBeenCalledWith({ googleBookId: 'xyz789' });

      await controller.findAll({ googleBookId: 'other' } as any);
      expect(service.findAll).toHaveBeenLastCalledWith({ googleBookId: 'other' });
    });

    it('should handle pagination params', async () => {
      const paginated = { data: [mockRating], meta: { total: 15, page: 2, limit: 5, totalPages: 3, hasNextPage: true, hasPrevPage: true } };
      mockRatingService.findAll.mockResolvedValue(paginated as any);

      const result = await controller.findAll({ page: 2, limit: 5 } as any);

      expect(service.findAll).toHaveBeenCalledWith({ page: 2, limit: 5 });
      expect(result).toEqual(paginated);
    });
  });

  describe('findOne', () => {
    it('should call ratingService.findOne with numeric id', async () => {
      mockRatingService.findOne.mockResolvedValue(mockRating as any);

      const result = await controller.findOne('1');

      expect(service.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockRating);
    });

    it('should convert string id to number', async () => {
      mockRatingService.findOne.mockResolvedValue(mockRating as any);

      await controller.findOne('42');

      expect(service.findOne).toHaveBeenCalledWith(42);
      expect(service.findOne).not.toHaveBeenCalledWith('42' as any);
    });

    it('should handle large id conversion', async () => {
      mockRatingService.findOne.mockResolvedValue(mockRating as any);

      await controller.findOne('9999');

      expect(service.findOne).toHaveBeenCalledWith(9999);
    });

    it('should propagate NotFoundException from service', async () => {
      const error = new Error('Rating #999 not found');
      mockRatingService.findOne.mockRejectedValue(error);

      await expect(controller.findOne('999')).rejects.toThrow(error);
    });
  });

  describe('update', () => {
    const updateDto: UpdateRatingDto = { score: 4, comment: 'Updated' };

    it('should call ratingService.update with numeric id, dto and req.user', async () => {
      const updated = { ...mockRating, ...updateDto };
      mockRatingService.update.mockResolvedValue(updated as any);
      const req = { user: currentUser } as any;

      const result = await controller.update('1', updateDto, req);

      expect(service.update).toHaveBeenCalledWith(1, updateDto, currentUser);
      expect(result).toEqual(updated);
    });

    it('should convert string id to number for update', async () => {
      mockRatingService.update.mockResolvedValue(mockRating as any);
      const req = { user: currentUser } as any;

      await controller.update('10', updateDto, req);

      expect(service.update).toHaveBeenCalledWith(10, updateDto, currentUser);
    });

    it('should propagate ForbiddenException from service', async () => {
      const error = new Error('You can only modify your own ratings');
      mockRatingService.update.mockRejectedValue(error);
      const req = { user: currentUser } as any;

      await expect(controller.update('1', updateDto, req)).rejects.toThrow(error);
    });

    it('should handle googleBookId update', async () => {
      const dtoWithBook: UpdateRatingDto = { googleBookId: 'newId' };
      mockRatingService.update.mockResolvedValue({ ...mockRating, googleBookId: 'newId' } as any);
      const req = { user: currentUser } as any;

      await controller.update('1', dtoWithBook, req);

      expect(service.update).toHaveBeenCalledWith(1, dtoWithBook, currentUser);
    });

    it('should handle empty update dto', async () => {
      const emptyDto = {};
      mockRatingService.update.mockResolvedValue(mockRating as any);
      const req = { user: currentUser } as any;

      await controller.update('1', emptyDto, req);

      expect(service.update).toHaveBeenCalledWith(1, emptyDto, currentUser);
    });
  });

  describe('remove', () => {
    it('should call ratingService.remove with numeric id and req.user', async () => {
      mockRatingService.remove.mockResolvedValue(mockRating as any);
      const req = { user: currentUser } as any;

      const result = await controller.remove('1', req);

      expect(service.remove).toHaveBeenCalledWith(1, currentUser);
      expect(service.remove).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockRating);
    });

    it('should convert string id to number for remove', async () => {
      mockRatingService.remove.mockResolvedValue(mockRating as any);
      const req = { user: currentUser } as any;

      await controller.remove('5', req);

      expect(service.remove).toHaveBeenCalledWith(5, currentUser);
    });

    it('should propagate NotFoundException from service on remove', async () => {
      const error = new Error('Rating #999 not found');
      mockRatingService.remove.mockRejectedValue(error);
      const req = { user: currentUser } as any;

      await expect(controller.remove('999', req)).rejects.toThrow(error);
    });

    it('should propagate ForbiddenException from service on remove', async () => {
      const error = new Error('You can only modify your own ratings');
      mockRatingService.remove.mockRejectedValue(error);
      const req = { user: currentUser } as any;

      await expect(controller.remove('1', req)).rejects.toThrow(error);
    });

    it('should handle admin user removal', async () => {
      const adminUser = { sub: 99, isAdmin: true };
      mockRatingService.remove.mockResolvedValue(mockRating as any);
      const req = { user: adminUser } as any;

      await controller.remove('1', req);

      expect(service.remove).toHaveBeenCalledWith(1, adminUser);
    });
  });
});
