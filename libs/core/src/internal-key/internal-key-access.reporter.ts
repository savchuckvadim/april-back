import { Logger } from '@nestjs/common';
import { Request } from 'express';
import {
    INTERNAL_KEY_REPORT_INTERVAL_MS,
    INTERNAL_KEY_REPORT_MARKER,
    InternalKeyRejectReason,
} from './internal-key.const';

/** Кто постучался в служебную ручку без верного ключа — без тела и секретов. */
export interface InternalKeyAccess {
    method: string;
    /** Шаблон маршрута (`/api/transcription/:taskId`), а не конкретный URL. */
    route: string;
    ip: string;
    /** `domain` из тела запроса, если это имя хоста; null — поля нет. */
    domain: string | null;
    userAgent: string;
    reason: InternalKeyRejectReason;
}

const REASON_TEXT: Record<InternalKeyRejectReason, string> = {
    key_not_configured: 'ключ на сервере не задан',
    missing_key: 'без заголовка ключа',
    invalid_key: 'с неверным ключом',
};

const HOST_PATTERN = /^[a-z0-9.-]{1,253}$/;
const USER_AGENT_MAX = 200;
const IP_MAX = 64;
/** Страховка от раздувания карты, если маршрут вдруг не распознан. */
const ROUTES_MAX = 500;

/** Без переводов строк и управляющих символов: строка журнала не подделывается. */
const clean = (value: string, max: number): string =>
    value
        .replace(/\p{Cc}/gu, ' ')
        .trim()
        .slice(0, max);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const firstHeader = (value: string | string[] | undefined): string =>
    (Array.isArray(value) ? value[0] : value) ?? '';

function routeOf(request: Request): string {
    const route: unknown = request.route;
    return isRecord(route) && typeof route.path === 'string'
        ? route.path
        : request.path;
}

function domainOf(request: Request): string | null {
    const body: unknown = request.body;
    if (!isRecord(body) || typeof body.domain !== 'string') return null;
    const domain = body.domain.trim().toLowerCase();
    return HOST_PATTERN.test(domain) ? domain : '(не домен)';
}

function ipOf(request: Request): string {
    const forwarded = firstHeader(request.headers['x-forwarded-for'])
        .split(',')[0]
        ?.trim();
    return clean(forwarded || request.ip || '?', IP_MAX);
}

/** Сведения для журнала из запроса: маршрут, IP, домен, user-agent. */
export function describeInternalKeyAccess(
    request: Request,
    reason: InternalKeyRejectReason,
): InternalKeyAccess {
    return {
        method: request.method,
        route: routeOf(request),
        ip: ipOf(request),
        domain: domainOf(request),
        userAgent: clean(
            firstHeader(request.headers['user-agent']),
            USER_AGENT_MAX,
        ),
        reason,
    };
}

export function formatInternalKeyAccess(
    access: InternalKeyAccess,
    skipped: number,
): string {
    return (
        `${INTERNAL_KEY_REPORT_MARKER}: служебная ручка вызвана ` +
        `${REASON_TEXT[access.reason]} (${access.reason}) — ` +
        `${access.method} ${access.route}; ip=${access.ip}; ` +
        `domain=${access.domain ?? '-'}; ua="${access.userAgent || '-'}"` +
        (skipped > 0 ? `; ещё ${skipped} таких с прошлой записи` : '')
    );
}

interface RouteReport {
    at: number;
    skipped: number;
}

/**
 * Журнал обращений без ключа в режиме report: не чаще одной строки на
 * маршрут за минуту, остальные считаются и попадают в следующую строку.
 */
export class InternalKeyAccessReporter {
    private readonly byRoute = new Map<string, RouteReport>();

    constructor(
        private readonly logger: Pick<Logger, 'warn'>,
        private readonly now: () => number = Date.now,
        private readonly intervalMs = INTERNAL_KEY_REPORT_INTERVAL_MS,
    ) {}

    report(access: InternalKeyAccess): void {
        const key = `${access.method} ${access.route}`;
        const at = this.now();
        const last = this.byRoute.get(key);
        if (last && at - last.at < this.intervalMs) {
            last.skipped += 1;
            return;
        }
        if (!last && this.byRoute.size >= ROUTES_MAX) this.byRoute.clear();
        this.byRoute.set(key, { at, skipped: 0 });
        this.logger.warn(formatInternalKeyAccess(access, last?.skipped ?? 0));
    }
}
