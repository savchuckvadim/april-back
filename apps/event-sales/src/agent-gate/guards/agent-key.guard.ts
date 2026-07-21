import {
    CanActivate,
    ExecutionContext,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

export const AGENT_API_KEY_HEADER = 'x-agent-api-key';

/** Данные ключа агента. */
export interface AgentKeyInfo {
    name: string;
    /** Разрешённые домены порталов; null — ключ без ограничений (админский). */
    domains: string[] | null;
}

/** Request с данными аутентифицированного агента (проставляет guard). */
export interface AgentRequest extends Request {
    agentName: string;
    /** Изоляция порталов: null — все домены, иначе только перечисленные. */
    agentDomains: string[] | null;
}

/**
 * Защита Agent API ключами внешних агентов (OpenClaw / claude-code).
 *
 * Ключи задаются в env AGENT_API_KEYS через запятую, каждая запись:
 * - `имя:ключ` — ключ без ограничений по доменам;
 * - `имя:ключ:domain1|domain2` — ключ видит ТОЛЬКО перечисленные порталы
 *   (изоляция клиентов: агент gsr не должен видеть звонки april-garant);
 * - просто `ключ` (имя будет agent-N, без ограничений).
 * Пример:
 * AGENT_API_KEYS=claw-gsr:a1b2...:gsr.bitrix24.ru,claw-garant:d4e5...:april-garant.bitrix24.ru
 */
@Injectable()
export class AgentKeyGuard implements CanActivate {
    private readonly logger = new Logger(AgentKeyGuard.name);
    private readonly keys: Map<string, AgentKeyInfo>;

    constructor(private readonly configService: ConfigService) {
        this.keys = this.parseKeys(
            this.configService.get<string>('AGENT_API_KEYS') ?? '',
        );
    }

    canActivate(context: ExecutionContext): boolean {
        if (!this.keys.size) {
            this.logger.error('AGENT_API_KEYS не настроен — Agent API закрыт');
            throw new UnauthorizedException('Agent API is not configured');
        }

        const request = context.switchToHttp().getRequest<AgentRequest>();
        const header = request.headers[AGENT_API_KEY_HEADER];
        const key = Array.isArray(header) ? header[0] : header;
        if (!key) {
            throw new UnauthorizedException(
                `Missing ${AGENT_API_KEY_HEADER} header`,
            );
        }

        const info = this.keys.get(key);
        if (!info) {
            this.logger.warn('Agent API: невалидный ключ');
            throw new UnauthorizedException('Invalid agent API key');
        }

        request.agentName = info.name;
        request.agentDomains = info.domains;
        return true;
    }

    /** key → данные агента (имя + доменная изоляция). */
    private parseKeys(raw: string): Map<string, AgentKeyInfo> {
        const keys = new Map<string, AgentKeyInfo>();
        raw.split(',')
            .map(entry => entry.trim())
            .filter(Boolean)
            .forEach((entry, index) => {
                const parts = entry.split(':');
                if (parts.length === 1) {
                    keys.set(entry, {
                        name: `agent-${index + 1}`,
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
