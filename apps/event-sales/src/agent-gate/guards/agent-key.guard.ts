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

/** Request с именем аутентифицированного агента (проставляет guard). */
export interface AgentRequest extends Request {
    agentName: string;
}

/**
 * Защита Agent API ключами внешних агентов (OpenClaw / claude-code).
 *
 * Ключи задаются в env AGENT_API_KEYS через запятую, каждая запись —
 * `имя:ключ` (имя попадает в записи ais как имя агента) или просто `ключ`
 * (имя будет agent-N). Пример:
 * AGENT_API_KEYS=claw-main:a1b2c3...,claw-test:d4e5f6...
 */
@Injectable()
export class AgentKeyGuard implements CanActivate {
    private readonly logger = new Logger(AgentKeyGuard.name);
    private readonly keys: Map<string, string>;

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

        const agentName = this.keys.get(key);
        if (!agentName) {
            this.logger.warn('Agent API: невалидный ключ');
            throw new UnauthorizedException('Invalid agent API key');
        }

        request.agentName = agentName;
        return true;
    }

    /** key → имя агента. */
    private parseKeys(raw: string): Map<string, string> {
        const keys = new Map<string, string>();
        raw.split(',')
            .map(entry => entry.trim())
            .filter(Boolean)
            .forEach((entry, index) => {
                const separator = entry.indexOf(':');
                if (separator > 0) {
                    const name = entry.slice(0, separator).trim();
                    const key = entry.slice(separator + 1).trim();
                    if (name && key) keys.set(key, name);
                } else {
                    keys.set(entry, `agent-${index + 1}`);
                }
            });
        return keys;
    }
}
