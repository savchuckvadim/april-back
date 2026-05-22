import { Request } from 'express';
import { AuthJwtPayload } from './auth-jwt-payload.interface';

export interface AuthRequest extends Request {
    user: AuthJwtPayload;
    refreshToken?: string;
}
