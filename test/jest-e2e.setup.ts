import * as dotenv from 'dotenv';
import * as path from 'path';

// Carrega .env.test antes de qualquer import de AppModule / jwtConstants
dotenv.config({ path: path.resolve(__dirname, '..', '.env.test') });

// Fallback caso JWT_SECRET não esteja definido
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret-32chars-minimum';
}
