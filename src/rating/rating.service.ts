import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRatingDto } from './dto/create-rating.dto';
import { UpdateRatingDto } from './dto/update-rating.dto';
import { Rating } from './entities/rating.entity';
import { BooksService } from '../books/application/books.service';
import { RatingPaginationDto } from './dto/rating-pagination.dto';
import { buildPaginatedResponse } from 'src/common/dto/paginated-response.dto';
import { PAGINATION_CONSTANTS } from 'src/common/constants/pagination.constants';

@Injectable()
export class RatingService {
  constructor(
    @InjectRepository(Rating)
    private readonly ratingRepository: Repository<Rating>,
    private readonly booksService: BooksService,
  ) {}

  private resolveBookId(dto: any): string | undefined {
    return dto?.bookId ?? dto?.googleBookId ?? dto?.effectiveBookId;
  }

  async create(createRatingDto: CreateRatingDto, currentUser: any) {
    const bookId = this.resolveBookId(createRatingDto);
    if (!bookId) {
      throw new NotFoundException('Livro não informado');
    }
    // Valida que o livro existe via camada agnóstica (antes Google Books)
    await this.booksService.getBookById(bookId);

    // Force the userId to be the authenticated user's ID e normaliza bookId
    const rating = this.ratingRepository.create({
      ...createRatingDto,
      googleBookId: bookId,
      userId: currentUser.sub,
    } as any);
    return this.ratingRepository.save(rating);
  }

  async findAll(paginationDto?: RatingPaginationDto | string) {
    // Compatibilidade: se receber string (legado), trata como googleBookId
    let dto: RatingPaginationDto;
    if (typeof paginationDto === 'string') {
      dto = { googleBookId: paginationDto } as RatingPaginationDto;
    } else {
      dto = (paginationDto ?? {}) as RatingPaginationDto;
    }
    const page = dto.page ?? PAGINATION_CONSTANTS.DEFAULT_PAGE;
    const limit = dto.limit ?? PAGINATION_CONSTANTS.RATING.DEFAULT_LIMIT;
    const where: any = {};
    const effectiveBookId = this.resolveBookId(dto) ?? (dto as any).effectiveBookId;
    if (effectiveBookId) {
      where.googleBookId = effectiveBookId;
    }

    const [ratings, total] = await this.ratingRepository.findAndCount({
      where,
      relations: ['user'],
      order: { id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Enrich each rating with book data (only page) – agnóstico
    const ratingsWithBooks = await Promise.all(
      ratings.map(async (rating) => {
        try {
          const book = await this.booksService.getBookById(rating.googleBookId);
          return { ...rating, book: (book as any).toResponseDto ? (book as any).toResponseDto() : book };
        } catch {
          return { ...rating, book: null };
        }
      }),
    );

    return buildPaginatedResponse(ratingsWithBooks, total, page, limit);
  }

  // Mantém compatibilidade para chamadas legadas findAll(string)
  async findAllLegacy(googleBookId?: string) {
    return this.findAll({ googleBookId } as RatingPaginationDto);
  }

  async findOne(id: number) {
    const rating = await this.ratingRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!rating) {
      throw new NotFoundException(`Rating #${id} not found`);
    }

    try {
      const book = await this.booksService.getBookById(rating.googleBookId);
      return { ...rating, book: (book as any).toResponseDto ? (book as any).toResponseDto() : book };
    } catch {
      return { ...rating, book: null };
    }
  }

  async update(id: number, updateRatingDto: UpdateRatingDto, currentUser: any) {
    const rating = await this.ratingRepository.findOne({ where: { id } });

    if (!rating) {
      throw new NotFoundException(`Rating #${id} not found`);
    }

    this.checkOwnershipOrAdmin(rating, currentUser);

    const newBookId = this.resolveBookId(updateRatingDto);
    if (newBookId) {
      await this.booksService.getBookById(newBookId);
      // normaliza para coluna googleBookId (agnóstica)
      (updateRatingDto as any).googleBookId = newBookId;
    }

    Object.assign(rating, updateRatingDto);
    return this.ratingRepository.save(rating);
  }

  async remove(id: number, currentUser: any) {
    const rating = await this.ratingRepository.findOne({ where: { id } });

    if (!rating) {
      throw new NotFoundException(`Rating #${id} not found`);
    }

    this.checkOwnershipOrAdmin(rating, currentUser);

    return this.ratingRepository.remove(rating);
  }

  private checkOwnershipOrAdmin(rating: Rating, currentUser: any) {
    if (currentUser.isAdmin) {
      return;
    }
    if (rating.userId !== currentUser.sub) {
      throw new ForbiddenException('You can only modify your own ratings');
    }
  }
}
