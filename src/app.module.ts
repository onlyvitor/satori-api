import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import dotenv from 'dotenv';
import { User } from './users/entities/user.entity';
import { AuthModule } from './auth/auth.module';
import { RatingModule } from './rating/rating.module';
import { BooksModule } from './books/books.module';
import { Rating } from './rating/entities/rating.entity';

dotenv.config();

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [User, Rating],
      synchronize: true,
    }),
    AuthModule,
    RatingModule,
    BooksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ClassSerializerInterceptor,
    },
  ],
})
export class AppModule {}
