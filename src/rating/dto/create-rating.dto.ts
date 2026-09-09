import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { Status } from '../status.enum';

export class CreateRatingDto {
  @IsInt()
  @Min(1)
  @Max(5)
  score: number;

  @IsString()
  @IsNotEmpty()
  comment: string;

  @IsEnum(Status)
  status: Status;

  @IsString()
  @ValidateIf((o) => !o.bookId)
  @IsNotEmpty()
  googleBookId?: string;

  @IsString()
  @ValidateIf((o) => !o.googleBookId)
  @IsOptional()
  @IsNotEmpty()
  bookId?: string;

  @IsInt()
  @IsOptional()
  userId: number;
}
