import { Request } from 'express';
import { INTERNAL_KEY_REPORT_MARKER } from '../internal-key.const';
import {
    describeInternalKeyAccess,
    formatInternalKeyAccess,
    InternalKeyAccess,
    InternalKeyAccessReporter,
} from '../internal-key-access.reporter';

const access = (
    route: string,
    overrides: Partial<InternalKeyAccess> = {},
): InternalKeyAccess => ({
    method: 'POST',
    route,
    ip: '1.2.3.4',
    domain: 'a.bitrix24.ru',
    userAgent: 'curl/8.4',
    reason: 'missing_key',
    ...overrides,
});

const requestOf = (partial: Record<string, unknown>): Request =>
    ({
        method: 'POST',
        path: '/api/call-report/scan',
        headers: {},
        ...partial,
    }) as unknown as Request;

describe('InternalKeyAccessReporter', () => {
    it('не чаще раза в минуту на маршрут; пропущенные считаются в следующей строке', () => {
        let now = 0;
        const warn = jest.fn<void, [string]>();
        const reporter = new InternalKeyAccessReporter({ warn }, () => now);

        reporter.report(access('/api/call-report/scan'));
        now = 10_000;
        reporter.report(access('/api/call-report/scan'));
        reporter.report(access('/api/call-report/scan'));
        expect(warn).toHaveBeenCalledTimes(1);

        now = 60_000;
        reporter.report(access('/api/call-report/scan'));
        expect(warn).toHaveBeenCalledTimes(2);
        expect(warn.mock.calls[1][0]).toContain('ещё 2 таких');
    });

    it('разные маршруты и методы пишутся независимо', () => {
        const warn = jest.fn<void, [string]>();
        const reporter = new InternalKeyAccessReporter({ warn }, () => 0);
        reporter.report(access('/api/call-report/scan'));
        reporter.report(access('/api/call-report/analyze'));
        reporter.report(
            access('/api/transcription/:taskId', { method: 'GET' }),
        );
        expect(warn).toHaveBeenCalledTimes(3);
    });
});

describe('describeInternalKeyAccess', () => {
    it('шаблон маршрута, первый IP из x-forwarded-for, домен из тела, user-agent', () => {
        const info = describeInternalKeyAccess(
            requestOf({
                path: '/api/transcription/123',
                route: { path: '/api/transcription/:taskId' },
                ip: '172.18.0.1',
                headers: {
                    'x-forwarded-for': '203.0.113.7, 10.0.0.2',
                    'user-agent': 'python-requests/2.31',
                },
                body: { domain: ' GSR.bitrix24.ru ', text: 'секрет' },
            }),
            'invalid_key',
        );
        expect(info).toEqual({
            method: 'POST',
            route: '/api/transcription/:taskId',
            ip: '203.0.113.7',
            domain: 'gsr.bitrix24.ru',
            userAgent: 'python-requests/2.31',
            reason: 'invalid_key',
        });
    });

    it('нет маршрута и прокси — путь и IP сокета; нет домена — null', () => {
        const info = describeInternalKeyAccess(
            requestOf({ ip: '10.0.0.5', body: undefined }),
            'missing_key',
        );
        expect(info.route).toBe('/api/call-report/scan');
        expect(info.ip).toBe('10.0.0.5');
        expect(info.domain).toBeNull();
    });

    it('домен не имя хоста и переводы строк в user-agent не попадают в журнал как есть', () => {
        const info = describeInternalKeyAccess(
            requestOf({
                headers: { 'user-agent': 'evil\nвторая строка' },
                body: { domain: 'x"; drop' },
            }),
            'missing_key',
        );
        expect(info.domain).toBe('(не домен)');
        expect(info.userAgent).not.toContain('\n');
    });
});

describe('formatInternalKeyAccess', () => {
    it('строка начинается с метки для поиска в журналах', () => {
        const line = formatInternalKeyAccess(access('/api/ai-rag/resume'), 0);
        expect(line.startsWith(INTERNAL_KEY_REPORT_MARKER)).toBe(true);
        expect(line).toContain('POST /api/ai-rag/resume');
        expect(line).not.toContain('ещё');
    });
});
