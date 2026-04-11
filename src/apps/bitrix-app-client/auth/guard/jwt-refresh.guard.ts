import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { jwtConstants } from '../constants/jwt.constants';
import { TokenService } from '../token/token.service';

interface JwtPayload {
    sub: number;
    client_id: number;
}

type AuthRequest = Request & { user: JwtPayload; refreshToken: string };

@Injectable()
export class RefreshGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly tokenService: TokenService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthRequest>();
        const refreshToken = this.extractRefreshToken(request);

        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token missing');
        }

        try {
            const payload = await this.jwtService.verifyAsync<JwtPayload>(
                refreshToken,
                {
                    secret: jwtConstants.refreshSecret,
                },
            );

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
