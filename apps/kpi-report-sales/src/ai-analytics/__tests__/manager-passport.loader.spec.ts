import 'reflect-metadata';
import { DEFAULT_WORK_CALENDAR } from '@lib/sales-ai-analytics';
import type { AiAnalyticsPortalSettings } from '../domain/loaders/settings.loader';
import { ManagerPassportLoader } from '../domain/loaders/manager-passport.loader';
import {
    buildPassport,
    isActiveValue,
    ManagerUserFacts,
    resolveSince,
    toPassportDate,
    toUserFacts,
} from '../domain/loaders/manager-passport.util';
import { parseTenureGates } from '@lib/sales-ai-analytics/model/tenure-bands';

const DOMAIN = 'a.bitrix24.ru';
/** День расчёта стажа: 8 сентября 2026. */
const UNTIL = '2026-09-08';
const NOW = new Date('2026-09-08T00:45:00Z');
const GATES = parseTenureGates('6/18');

/** Запись user.get портала (поля приходят строками). */
type BxUserRow = Record<string, unknown>;

const userRow = (row: BxUserRow): BxUserRow => ({
    ID: '10',
    ACTIVE: true,
    ...row,
});

function portalSettings(
    overrides: Partial<AiAnalyticsPortalSettings> = {},
): AiAnalyticsPortalSettings {
    return {
        calendar: DEFAULT_WORK_CALENDAR,
        levels: [],
        absences: {},
        ...overrides,
    } as unknown as AiAnalyticsPortalSettings;
}

interface LoaderCase {
    users?: BxUserRow[];
    ids?: number[];
    settings?: AiAnalyticsPortalSettings;
    /** user.get падает (нет прав, портал недоступен). */
    fails?: boolean;
    cached?: ManagerUserFacts[] | null;
    /** Раскладка ростера: менеджер → отдел продаж. */
    org?: Map<number, { departmentId: number | null }>;
    /** Раскладка недоступна (кэш/структура упали). */
    orgFails?: boolean;
}

function makeLoader(options: LoaderCase = {}) {
    const userGet = jest.fn(() =>
        options.fails
            ? Promise.reject(new Error('ACCESS_DENIED'))
            : Promise.resolve({ result: options.users ?? [] }),
    );
    const pbx = {
        init: jest
            .fn()
            .mockResolvedValue({ bitrix: { user: { get: userGet } } }),
    };
    const settings = {
        load: jest.fn().mockResolvedValue(options.settings ?? portalSettings()),
    };
    const cache = {
        getJson: jest.fn().mockResolvedValue(options.cached ?? null),
        setJson: jest.fn().mockResolvedValue(undefined),
    };
    const managers = {
        resolve: jest.fn().mockResolvedValue(options.ids ?? [10]),
    };
    const org = {
        load: jest.fn(() =>
            options.orgFails
                ? Promise.reject(new Error('структура недоступна'))
                : Promise.resolve(options.org ?? new Map()),
        ),
    };
    const loader = new ManagerPassportLoader(
        pbx as never,
        settings as never,
        cache as never,
        managers as never,
        org as never,
    );

    return { loader, userGet, pbx, cache };
}

