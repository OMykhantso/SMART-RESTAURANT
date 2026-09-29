import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config';

export interface AccessPayload {
  sub: number;
  role: Role;
}

export function signAccessToken(userId: number, role: Role): string {
  return jwt.sign({ role }, env.jwtAccessSecret, {
    subject: String(userId),
    expiresIn: `${env.accessTokenTtlMin}m`,
    issuer: 'smart-restaurant',
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.jwtAccessSecret, { issuer: 'smart-restaurant' }) as jwt.JwtPayload;
  return { sub: Number(decoded.sub), role: decoded.role as Role };
}
