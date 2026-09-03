import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersPaginationDto } from './dto/users-pagination.dto';
import { buildSuccessPaginatedResponse } from 'src/common/dto/paginated-response.dto';
import { PAGINATION_CONSTANTS } from 'src/common/constants/pagination.constants';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly userRepository: Repository<User>) { }

  async create(createUserDto: CreateUserDto) {
    const userEmail = await this.userRepository.findOne({ where: { email: createUserDto.email } });
    const userName = await this.userRepository.findOne({ where: { name: createUserDto.name } });

    if (userEmail || userName) {
      throw new BadRequestException({ success: false, message: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(createUserDto.password, 10);

    const user = this.userRepository.create({
      ...createUserDto,
      password: passwordHash
    });
    return await this.userRepository.save(user);
  }

  async findAll(paginationDto?: UsersPaginationDto) {
    const page = paginationDto?.page ?? PAGINATION_CONSTANTS.DEFAULT_PAGE;
    const limit = paginationDto?.limit ?? PAGINATION_CONSTANTS.USERS.DEFAULT_LIMIT;

    const [data, total] = await this.userRepository.findAndCount({
      order: { id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return buildSuccessPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException({ success: false, message: 'User not found' });
    }
    return { success: true, data: user };
  }

  async findByEmail(email: string) {
    return await this.userRepository.findOne({ where: { email } });
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException({ success: false, message: 'User not found' });
    }
    return { success: true, data: await this.userRepository.update(id, updateUserDto) };
  }

  async remove(id: number) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException({ success: false, message: 'User not found' });
    }
    return { success: true, data: await this.userRepository.remove(user) };
  }
}
