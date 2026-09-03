import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from '../../src/users/entities/user.entity';
import * as bcrypt from 'bcrypt';

export async function createUser(
  app: INestApplication,
  userDto: { name: string; email: string; password: string; isAdmin?: boolean },
) {
  // Tenta via API primeiro (cobre fluxo público), fallback via repo se isAdmin
  if (userDto.isAdmin) {
    const dataSource = app.get(DataSource);
    const repo = dataSource.getRepository(User);
    const hashed = await bcrypt.hash(userDto.password, 10);
    const user = repo.create({
      name: userDto.name,
      email: userDto.email,
      password: hashed,
      isAdmin: true,
    });
    const saved = await repo.save(user);
    return saved;
  }

  const res = await request(app.getHttpServer()).post('/api/users').send({
    name: userDto.name,
    email: userDto.email,
    password: userDto.password,
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Falha ao criar usuário ${userDto.email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

export async function login(
  app: INestApplication,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string; userId?: number }> {
  const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Falha ao logar ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  // auth.service retorna {success:true, data:{accessToken, refreshToken}}
  return res.body.data;
}

export async function createUserAndLogin(
  app: INestApplication,
  userDto: { name: string; email: string; password: string; isAdmin?: boolean },
) {
  await createUser(app, userDto);
  const tokens = await login(app, userDto.email, userDto.password);
  return tokens;
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
