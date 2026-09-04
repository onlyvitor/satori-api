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
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  private toSafeUser(user: User): Omit<User, 'password'> {
    if (!user) return user as any;
    // Defesa híbrida: @Exclude + select:false no entity + remoção manual garante cobertura em testes/unit onde instanceToPlain não tem metadata
    const { password, ...safe } = user as any;
    return safe as Omit<User, 'password'>;
  }

  async create(createUserDto: CreateUserDto) {
    const userEmail = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });
    const userName = await this.userRepository.findOne({
      where: { name: createUserDto.name },
    });

    if (userEmail || userName) {
      throw new BadRequestException({
        success: false,
        message: 'User already exists',
      });
    }

    const passwordHash = await bcrypt.hash(createUserDto.password, 10);

    const user = this.userRepository.create({
      ...createUserDto,
      password: passwordHash,
    });
    const saved = await this.userRepository.save(user);
    return this.toSafeUser(saved);
  }

  async findAll(paginationDto?: UsersPaginationDto) {
    const page = paginationDto?.page ?? PAGINATION_CONSTANTS.DEFAULT_PAGE;
    const limit =
      paginationDto?.limit ?? PAGINATION_CONSTANTS.USERS.DEFAULT_LIMIT;

    const [data, total] = await this.userRepository.findAndCount({
      order: { id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const safeData = data.map((u) => this.toSafeUser(u));
    return buildSuccessPaginatedResponse(safeData, total, page, limit);
  }

  async findOne(id: number) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        success: false,
        message: 'User not found',
      });
    }
    return { success: true, data: this.toSafeUser(user) };
  }

  async findByEmail(email: string) {
    // password é select:false, precisa addSelect para auth comparar bcrypt
    return await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findByEmailWithoutPassword(email: string) {
    return await this.userRepository.findOne({ where: { email } });
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        success: false,
        message: 'User not found',
      });
    }

    // Hash password se vier no payload, e previne mass-assignment de isAdmin
    const { isAdmin, ...safeDto } = updateUserDto as any;
    if (safeDto.password) {
      safeDto.password = await bcrypt.hash(safeDto.password, 10);
    }

    // Checa duplicidade se trocar email/name
    if (safeDto.email || safeDto.name) {
      if (safeDto.email) {
        const existsEmail = await this.userRepository.findOne({
          where: { email: safeDto.email },
        });
        if (existsEmail && existsEmail.id !== id) {
          throw new BadRequestException({
            success: false,
            message: 'User already exists',
          });
        }
      }
      if (safeDto.name) {
        const existsName = await this.userRepository.findOne({
          where: { name: safeDto.name },
        });
        if (existsName && existsName.id !== id) {
          throw new BadRequestException({
            success: false,
            message: 'User already exists',
          });
        }
      }
    }

    Object.assign(user, safeDto);
    const saved = await this.userRepository.save(user);
    return { success: true, data: this.toSafeUser(saved) };
  }

  async remove(id: number) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        success: false,
        message: 'User not found',
      });
    }
    const removed = await this.userRepository.remove(user);
    return { success: true, data: this.toSafeUser(removed) };
  }
}
