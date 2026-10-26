import {
    CanActivate,
    ExecutionContext,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

export const SUPPORT_API_KEY_HEADER = 'x-support-api-key';
export const SUPPORT_API_KEYS_ENV = 'SUPPORT_API_KEYS';

/** Request с именем ключа, который прошёл проверку (для журнала). */
export interface SupportApiRequest extends Request {
    supportClient: string;
}

/** `имя:ключ,имя2:ключ2` (или просто `ключ`) → ключ → имя. */
export function parseSupportApiKeys(raw: string): Map<string, string> {
    const keys = new Map<string, string>();
    raw.split(',')
        .map(entry => entry.trim())
        .filter(Boolean)
        .forEach((entry, index) => {
            const separator = entry.indexOf(':');
            const name = separator > 0 ? entry.slice(0, separator).trim() : '';
            const key = (
                separator > 0 ? entry.slice(separator + 1) : entry
            ).trim();
            if (key) keys.set(key, name || `support-${index + 1}`);
        });
    return keys;
}

/**
 * Защита Support API ключами (env SUPPORT_API_KEYS). Отдельно от ключей
 * Agent API: Support API умеет писать клиентам, и ключ клиентского агента
 * не должен давать такого права. Ключей нет — API закрыт.
 */
@Injectable()
export class SupportApiKeyGuard implements CanActivate {
    private readonly logger = new Logger(SupportApiKeyGuard.name);
    private readonly keys: Map<string, string>;

    constructor(config: ConfigService) {
        this.keys = parseSupportApiKeys(
            config.get<string>(SUPPORT_API_KEYS_ENV) ?? '',
        );
    }

    canActivate(context: ExecutionContext): boolean {
        if (!this.keys.size) {
            this.logger.error(
                `${SUPPORT_API_KEYS_ENV} не задан — Support API закрыт`,
            );
            throw new UnauthorizedException('Support API is not configured');
        }
        const request = context.switchToHttp().getRequest<SupportApiRequest>();
        const header = request.headers[SUPPORT_API_KEY_HEADER];
        const key = Array.isArray(header) ? header[0] : header;
        const name = key ? this.keys.get(key) : undefined;
        if (!name) {
            throw new UnauthorizedException(
                `Missing or invalid ${SUPPORT_API_KEY_HEADER} header`,
            );
        }
        request.supportClient = name;
        return true;
    }
}
