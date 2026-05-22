import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { jwtConstants } from '../constants/jwt.constants';
import {
    AuthJwtPayload,
    EmailConfirmationJwtPayload,
} from '../interfaces/auth-jwt-payload.interface';

@Injectable()
export class AuthJwtService {
    constructor(private readonly jwtService: JwtService) {}

    signAccessToken(userId: number, clientId: number): string {
        return this.jwtService.sign(
            { sub: userId, client_id: clientId },
            {
                secret: jwtConstants.accessSecret,
                expiresIn: jwtConstants.accessExpiresIn,
            },
        );
    }

    signRefreshToken(userId: number, clientId: number): string {
        return this.jwtService.sign(
            { sub: userId, client_id: clientId },
            {
                secret: jwtConstants.refreshSecret,
                expiresIn: jwtConstants.refreshExpiresIn,
            },
        );
    }

    signEmailConfirmationToken(email: string): string {
        return this.jwtService.sign(
            { email },
            { secret: jwtConstants.accessSecret, expiresIn: '24h' },
        );
    }

    verifyAccessToken(token: string): Promise<AuthJwtPayload> {
        return this.jwtService.verifyAsync<AuthJwtPayload>(token, {
            secret: jwtConstants.accessSecret,
        });
    }

    verifyRefreshToken(token: string): Promise<AuthJwtPayload> {
        return this.jwtService.verifyAsync<AuthJwtPayload>(token, {
            secret: jwtConstants.refreshSecret,
        });
    }

    verifyEmailConfirmationToken(token: string): EmailConfirmationJwtPayload {
        return this.jwtService.verify<EmailConfirmationJwtPayload>(token, {
            secret: jwtConstants.accessSecret,
        });
    }
}
