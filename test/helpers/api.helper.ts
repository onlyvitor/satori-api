import request from 'supertest';
import { INestApplication } from '@nestjs/common';

/**
 * Helpers agnósticos para requests e2e.
 * Centraliza header de auth, assertions de paginação e factories de rating.
 */

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function apiRequest(app: INestApplication) {
  return request(app.getHttpServer());
}

export function authenticatedGet(app: INestApplication, url: string, token?: string) {
  const req = request(app.getHttpServer()).get(url);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req;
}

export function authenticatedPost(app: INestApplication, url: string, token?: string) {
  const req = request(app.getHttpServer()).post(url);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req;
}

export function authenticatedPatch(app: INestApplication, url: string, token?: string) {
  const req = request(app.getHttpServer()).patch(url);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req;
}

export function authenticatedDelete(app: INestApplication, url: string, token?: string) {
  const req = request(app.getHttpServer()).delete(url);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req;
}

/** Asserts comuns de paginação */
export function expectPaginatedMeta(meta: any, expected: { total: number; page?: number; limit?: number; totalPages?: number }) {
  expect(meta).toHaveProperty('total', expected.total);
  if (expected.page !== undefined) expect(meta).toHaveProperty('page', expected.page);
  if (expected.limit !== undefined) expect(meta).toHaveProperty('limit', expected.limit);
  if (expected.totalPages !== undefined) expect(meta).toHaveProperty('totalPages', expected.totalPages);
}

export function expectPaginatedSuccess(resBody: any, expectedLength: number) {
  expect(resBody).toHaveProperty('data');
  expect(resBody).toHaveProperty('meta');
  expect(Array.isArray(resBody.data)).toBe(true);
  expect(resBody.data).toHaveLength(expectedLength);
}

/** Factories para payloads de rating */
export function buildRatingDto(overrides: Partial<Record<string, any>> = {}) {
  return {
    score: 5,
    comment: 'A timeless classic.',
    status: 'finished' as const,
    googleBookId: 'zyTCAlFPjgYC',
    userId: 9999, // será sobrescrito pelo service (token sub)
    ...overrides,
  };
}

/** Helper para criar rating via API e já validar */
export async function createRatingViaApi(
  app: INestApplication,
  token: string,
  dto: any = buildRatingDto(),
) {
  const res = await request(app.getHttpServer())
    .post('/api/rating')
    .set('Authorization', `Bearer ${token}`)
    .send(dto)
    .expect(201);
  return res.body;
}

/** Helpers de auth/guards */
export async function expectUnauthorized(promise: Promise<any>, msgPattern?: RegExp) {
  const res = await promise;
  expect(res.status).toBe(401);
  if (msgPattern) expect(res.body.message).toMatch(msgPattern);
  return res;
}

export async function expectForbidden(promise: Promise<any>, msgPattern?: RegExp) {
  const res = await promise;
  expect(res.status).toBe(403);
  if (msgPattern) expect(res.body.message).toMatch(msgPattern);
  return res;
}
