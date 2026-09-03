import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UsersService } from '../../users.service';
import { User } from '../../entities/user.entity';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: jest.Mocked<Repository<User>>;
  let bcryptHashMock: jest.Mock;

  const mockUser: User = {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    password: 'hashedPassword123',
    isAdmin: false,
    ratings: [],
  };

  const mockCreateUserDto = {
    name: 'John Doe',
    email: 'john@example.com',
    password: 'plainPassword123',
  };

  const mockUpdateUserDto = {
    name: 'Jane Doe',
  };

  const mockRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepository = module.get(getRepositoryToken(User));
    bcryptHashMock = bcrypt.hash as unknown as jest.Mock;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a user successfully when email and name are not taken', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce(null); // name check
      bcryptHashMock.mockResolvedValue('hashedPassword123');
      const createdUser = { ...mockCreateUserDto, password: 'hashedPassword123' } as User;
      mockRepository.create.mockReturnValue(createdUser);
      mockRepository.save.mockResolvedValue({ ...createdUser, id: 1 });

      const result = await service.create(mockCreateUserDto);

      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { email: mockCreateUserDto.email } });
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { name: mockCreateUserDto.name } });
      expect(bcrypt.hash).toHaveBeenCalledWith(mockCreateUserDto.password, 10);
      expect(mockRepository.create).toHaveBeenCalledWith({
        ...mockCreateUserDto,
        password: 'hashedPassword123',
      });
      expect(mockRepository.save).toHaveBeenCalledWith(createdUser);
      expect(result).toEqual({ ...createdUser, id: 1 });
    });

    it('should hash password with 10 salt rounds', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      bcryptHashMock.mockResolvedValue('hashedXYZ');
      mockRepository.create.mockReturnValue({} as User);
      mockRepository.save.mockResolvedValue({} as User);

      await service.create(mockCreateUserDto);

      expect(bcryptHashMock).toHaveBeenCalledWith('plainPassword123', 10);
    });

    it('should throw BadRequestException when email already exists', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(mockUser) // email exists
        .mockResolvedValueOnce(null);

      await expect(service.create(mockCreateUserDto)).rejects.toThrow(BadRequestException);
      expect(bcryptHashMock).not.toHaveBeenCalled();

      // segunda chamada para validar mensagem
      mockRepository.findOne
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(null);
      await expect(service.create(mockCreateUserDto)).rejects.toThrow('User already exists');
    });

    it('should throw BadRequestException when name already exists', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(null) // email not exists
        .mockResolvedValueOnce(mockUser); // name exists

      await expect(service.create(mockCreateUserDto)).rejects.toThrow(BadRequestException);

      mockRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockUser);
      await expect(service.create(mockCreateUserDto)).rejects.toThrow('User already exists');
    });

    it('should throw BadRequestException when both email and name already exist', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(mockUser);

      await expect(service.create(mockCreateUserDto)).rejects.toThrow(BadRequestException);
    });

    it('should include success:false in exception payload', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      try {
        await service.create(mockCreateUserDto);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        const response = (error as BadRequestException).getResponse() as any;
        expect(response).toEqual({ success: false, message: 'User already exists' });
      }
    });
  });

  describe('findAll', () => {
    it('should return object with success true and data users', async () => {
      const users = [mockUser, { ...mockUser, id: 2, email: 'jane@example.com' }];
      mockRepository.findAndCount.mockResolvedValue([users, 2]);

      const result = await service.findAll();

      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        order: { id: 'DESC' },
        skip: 0,
        take: 10,
      });
      expect(result).toEqual({
        success: true,
        data: users,
        meta: { total: 2, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      });
    });

    it('should return empty array when no users exist', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAll();

      expect(result).toEqual({
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      });
    });

    it('should handle pagination with custom page and limit', async () => {
      const users = [mockUser];
      mockRepository.findAndCount.mockResolvedValue([users, 15]);

      const result = await service.findAll({ page: 2, limit: 5 } as any);

      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        order: { id: 'DESC' },
        skip: 5,
        take: 5,
      });
      expect(result.meta).toEqual({ total: 15, page: 2, limit: 5, totalPages: 3, hasNextPage: true, hasPrevPage: true });
    });

    it('should respect max limit for users (20)', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);
      // service itself doesn't validate max, DTO does – just ensure it passes DTO values
      const result = await service.findAll({ page: 1, limit: 20 } as any);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
      expect(result.meta.limit).toBe(20);
    });
  });

  describe('findOne', () => {
    it('should return user when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne(1);

      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toEqual({ success: true, data: mockUser });
    });

    it('should throw NotFoundException when user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(999)).rejects.toThrow('User not found');
    });

    it('should include success:false in NotFoundException payload', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      try {
        await service.findOne(1);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        const response = (error as NotFoundException).getResponse() as any;
        expect(response).toEqual({ success: false, message: 'User not found' });
      }
    });
  });

  describe('findByEmail', () => {
    it('should return user when found by email', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail('john@example.com');

      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { email: 'john@example.com' } });
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found by email', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findByEmail('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update user when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);
      const updateResult = { affected: 1, raw: {}, generatedMaps: [] } as any;
      mockRepository.update.mockResolvedValue(updateResult);

      const result = await service.update(1, mockUpdateUserDto);

      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(mockRepository.update).toHaveBeenCalledWith(1, mockUpdateUserDto);
      expect(result).toEqual({ success: true, data: updateResult });
    });

    it('should throw NotFoundException when user not found for update', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.update(999, mockUpdateUserDto)).rejects.toThrow(NotFoundException);
      expect(mockRepository.update).not.toHaveBeenCalled();
    });

    it('should propagate success:false message on update not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      try {
        await service.update(1, mockUpdateUserDto);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        const response = (error as NotFoundException).getResponse() as any;
        expect(response).toEqual({ success: false, message: 'User not found' });
      }
    });
  });

  describe('remove', () => {
    it('should remove user when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);
      mockRepository.remove.mockResolvedValue(mockUser);

      const result = await service.remove(1);

      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(mockRepository.remove).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual({ success: true, data: mockUser });
    });

    it('should throw NotFoundException when user not found for remove', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(mockRepository.remove).not.toHaveBeenCalled();
    });

    it('should propagate success:false message on remove not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      try {
        await service.remove(1);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        const response = (error as NotFoundException).getResponse() as any;
        expect(response).toEqual({ success: false, message: 'User not found' });
      }
    });
  });
});
