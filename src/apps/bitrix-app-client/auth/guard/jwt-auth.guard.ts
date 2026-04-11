import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { jwtConstants } from '../constants/jwt.constants';
import { Request } from 'express';

interface JwtPayload {
    sub: number;
    client_id: number;
}

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private jwtService: JwtService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const token = this.extractToken(request);

        if (!token) {
            throw new UnauthorizedException();
        }

        try {
            const payload = await this.jwtService.verifyAsync<JwtPayload>(
                token,
                {
                    secret: jwtConstants.accessSecret,
                },
            );
            (request as Request & { user: JwtPayload }).user = payload;
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
