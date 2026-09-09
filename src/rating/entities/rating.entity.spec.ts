import { Rating } from './rating.entity';
import { Status } from '../status.enum';

describe('Rating entity (alias agnóstico)', () => {
  it('should set and get googleBookId', () => {
    const rating = new Rating();
    rating.googleBookId = 'g123';
    expect(rating.googleBookId).toBe('g123');
  });

  it('should alias bookId to googleBookId (getter/setter)', () => {
    const rating = new Rating();
    rating.bookId = 'b456';
    expect(rating.googleBookId).toBe('b456');
    expect(rating.bookId).toBe('b456');

    rating.googleBookId = 'g789';
    expect(rating.bookId).toBe('g789');
  });

  it('should keep bookId and googleBookId in sync', () => {
    const rating = new Rating();
    rating.googleBookId = 'initial';
    expect(rating.bookId).toBe('initial');
    rating.bookId = 'updated';
    expect(rating.googleBookId).toBe('updated');
  });

  it('should allow creation via Object.assign with bookId', () => {
    const rating = new Rating();
    Object.assign(rating, { score: 5, comment: 'Great', status: Status.FINISHED, bookId: 'alias123', userId: 1 });
    expect(rating.googleBookId).toBe('alias123');
    expect(rating.bookId).toBe('alias123');
  });

  it('should handle undefined bookId', () => {
    const rating = new Rating();
    rating.bookId = undefined as any;
    expect(rating.googleBookId).toBeUndefined();
  });
});
