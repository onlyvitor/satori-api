import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RatingService } from './rating.service';
import { RatingController } from './rating.controller';
import { Rating } from './entities/rating.entity';
import { BooksModule } from '../books/infrastructure/tests/unit/books.module';

@Module({
  imports: [TypeOrmModule.forFeature([Rating]), BooksModule],
  controllers: [RatingController],
  providers: [RatingService],
})
export class RatingModule {}