describe('Каскад даты начала работы (P2-26: since без ручного ввода)', () => {
    it('поле трудоустройства → sinceSource employment', async () => {
        const { loader } = makeLoader({
            users: [
                userRow({
                    UF_EMPLOYMENT_DATE: '2026-04-01T00:00:00+03:00',
                    DATE_REGISTER: '2025-01-10T00:00:00+03:00',
                }),
            ],
        });

        const { passports } = await loader.load(DOMAIN, [10], { until: UNTIL });

        expect(passports[0].since).toBe('2026-04-01');
        expect(passports[0].sinceSource).toBe('employment');
    });

    it('поля трудоустройства нет → дата регистрации, sinceSource register', async () => {
        const { loader } = makeLoader({
            users: [userRow({ DATE_REGISTER: '2026-03-01T00:00:00+03:00' })],
        });

        const { passports } = await loader.load(DOMAIN, [10], { until: UNTIL });

        expect(passports[0].since).toBe('2026-03-01');
        expect(passports[0].sinceSource).toBe('register');
    });

    it('нет ни одной даты портала → первое событие, sinceSource proxy', async () => {
        const { loader } = makeLoader({ users: [userRow({})] });

        const { passports } = await loader.load(DOMAIN, [10], {
            until: UNTIL,
            firstEventAt: { '10': '2025-03-01' },
        });

        expect(passports[0].since).toBe('2025-03-01');
        expect(passports[0].sinceSource).toBe('proxy');
    });

    it('нет ни портала, ни события — каскад доходит до конца и не падает', async () => {
        const { loader } = makeLoader({ users: [] });

        const { passports, ok } = await loader.load(DOMAIN, [10], {
            until: UNTIL,
        });

        expect(ok).toBe(true);
        expect(passports[0]).toMatchObject({
            since: null,
            sinceSource: null,
            tenureMonths: null,
            tenureBand: null,
            status: 'active',
        });
    });

    it('user.get отказал — паспорта собраны по прокси, ok = false', async () => {
        const { loader } = makeLoader({ fails: true });

        const { passports, ok } = await loader.load(DOMAIN, [10], {
            until: UNTIL,
            firstEventAt: { '10': '2026-04-01' },
        });

        expect(ok).toBe(false);
        expect(passports[0].sinceSource).toBe('proxy');
    });

    it('resolveSince — приоритет источников', () => {
        const facts: ManagerUserFacts = {
            managerId: '10',
            active: true,
            employmentDate: '2026-04-01',
            registerDate: '2025-01-10',
            lastActivityAt: null,
        };

        expect(resolveSince(facts, '2024-01-01').sinceSource).toBe(
            'employment',
        );
        expect(
            resolveSince({ ...facts, employmentDate: null }, '2024-01-01')
                .sinceSource,
        ).toBe('register');
        expect(
            resolveSince(
                { ...facts, employmentDate: null, registerDate: null },
                '2024-01-01',
            ).since,
        ).toBe('2024-01-01');
        expect(resolveSince(undefined, null)).toEqual({
            since: null,
            sinceSource: null,
        });
    });
});

describe('Статус менеджера', () => {
    it('ACTIVE = N → статус «ушёл» и дата последнего события', async () => {
        const { loader } = makeLoader({
            users: [
                userRow({
                    ACTIVE: 'N',
                    UF_EMPLOYMENT_DATE: '2025-01-10',
                    LAST_ACTIVITY_DATE: '2026-08-19T14:00:00+03:00',
                }),
            ],
        });

        const { passports } = await loader.load(DOMAIN, [10], { until: UNTIL });

        expect(passports[0].status).toBe('left');
        expect(passports[0].leftAt).toBe('2026-08-19');
    });

    it('уволен без даты активности — leftAt null, шаг не падает', async () => {
        const { loader } = makeLoader({
            users: [userRow({ ACTIVE: false, DATE_REGISTER: '2025-01-10' })],
        });

        const { passports } = await loader.load(DOMAIN, [10], { until: UNTIL });

        expect(passports[0]).toMatchObject({ status: 'left', leftAt: null });
    });

    it('день внутри отсутствия → статус «в отсутствии»', async () => {
        const { loader } = makeLoader({
            users: [userRow({ UF_EMPLOYMENT_DATE: '2025-01-10' })],
            settings: portalSettings({
                absences: {
                    '10': [
                        {
                            from: '2026-09-01',
                            to: '2026-09-14',
                            kind: 'vacation',
                        },
                    ],
                },
            }),
        });

        const { passports } = await loader.load(DOMAIN, [10], { until: UNTIL });

        expect(passports[0].status).toBe('absent');
    });

    it('стаж меньше испытательного срока → probation', async () => {
        const { loader } = makeLoader({
            users: [userRow({ UF_EMPLOYMENT_DATE: '2026-08-10' })],
        });

        const { passports } = await loader.load(DOMAIN, [10], { until: UNTIL });

        expect(passports[0].status).toBe('probation');
    });

    it('isActiveValue — булево, Y/N и мусор', () => {
        expect(isActiveValue(true)).toBe(true);
        expect(isActiveValue(false)).toBe(false);
        expect(isActiveValue('N')).toBe(false);
        expect(isActiveValue('Y')).toBe(true);
        expect(isActiveValue(undefined)).toBe(true);
    });
});

