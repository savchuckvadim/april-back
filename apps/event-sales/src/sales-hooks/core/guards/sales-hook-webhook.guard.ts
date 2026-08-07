import {
    CanActivate,
    ExecutionContext,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/** Query-параметр ключа: робот Битрикса не умеет слать заголовки. */
export const SALES_HOOK_KEY_QUERY_PARAM = 'hookKey';

interface WebhookKeyInfo {
    name: string;
    /** null — ключ без ограничений; иначе только перечисленные порталы. */
    domains: string[] | null;
}

/**
 * Защита вебхуков sales-хуков ключами из env SALES_HOOK_WEBHOOK_KEYS
 * (формат один-в-один с AGENT_API_KEYS: `имя:ключ:domain1|domain2`).
 *
 * ВЫКЛЮЧЕН по умолчанию (SALES_HOOK_WEBHOOK_AUTH_ENABLED !== 'true'):
 * смена URL в роботах живых порталов — отдельная операционная задача;
 * включаем флагом после перенастройки роботов. Домен при этом всегда
 * проверяется дальше через PBXService.init (незнакомый портал упадёт).
 */
@Injectable()
export class SalesHookWebhookGuard implements CanActivate {
    private readonly logger = new Logger(SalesHookWebhookGuard.name);
    private readonly enabled: boolean;
    private readonly keys: Map<string, WebhookKeyInfo>;

    constructor(private readonly configService: ConfigService) {
        this.enabled =
            this.configService.get<string>(
                'SALES_HOOK_WEBHOOK_AUTH_ENABLED',
            ) === 'true';
        this.keys = this.parseKeys(
            this.configService.get<string>('SALES_HOOK_WEBHOOK_KEYS') ?? '',
        );
    }

    canActivate(context: ExecutionContext): boolean {
        if (!this.enabled) return true;

        if (!this.keys.size) {
            this.logger.error(
                'SALES_HOOK_WEBHOOK_AUTH_ENABLED=true, но SALES_HOOK_WEBHOOK_KEYS пуст — вебхуки закрыты',
            );
            throw new UnauthorizedException(
                'Sales hook webhooks are not configured',
            );
        }

        const request = context.switchToHttp().getRequest<Request>();
        const raw = request.query[SALES_HOOK_KEY_QUERY_PARAM];
        const first = Array.isArray(raw) ? raw[0] : raw;
        const key = typeof first === 'string' ? first : '';
        if (!key) {
            throw new UnauthorizedException(
                `Missing ${SALES_HOOK_KEY_QUERY_PARAM} query parameter`,
            );
        }

        const info = this.keys.get(key);
        if (!info) {
            this.logger.warn('Sales hook webhook: невалидный ключ');
            throw new UnauthorizedException('Invalid sales hook webhook key');
        }

        if (info.domains) {
            const body = request.body as
                | { auth?: { domain?: string } }
                | undefined;
            const domain = body?.auth?.domain?.toLowerCase();
            if (!domain || !info.domains.includes(domain)) {
                this.logger.warn(
                    `Sales hook webhook: ключ «${info.name}» не имеет доступа к домену ${domain ?? '(нет)'}`,
                );
                throw new UnauthorizedException(
                    'Webhook key is not allowed for this portal',
                );
            }
        }
        return true;
    }

    private parseKeys(raw: string): Map<string, WebhookKeyInfo> {
        const keys = new Map<string, WebhookKeyInfo>();
        raw.split(',')
            .map(entry => entry.trim())
            .filter(Boolean)
            .forEach((entry, index) => {
                const parts = entry.split(':');
                if (parts.length === 1) {
                    keys.set(entry, {
                        name: `hook-key-${index + 1}`,
                        domains: null,
                    });
                    return;
                }
                const name = parts[0].trim();
                const key = parts[1].trim();
                const domains = parts[2]
                    ?.split('|')
                    .map(domain => domain.trim().toLowerCase())
                    .filter(Boolean);
                if (name && key) {
                    keys.set(key, {
                        name,
                        domains: domains?.length ? domains : null,
                    });
                }
            });
        return keys;
    }
}
