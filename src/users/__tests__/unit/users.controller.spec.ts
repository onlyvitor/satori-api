import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from '../../users.controller';
import { UsersService } from '../../users.service';
import { CreateUserDto } from '../../dto/create-user.dto';
import { UpdateUserDto } from '../../dto/update-user.dto';

describe('UsersController', () => {
  let controller: UsersController;
  let service: jest.Mocked<UsersService>;

  const mockUser = {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    password: 'hashedPassword123',
    isAdmin: false,
    ratings: [],
  };

  const mockCreateUserDto: CreateUserDto = {
    name: 'John Doe',
    email: 'john@example.com',
    password: 'plainPassword123',
  };

  const mockUpdateUserDto: UpdateUserDto = {
    name: 'Jane Doe',
  };

  const mockUsersService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByEmail: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call usersService.create with dto and return result', async () => {
      const expectedResult = { ...mockUser, id: 1 };
      mockUsersService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(mockCreateUserDto);

      expect(service.create).toHaveBeenCalledWith(mockCreateUserDto);
      expect(service.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedResult);
    });

    it('should propagate errors from service', async () => {
      const error = new Error('User already exists');
      mockUsersService.create.mockRejectedValue(error);

      await expect(controller.create(mockCreateUserDto)).rejects.toThrow(error);
    });
  });

  describe('findAll', () => {
    it('should call usersService.findAll and return result', async () => {
      const expectedResult = { success: true, data: [mockUser], meta: { total: 1, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: false } };
      mockUsersService.findAll.mockResolvedValue(expectedResult as any);

      const paginationDto: any = { page: 1, limit: 10 };
      const result = await controller.findAll(paginationDto);

      expect(service.findAll).toHaveBeenCalledWith(paginationDto);
      expect(service.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedResult);
    });

    it('should return empty data when no users', async () => {
      const expectedResult = { success: true, data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: false } };
      mockUsersService.findAll.mockResolvedValue(expectedResult as any);

      const result = await controller.findAll({} as any);

      expect(result).toEqual(expectedResult);
    });

    it('should pass pagination query to service', async () => {
      const paginationDto: any = { page: 2, limit: 5 };
      mockUsersService.findAll.mockResolvedValue({ success: true, data: [], meta: {} } as any);

      await controller.findAll(paginationDto);

      expect(service.findAll).toHaveBeenCalledWith(paginationDto);
    });
  });

  describe('findOne', () => {
    it('should call usersService.findOne with numeric id', async () => {
      const expectedResult = { success: true, data: mockUser };
      mockUsersService.findOne.mockResolvedValue(expectedResult);

      const result = await controller.findOne('1');

      expect(service.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(expectedResult);
    });

    it('should convert string id to number', async () => {
      mockUsersService.findOne.mockResolvedValue({ success: true, data: mockUser });

      await controller.findOne('42');

      expect(service.findOne).toHaveBeenCalledWith(42);
      // Verifica que não foi chamado com string
      expect(service.findOne).not.toHaveBeenCalledWith('42' as any);
    });

    it('should propagate NotFoundException from service', async () => {
      const error = new Error('User not found');
      mockUsersService.findOne.mockRejectedValue(error);

      await expect(controller.findOne('999')).rejects.toThrow(error);
    });
  });

  describe('update', () => {
    it('should call usersService.update with numeric id and dto', async () => {
      const expectedResult = { success: true, data: { affected: 1 } };
      mockUsersService.update.mockResolvedValue(expectedResult as any);

      const result = await controller.update('1', mockUpdateUserDto);

      expect(service.update).toHaveBeenCalledWith(1, mockUpdateUserDto);
      expect(result).toEqual(expectedResult);
    });

    it('should convert string id to number for update', async () => {
      mockUsersService.update.mockResolvedValue({ success: true, data: {} } as any);

      await controller.update('10', mockUpdateUserDto);

      expect(service.update).toHaveBeenCalledWith(10, mockUpdateUserDto);
    });

    it('should propagate errors from service on update', async () => {
      const error = new Error('User not found');
      mockUsersService.update.mockRejectedValue(error);

      await expect(controller.update('999', mockUpdateUserDto)).rejects.toThrow(error);
    });
  });

  describe('remove', () => {
    it('should call usersService.remove with numeric id', async () => {
      const expectedResult = { success: true, data: mockUser };
      mockUsersService.remove.mockResolvedValue(expectedResult as any);

      const result = await controller.remove('1');

      expect(service.remove).toHaveBeenCalledWith(1);
      expect(service.remove).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedResult);
    });

    it('should convert string id to number for remove', async () => {
      mockUsersService.remove.mockResolvedValue({ success: true, data: mockUser } as any);

      await controller.remove('5');

      expect(service.remove).toHaveBeenCalledWith(5);
    });

    it('should propagate errors from service on remove', async () => {
      const error = new Error('User not found');
      mockUsersService.remove.mockRejectedValue(error);

      await expect(controller.remove('999')).rejects.toThrow(error);
    });
  });
});
