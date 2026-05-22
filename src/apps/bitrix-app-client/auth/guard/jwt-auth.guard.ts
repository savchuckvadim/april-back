import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthJwtService } from '../services/auth-jwt.service';
import { AuthJwtPayload } from '../interfaces/auth-jwt-payload.interface';

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private readonly authJwtService: AuthJwtService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const token = this.extractToken(request);

        if (!token) {
            throw new UnauthorizedException();
        }

        try {
            const payload = await this.authJwtService.verifyAccessToken(token);
            (request as Request & { user: AuthJwtPayload }).user = payload;
        } catch {
            throw new UnauthorizedException();
        }

        return true;
    }

    private extractToken(request: Request): string | undefined {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        if (type === 'Bearer' && token) return token;

        const cookieToken = (request.cookies as Record<string, string>)
            ?.access_token;
        if (cookieToken) return cookieToken;

        return undefined;
    }
}
