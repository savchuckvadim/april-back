// src/auth/guards/refresh.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthService } from '../services/auth.service';
import { jwtConstants } from '../constants/jwt.constants';

@Injectable()
export class RefreshGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly authService: AuthService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const refreshToken = request.cookies?.refresh_token;

        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token missing');
        }

        try {
            const payload = await this.jwtService.verifyAsync(refreshToken, {
                secret: jwtConstants.secret,
            });

            const user = await this.authService.validateUserById(payload.sub);
            if (!user) throw new UnauthorizedException('User not found');

            // пробрасываем user дальше
            (request as any).user = user;
            return true;
        } catch (e) {
            throw new UnauthorizedException('Invalid or expired refresh token');
        }
    }
}
