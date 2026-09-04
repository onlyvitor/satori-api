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

  const safeUser = {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
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

  const mockQueryBuilder: any = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockRepository: any = {
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockQueryBuilder.addSelect.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();

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
    it('should create a user successfully when email and name are not taken and exclude password', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce(null); // name check
      bcryptHashMock.mockResolvedValue('hashedPassword123');
      const createdUser = {
        ...mockCreateUserDto,
        password: 'hashedPassword123',
      } as User;
      mockRepository.create.mockReturnValue(createdUser);
      mockRepository.save.mockResolvedValue({ ...createdUser, id: 1 });

      const result: any = await service.create(mockCreateUserDto);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { email: mockCreateUserDto.email },
      });
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { name: mockCreateUserDto.name },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(mockCreateUserDto.password, 10);
      expect(mockRepository.create).toHaveBeenCalledWith({
        ...mockCreateUserDto,
        password: 'hashedPassword123',
      });
      expect(mockRepository.save).toHaveBeenCalledWith(createdUser);
      expect(result).not.toHaveProperty('password');
      expect(result).toEqual(
        expect.objectContaining({
          id: 1,
          name: mockCreateUserDto.name,
          email: mockCreateUserDto.email,
        }),
      );
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

      await expect(service.create(mockCreateUserDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(bcryptHashMock).not.toHaveBeenCalled();

      // segunda chamada para validar mensagem
      mockRepository.findOne
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(null);
      await expect(service.create(mockCreateUserDto)).rejects.toThrow(
        'User already exists',
      );
    });

    it('should throw BadRequestException when name already exists', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(null) // email not exists
        .mockResolvedValueOnce(mockUser); // name exists

      await expect(service.create(mockCreateUserDto)).rejects.toThrow(
        BadRequestException,
      );

      mockRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockUser);
      await expect(service.create(mockCreateUserDto)).rejects.toThrow(
        'User already exists',
      );
    });

    it('should throw BadRequestException when both email and name already exist', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(mockUser);

      await expect(service.create(mockCreateUserDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should include success:false in exception payload', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      try {
        await service.create(mockCreateUserDto);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        const response = (error as BadRequestException).getResponse() as any;
        expect(response).toEqual({
          success: false,
          message: 'User already exists',
        });
      }
    });
  });

  describe('findAll', () => {
    it('should return object with success true and data users without password', async () => {
      const users = [
        mockUser,
        { ...mockUser, id: 2, email: 'jane@example.com' },
      ];
      mockRepository.findAndCount.mockResolvedValue([users, 2]);

      const result: any = await service.findAll();

      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        order: { id: 'DESC' },
        skip: 0,
        take: 10,
      });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).not.toHaveProperty('password');
      expect(result.data[0]).toEqual(
        expect.objectContaining({ id: 1, email: 'john@example.com' }),
      );
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });

    it('should return empty array when no users exist', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAll();

      expect(result).toEqual({
        success: true,
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
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
      expect(result.meta).toEqual({
        total: 15,
        page: 2,
        limit: 5,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true,
      });
    });

    it('should respect max limit for users (20)', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);
      const result = await service.findAll({ page: 1, limit: 20 } as any);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 }),
      );
      expect(result.meta.limit).toBe(20);
    });
  });

  describe('findOne', () => {
    it('should return user when found without password', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result: any = await service.findOne(1);

      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty('password');
      expect(result.data).toEqual(
        expect.objectContaining({ id: 1, email: mockUser.email }),
      );
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
    it('should return user when found by email via queryBuilder with password', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail('john@example.com');

      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith('user.password');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'user.email = :email',
        { email: 'john@example.com' },
      );
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found by email', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      const result = await service.findByEmail('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update user when found and hash password if present', async () => {
      mockRepository.findOne.mockReset();
      mockRepository.findOne
        .mockResolvedValueOnce(mockUser) // fetch user
        .mockResolvedValueOnce(null) // check name duplicate: name='Jane Doe' -> null
        .mockResolvedValueOnce(null); // extra safety
      bcryptHashMock.mockResolvedValue('hashedNew');
      mockRepository.save.mockResolvedValue({
        ...mockUser,
        name: 'Jane Doe',
        password: 'hashedNew',
      } as any);

      const updateDtoWithPassword: any = {
        name: 'Jane Doe',
        password: 'newpass',
      };
      const result: any = await service.update(1, updateDtoWithPassword);

      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(bcrypt.hash).toHaveBeenCalledWith('newpass', 10);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Jane Doe' }),
      );
      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty('password');
    });

    it('should update simple field without password', async () => {
      mockRepository.findOne.mockReset();
      mockRepository.findOne
        .mockResolvedValueOnce(mockUser) // fetch user
        .mockResolvedValueOnce(null); // duplicate name check
      mockRepository.save.mockResolvedValue({
        ...mockUser,
        name: 'Jane Doe',
      } as any);

      const result: any = await service.update(1, mockUpdateUserDto);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Jane Doe' }),
      );
      expect(result.data).not.toHaveProperty('password');
    });

    it('should throw NotFoundException when user not found for update', async () => {
      mockRepository.findOne.mockReset();
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.update(999, mockUpdateUserDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should propagate success:false message on update not found', async () => {
      mockRepository.findOne.mockReset();
      mockRepository.findOne.mockResolvedValue(null);

      try {
        await service.update(1, mockUpdateUserDto);
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        const response = (error as NotFoundException).getResponse() as any;
        expect(response).toEqual({ success: false, message: 'User not found' });
      }
    });

    it('should throw BadRequest when email already exists on update', async () => {
      mockRepository.findOne.mockReset();
      const otherUser = { ...mockUser, id: 2, email: 'taken@example.com' };
      mockRepository.findOne
        .mockResolvedValueOnce(mockUser) // fetch to update
        .mockResolvedValueOnce(otherUser); // email exists

      await expect(
        service.update(1, { email: 'taken@example.com' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequest when name already exists on update', async () => {
      mockRepository.findOne.mockReset();
      const otherUser = { ...mockUser, id: 2, name: 'takenName' };
      mockRepository.findOne
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(otherUser);

      await expect(
        service.update(1, { name: 'takenName' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should remove user when found without password', async () => {
      const freshUser = { ...mockUser };
      mockRepository.findOne.mockReset();
      mockRepository.findOne.mockResolvedValue(freshUser);
      mockRepository.remove.mockResolvedValue(freshUser);

      const result: any = await service.remove(1);

      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(mockRepository.remove).toHaveBeenCalledWith(freshUser);
      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty('password');
    });

    it('should throw NotFoundException when user not found for remove', async () => {
      mockRepository.findOne.mockReset();
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(mockRepository.remove).not.toHaveBeenCalled();
    });

    it('should propagate success:false message on remove not found', async () => {
      mockRepository.findOne.mockReset();
      mockRepository.findOne.mockResolvedValue(null);

      try {
        await service.remove(1);
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        const response = (error as NotFoundException).getResponse() as any;
        expect(response).toEqual({ success: false, message: 'User not found' });
      }
    });
  });
});
