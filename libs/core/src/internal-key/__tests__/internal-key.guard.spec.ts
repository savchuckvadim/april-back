import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import {
    APRIL_INTERNAL_API_KEY_ENV,
    APRIL_INTERNAL_GUARD_MODE_ENV,
    APRIL_INTERNAL_KEY_HEADER,
    INTERNAL_KEY_REPORT_MARKER,
    parseInternalKeyGuardMode,
} from '../internal-key.const';
import {
    checkInternalKey,
    InternalKeyGuard,
    InternalKeyStartupNotice,
    isSameInternalKey,
    readInternalApiKey,
} from '../internal-key.guard';

const KEY = 'служебный-ключ-0123456789';

let routeSeq = 0;

/** Каждый вызов — свой маршрут: журнал report не глушит соседние проверки. */
const contextWith = (
    headers: Record<string, string | string[] | undefined>,
): ExecutionContext => {
    routeSeq += 1;
    const request = {
        method: 'POST',
        path: `/api/test-${routeSeq}`,
        route: { path: `/api/test-${routeSeq}` },
        ip: '10.0.0.1',
        headers: { 'user-agent': 'jest', ...headers },
        body: { domain: 'a.bitrix24.ru' },
    };
    return {
        switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
};

const setEnv = (mode: string | undefined, key: string | undefined): void => {
    if (mode === undefined) delete process.env[APRIL_INTERNAL_GUARD_MODE_ENV];
    else process.env[APRIL_INTERNAL_GUARD_MODE_ENV] = mode;
    if (key === undefined) delete process.env[APRIL_INTERNAL_API_KEY_ENV];
    else process.env[APRIL_INTERNAL_API_KEY_ENV] = key;
};

describe('InternalKeyGuard', () => {
    const savedMode = process.env[APRIL_INTERNAL_GUARD_MODE_ENV];
    const savedKey = process.env[APRIL_INTERNAL_API_KEY_ENV];
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    afterEach(() => {
        warn.mockRestore();
        setEnv(savedMode, savedKey);
    });

    const allowed = (headers: Record<string, string | string[]>): boolean =>
        new InternalKeyGuard().canActivate(contextWith(headers));

    const reportLines = (): string[] =>
        (warn.mock.calls as unknown[][])
            .map(call => String(call[0]))
            .filter(line => line.startsWith(INTERNAL_KEY_REPORT_MARKER));

    describe('enforce', () => {
        it('ключ на сервере не задан — 403 даже с заголовком (закрыто по умолчанию)', () => {
            setEnv('enforce', undefined);
            expect(() => allowed({ [APRIL_INTERNAL_KEY_HEADER]: KEY })).toThrow(
                ForbiddenException,
            );
        });

        it('нет заголовка — 403', () => {
            setEnv('enforce', KEY);
            expect(() => allowed({})).toThrow(ForbiddenException);
        });

        it('неверный ключ — 403', () => {
            setEnv('enforce', KEY);
            expect(() =>
                allowed({ [APRIL_INTERNAL_KEY_HEADER]: `${KEY}-не-тот` }),
            ).toThrow(ForbiddenException);
        });

        it('верный ключ — пропуск, журнал молчит', () => {
            setEnv('enforce', KEY);
            expect(allowed({ [APRIL_INTERNAL_KEY_HEADER]: KEY })).toBe(true);
            expect(reportLines()).toEqual([]);
        });
    });

    describe('report (по умолчанию)', () => {
        it('режим не задан — report: без ключа пропуск и строка журнала', () => {
            setEnv(undefined, KEY);
            expect(allowed({})).toBe(true);
            const [line] = reportLines();
            expect(line).toContain('missing_key');
            expect(line).toContain('POST /api/test-');
            expect(line).toContain('ip=10.0.0.1');
            expect(line).toContain('domain=a.bitrix24.ru');
            expect(line).toContain('ua="jest"');
        });

        it('неверный ключ — пропуск, в журнале причина, но не сам ключ', () => {
            setEnv('report', KEY);
            expect(
                allowed({ [APRIL_INTERNAL_KEY_HEADER]: 'подобранный' }),
            ).toBe(true);
            const [line] = reportLines();
            expect(line).toContain('invalid_key');
            expect(line).not.toContain('подобранный');
            expect(line).not.toContain(KEY);
        });

        it('ключ на сервере не задан — пропуск, причина key_not_configured', () => {
            setEnv('report', undefined);
            expect(allowed({ [APRIL_INTERNAL_KEY_HEADER]: KEY })).toBe(true);
            expect(reportLines()[0]).toContain('key_not_configured');
        });

        it('верный ключ — пропуск без журнала', () => {
            setEnv('report', KEY);
            expect(allowed({ [APRIL_INTERNAL_KEY_HEADER]: KEY })).toBe(true);
            expect(reportLines()).toEqual([]);
        });
    });

    describe('off', () => {
        it('без ключа — пропуск без журнала', () => {
            setEnv('off', KEY);
            expect(allowed({})).toBe(true);
            expect(reportLines()).toEqual([]);
        });

        it('верный ключ — пропуск', () => {
            setEnv('off', KEY);
            expect(allowed({ [APRIL_INTERNAL_KEY_HEADER]: KEY })).toBe(true);
        });
    });

    it('режим и ключ читаются на каждый запрос: смена env действует без пересоздания guard', () => {
        setEnv('report', KEY);
        const guard = new InternalKeyGuard();
        setEnv('enforce', 'новый-ключ');
        expect(() =>
            guard.canActivate(
                contextWith({ [APRIL_INTERNAL_KEY_HEADER]: KEY }),
            ),
        ).toThrow(ForbiddenException);
    });
});

describe('checkInternalKey / isSameInternalKey / readInternalApiKey', () => {
    it('причины отказа и пропуск', () => {
        expect(checkInternalKey(KEY, '')).toBe('key_not_configured');
        expect(checkInternalKey(undefined, KEY)).toBe('missing_key');
        expect(checkInternalKey('', KEY)).toBe('missing_key');
        expect(checkInternalKey('x', KEY)).toBe('invalid_key');
        expect(checkInternalKey(KEY, KEY)).toBeNull();
        expect(checkInternalKey([KEY, 'другой'], KEY)).toBeNull();
    });

    it('сравнение строк любой длины — без исключения', () => {
        expect(isSameInternalKey(KEY, KEY)).toBe(true);
        expect(isSameInternalKey('a', KEY)).toBe(false);
        expect(isSameInternalKey(`${KEY}${KEY}`, KEY)).toBe(false);
    });

    it('ключ из окружения обрезается, пробелы — не ключ', () => {
        expect(
            readInternalApiKey({ [APRIL_INTERNAL_API_KEY_ENV]: ' k\n' }),
        ).toBe('k');
        expect(
            readInternalApiKey({ [APRIL_INTERNAL_API_KEY_ENV]: '   ' }),
        ).toBe('');
        expect(readInternalApiKey({})).toBe('');
    });

    it('режим: регистр и пробелы не важны, неизвестное и пустое — report', () => {
        expect(parseInternalKeyGuardMode(' ENFORCE ')).toBe('enforce');
        expect(parseInternalKeyGuardMode('off')).toBe('off');
        expect(parseInternalKeyGuardMode('block')).toBe('report');
        expect(parseInternalKeyGuardMode(undefined)).toBe('report');
    });
});

describe('InternalKeyStartupNotice', () => {
    it('одна строка на процесс, сколько бы guard ни создавалось', () => {
        const warn = jest.fn<void, [string]>();
        const notice = new InternalKeyStartupNotice({ warn });
        notice.report('report', '');
        notice.report('report', '');
        notice.report('enforce', '');
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain(APRIL_INTERNAL_API_KEY_ENV);
        expect(warn.mock.calls[0][0]).toContain(INTERNAL_KEY_REPORT_MARKER);
    });

    it('enforce без ключа — предупреждение о 403', () => {
        const warn = jest.fn<void, [string]>();
        new InternalKeyStartupNotice({ warn }).report('enforce', '');
        expect(warn.mock.calls[0][0]).toContain('403');
    });

    it('enforce с ключом — штатно, молчит', () => {
        const warn = jest.fn<void, [string]>();
        new InternalKeyStartupNotice({ warn }).report('enforce', KEY);
        expect(warn).not.toHaveBeenCalled();
    });

    it('off — предупреждает, что проверка выключена', () => {
        const warn = jest.fn<void, [string]>();
        new InternalKeyStartupNotice({ warn }).report('off', KEY);
        expect(warn.mock.calls[0][0]).toContain('выключена');
    });
});
