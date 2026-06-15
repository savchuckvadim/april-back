import { timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

/** Параметры HTTP Basic-защиты страницы Swagger UI. */
export interface SwaggerBasicAuthOptions {
    user: string;
    password: string;
    realm?: string;
}

/** Сравнение строк за постоянное время (защита от тайминг-атак). */
function safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}

/**
 * Express-middleware HTTP Basic Auth для защиты страницы Swagger UI.
 * Реализован вручную, без внешних зависимостей.
 */
export function swaggerBasicAuth(options: SwaggerBasicAuthOptions) {
    const realm = options.realm ?? 'Swagger';

    return (req: Request, res: Response, next: NextFunction): void => {
        const [scheme, encoded] = req.headers.authorization?.split(' ') ?? [];

        if (scheme === 'Basic' && encoded) {
            const decoded = Buffer.from(encoded, 'base64').toString('utf8');
            const sepIndex = decoded.indexOf(':');
            const user = decoded.slice(0, sepIndex);
            const password = decoded.slice(sepIndex + 1);

            if (
                safeEqual(user, options.user) &&
                safeEqual(password, options.password)
            ) {
                next();
                return;
            }
        }

        res.setHeader('WWW-Authenticate', `Basic realm="${realm}"`);
        res.status(401).send('Authentication required');
    };
}