describe('Полосы стажа и уровень', () => {
    const bandOf = (since: string): string | null =>
        buildPassport({
            managerId: '10',
            facts: {
                managerId: '10',
                active: true,
                employmentDate: since,
                registerDate: null,
                lastActivityAt: null,
            },
            firstEventAt: null,
            absences: [],
            until: UNTIL,
            gates: GATES,
        }).tenureBand;

    it('границы 5 / 6 / 18 месяцев: 0-6, 6-18, 18+', () => {
        expect(bandOf('2026-04-01')).toBe('0-6');
        expect(bandOf('2026-03-01')).toBe('6-18');
        expect(bandOf('2025-03-01')).toBe('18+');
    });

    it('уровень по стажу, когда РОП его не назначал', () => {
        const passport = buildPassport({
            managerId: '10',
            facts: {
                managerId: '10',
                active: true,
                employmentDate: '2026-04-01',
                registerDate: null,
                lastActivityAt: null,
            },
            firstEventAt: null,
            absences: [],
            until: UNTIL,
            gates: GATES,
        });

        expect(passport).toMatchObject({
            level: 'junior',
            levelSource: 'default',
            tenureMonths: 5,
        });
    });

    it('уровень, назначенный руководителем, важнее подсказки по стажу', async () => {
        const { loader } = makeLoader({
            users: [userRow({ UF_EMPLOYMENT_DATE: '2026-04-01' })],
            settings: portalSettings({
                levels: [
                    {
                        managerId: 10,
                        level: 'senior',
                        since: null,
                        source: 'manual',
                    },
                ],
            }),
        });

        const { passports } = await loader.load(DOMAIN, [10], { until: UNTIL });

        expect(passports[0]).toMatchObject({
            level: 'senior',
            levelSource: 'manual',
            tenureBand: '0-6',
        });
    });
});

describe('Разбор ответа портала и работа с инстансом Битрикс', () => {
    it('toPassportDate — ISO, ISO с временем, dd.mm.yyyy, мусор', () => {
        expect(toPassportDate('2026-04-01')).toBe('2026-04-01');
        expect(toPassportDate('2026-04-01T00:00:00+03:00')).toBe('2026-04-01');
        expect(toPassportDate('01.04.2026')).toBe('2026-04-01');
        expect(toPassportDate('')).toBeNull();
        expect(toPassportDate(42)).toBeNull();
    });

    it('отдел продаж приходит из раскладки ростера; нет в раскладке — null', async () => {
        const { loader } = makeLoader({
            users: [userRow({ UF_EMPLOYMENT_DATE: '2026-04-01' })],
            ids: [10, 11],
            org: new Map([[10, { departmentId: 91 }]]),
        });

        const { passports } = await loader.load(DOMAIN, [10, 11], {
            until: UNTIL,
        });

        expect(passports[0]).toMatchObject({
            managerId: '10',
            departmentId: 91,
        });
        expect(passports[1]).toMatchObject({
            managerId: '11',
            departmentId: null,
        });
    });

    it('раскладка недоступна: паспорт без отдела, а не без паспорта', async () => {
        const { loader } = makeLoader({
            users: [userRow({ UF_EMPLOYMENT_DATE: '2026-04-01' })],
            orgFails: true,
        });

        const { passports } = await loader.load(DOMAIN, [10], {
            until: UNTIL,
        });

        expect(passports[0]).toMatchObject({
            since: '2026-04-01',
            departmentId: null,
        });
    });

    it('toUserFacts отбрасывает запись без id', () => {
        expect(toUserFacts({ ACTIVE: true })).toEqual([]);
        expect(
            toUserFacts(userRow({ UF_EMPLOYMENT_DATE: '2026-04-01' })),
        ).toEqual([
            {
                managerId: '10',
                active: true,
                employmentDate: '2026-04-01',
                registerDate: null,
                lastActivityAt: null,
            },
        ]);
    });

    it('в @Injectable нет this.bitrix: инстанс берётся на вызов', async () => {
        const { loader, pbx } = makeLoader({
            users: [userRow({ UF_EMPLOYMENT_DATE: '2026-04-01' })],
        });

        await loader.load(DOMAIN, [10], { until: UNTIL });

        expect(Object.keys(loader)).not.toContain('bitrix');
        expect(pbx.init).toHaveBeenCalledTimes(1);
        expect(pbx.init).toHaveBeenCalledWith(DOMAIN);
    });

    it('факты из кэша — портал не опрашивается', async () => {
        const { loader, userGet } = makeLoader({
            cached: [
                {
                    managerId: '10',
                    active: true,
                    employmentDate: '2026-03-01',
                    registerDate: null,
                    lastActivityAt: null,
                },
            ],
        });

        const { passports, bitrixCalls } = await loader.load(DOMAIN, [10], {
            until: UNTIL,
            now: NOW,
        });

        expect(userGet).not.toHaveBeenCalled();
        expect(bitrixCalls).toBe(0);
        expect(passports[0].tenureBand).toBe('6-18');
    });

    it('пустой ростер — портал не опрашивается, паспортов нет', async () => {
        const { loader, userGet } = makeLoader({ ids: [] });

        const { passports, bitrixCalls } = await loader.load(DOMAIN, [], {
            until: UNTIL,
        });

        expect(passports).toEqual([]);
        expect(bitrixCalls).toBe(0);
        expect(userGet).not.toHaveBeenCalled();
    });
});
