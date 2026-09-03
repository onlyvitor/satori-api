import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRatingDto } from './dto/create-rating.dto';
import { UpdateRatingDto } from './dto/update-rating.dto';
import { Rating } from './entities/rating.entity';
import { GoogleBooksService } from '../books/google-books.service';
import { RatingPaginationDto } from './dto/rating-pagination.dto';
import { buildPaginatedResponse } from 'src/common/dto/paginated-response.dto';
import { PAGINATION_CONSTANTS } from 'src/common/constants/pagination.constants';

@Injectable()
export class RatingService {
  constructor(
    @InjectRepository(Rating)
    private readonly ratingRepository: Repository<Rating>,
    private readonly googleBooksService: GoogleBooksService,
  ) {}

  async create(createRatingDto: CreateRatingDto, currentUser: any) {
    // Validate that the book exists on Google Books
    await this.googleBooksService.getBookById(createRatingDto.googleBookId);

    // Force the userId to be the authenticated user's ID
    const rating = this.ratingRepository.create({
      ...createRatingDto,
      userId: currentUser.sub,
    });
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
    if (dto.googleBookId) {
      where.googleBookId = dto.googleBookId;
    }

    const [ratings, total] = await this.ratingRepository.findAndCount({
      where,
      relations: ['user'],
      order: { id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Enrich each rating with book data (only page)
    const ratingsWithBooks = await Promise.all(
      ratings.map(async (rating) => {
        try {
          const book = await this.googleBooksService.getBookById(rating.googleBookId);
          return { ...rating, book };
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
      const book = await this.googleBooksService.getBookById(rating.googleBookId);
      return { ...rating, book };
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

    if (updateRatingDto.googleBookId) {
      await this.googleBooksService.getBookById(updateRatingDto.googleBookId);
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
