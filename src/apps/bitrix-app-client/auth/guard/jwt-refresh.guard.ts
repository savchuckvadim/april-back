import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { TokenService } from '../token/token.service';
import { AuthJwtService } from '../services/auth-jwt.service';
import { AuthRequest } from '../interfaces/auth-request.interface';

@Injectable()
export class RefreshGuard implements CanActivate {
    constructor(
        private readonly authJwtService: AuthJwtService,
        private readonly tokenService: TokenService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthRequest>();
        const refreshToken = this.extractRefreshToken(request);

        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token missing');
        }

        try {
            const payload =
                await this.authJwtService.verifyRefreshToken(refreshToken);

            const isValid = await this.tokenService.validateRefreshToken(
                refreshToken,
                payload.sub,
            );
            if (!isValid) {
                throw new UnauthorizedException('Refresh token revoked');
            }

            request.user = payload;
            request.refreshToken = refreshToken;
            return true;
        } catch (e) {
            if (e instanceof UnauthorizedException) throw e;
            throw new UnauthorizedException('Invalid or expired refresh token');
        }
    }

    private extractRefreshToken(request: Request): string | undefined {
        const cookieToken = (request.cookies as Record<string, string>)
            ?.refresh_token;
        if (cookieToken) return cookieToken;

        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        if (type === 'Bearer' && token) return token;

        return undefined;
    }
}
