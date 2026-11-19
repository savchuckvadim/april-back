import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
    APRIL_INTERNAL_API_KEY_ENV,
    APRIL_INTERNAL_GUARD_MODE_ENV,
    APRIL_INTERNAL_KEY_HEADER,
    INTERNAL_KEY_REPORT_MARKER,
    InternalKeyGuardMode,
    InternalKeyRejectReason,
    parseInternalKeyGuardMode,
} from './internal-key.const';
import {
    describeInternalKeyAccess,
    InternalKeyAccessReporter,
} from './internal-key-access.reporter';

/** Ключ из окружения (пустая строка — не задан). Читается на каждый запрос. */
export const readInternalApiKey = (
    env: NodeJS.ProcessEnv = process.env,
): string => (env[APRIL_INTERNAL_API_KEY_ENV] ?? '').trim();

/** Режим из окружения. Читается на каждый запрос. */
export const readInternalKeyGuardMode = (
    env: NodeJS.ProcessEnv = process.env,
): InternalKeyGuardMode =>
    parseInternalKeyGuardMode(env[APRIL_INTERNAL_GUARD_MODE_ENV]);

const digest = (value: string): Buffer =>
    createHash('sha256').update(value).digest();

/** Сравнение без утечки по времени: дайджесты одной длины при любой длине ключей. */
export const isSameInternalKey = (
    provided: string,
    expected: string,
): boolean => timingSafeEqual(digest(provided), digest(expected));

/** null — ключ верный; иначе причина отказа. */
export function checkInternalKey(
    header: string | string[] | undefined,
    expected: string,
): InternalKeyRejectReason | null {
    if (!expected) return 'key_not_configured';
    const provided = Array.isArray(header) ? header[0] : header;
    if (!provided) return 'missing_key';
    return isSameInternalKey(provided, expected) ? null : 'invalid_key';
}

const FORBIDDEN_MESSAGE: Record<InternalKeyRejectReason, string> = {
    key_not_configured: 'Служебные ручки закрыты: ключ на сервере не настроен',
    missing_key: 'Ручка только для служебных вызовов: нужен служебный ключ',
    invalid_key: 'Ручка только для служебных вызовов: неверный служебный ключ',
};

/**
 * Одна строка о режиме на процесс: guard создаётся в каждом модуле, где
 * есть служебные ручки, а сообщение при старте нужно одно. Молчит только
 * в штатном случае — enforce и ключ задан.
 */
export class InternalKeyStartupNotice {
    private reported = false;

    constructor(private readonly logger: Pick<Logger, 'warn'>) {}

    report(mode: InternalKeyGuardMode, key: string): void {
        if (this.reported || (mode === 'enforce' && key)) return;
        this.reported = true;
        const keyState = key
            ? 'ключ задан'
            : `${APRIL_INTERNAL_API_KEY_ENV} не задан`;
        const effect: Record<InternalKeyGuardMode, string> = {
            off: 'проверка служебного ключа выключена, ручки открыты без журнала',
            report:
                'служебные ручки открыты, вызовы без ключа пишутся в журнал ' +
                `«${INTERNAL_KEY_REPORT_MARKER}»`,
            enforce: 'служебные ручки отвечают 403 всем',
        };
        this.logger.warn(
            `${APRIL_INTERNAL_GUARD_MODE_ENV}=${mode}, ${keyState}: ${effect[mode]}`,
        );
    }
}

const logger = new Logger('InternalKeyGuard');
const startupNotice = new InternalKeyStartupNotice(logger);
const accessReporter = new InternalKeyAccessReporter(logger);

/**
 * Служебный ключ: заголовок `x-april-internal-key` сверяется с
 * `APRIL_INTERNAL_API_KEY`. Верный ключ пропускает всегда; без него всё
 * решает `APRIL_INTERNAL_GUARD_MODE` — off (пропуск), report (пропуск с
 * записью в журнал, по умолчанию), enforce (403).
 *
 * Без зависимостей в конструкторе: guard навешивается и на контроллеры
 * библиотек (call-lib, ai-rag, bx-department), а в каждом приложении DI
 * должен его собрать без дополнительных импортов.
 */
@Injectable()
export class InternalKeyGuard implements CanActivate {
    constructor() {
        startupNotice.report(readInternalKeyGuardMode(), readInternalApiKey());
    }

    canActivate(context: ExecutionContext): boolean {
        const mode = readInternalKeyGuardMode();
        if (mode === 'off') return true;

        const request = context.switchToHttp().getRequest<Request>();
        const reason = checkInternalKey(
            request.headers[APRIL_INTERNAL_KEY_HEADER],
            readInternalApiKey(),
        );
        if (!reason) return true;

        if (mode === 'report') {
            accessReporter.report(describeInternalKeyAccess(request, reason));
            return true;
        }
        throw new ForbiddenException(FORBIDDEN_MESSAGE[reason]);
    }
}
