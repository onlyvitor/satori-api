import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRatingDto } from './create-rating.dto';
import { Status } from '../status.enum';

describe('CreateRatingDto (agnóstico bookId/googleBookId)', () => {
  const baseValid = {
    score: 5,
    comment: 'Great book',
    status: Status.FINISHED,
    googleBookId: 'abc123',
    userId: 1,
  };

  it('should pass validation with googleBookId', async () => {
    const dto = plainToInstance(CreateRatingDto, baseValid);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass validation with bookId instead of googleBookId', async () => {
    const dto = plainToInstance(CreateRatingDto, {
      score: 5,
      comment: 'Great',
      status: Status.FINISHED,
      bookId: 'b456',
      userId: 1,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass validation when both provided', async () => {
    const dto = plainToInstance(CreateRatingDto, {
      ...baseValid,
      bookId: 'b456',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail validation when neither bookId nor googleBookId provided', async () => {
    const dto = plainToInstance(CreateRatingDto, {
      score: 5,
      comment: 'Great',
      status: Status.FINISHED,
      userId: 1,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'googleBookId')).toBe(true);
  });

  it('should fail when googleBookId is empty string and bookId missing', async () => {
    const dto = plainToInstance(CreateRatingDto, {
      score: 5,
      comment: 'Great',
      status: Status.FINISHED,
      googleBookId: '',
      userId: 1,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'googleBookId')).toBe(true);
  });

  it('should fail when bookId is empty string and googleBookId missing', async () => {
    const dto = plainToInstance(CreateRatingDto, {
      score: 5,
      comment: 'Great',
      status: Status.FINISHED,
      bookId: '',
      userId: 1,
    } as any);
    const errors = await validate(dto);
    // Quando googleBookId ausente, bookId é validado e vazio deve falhar
    expect(errors.some((e) => e.property === 'bookId' || e.property === 'googleBookId')).toBe(true);
  });

  it('should validate score range', async () => {
    const dtoLow = plainToInstance(CreateRatingDto, { ...baseValid, score: 0 });
    const dtoHigh = plainToInstance(CreateRatingDto, { ...baseValid, score: 6 });
    expect((await validate(dtoLow)).some((e) => e.property === 'score')).toBe(true);
    expect((await validate(dtoHigh)).some((e) => e.property === 'score')).toBe(true);
  });

  it('should validate status enum', async () => {
    const dto = plainToInstance(CreateRatingDto, { ...baseValid, status: 'invalid' as any });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('should validate comment not empty', async () => {
    const dto = plainToInstance(CreateRatingDto, { ...baseValid, comment: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'comment')).toBe(true);
  });

  it('should allow userId optional (service forces)', async () => {
    const { userId, ...withoutUserId } = baseValid;
    const dto = plainToInstance(CreateRatingDto, withoutUserId);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should validate userId as int when provided', async () => {
    const dto = plainToInstance(CreateRatingDto, { ...baseValid, userId: 'not-int' as any });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'userId')).toBe(true);
  });
});
