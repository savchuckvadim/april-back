import {
    EnumPortalAppCode,
    getPortalAppDefaults,
} from '@lib/portal-lib/store/app-settings';
import {
    ropPeriodByKey,
    RopPeriodKind,
    ropPeriodWindow,
} from '@lib/rop-reports';
import {
    DEFAULT_WORK_CALENDAR,
    defaultAttentionThresholds,
    minDurationMapOf,
    type DatedLiteRow,
    type ManagerDigestCard,
} from '@lib/sales-ai-analytics';
import { ETimeZone } from '@lib/shared/lib/date';
import { periodDigestOptionsOf } from '../lib/period-digest-options';
import { PeriodDigestCardsService } from '../services/period-digest-cards.service';

const DOMAIN = 'garant.bitrix24.ru';
const TZ = ETimeZone.EUROPE_MOSCOW;

const row = (id: string, managerId: string, at: string): DatedLiteRow => ({
    transcriptionId: id,
    managerId,
    callStartedAt: new Date(at),
    durationSec: 600,
    callType: 'call',
    analysisPresent: true,
    score: 70,
    nextStep: { set: true, date: '2026-10-20' },
    riskFlags: [],
    coachingPriority: 'none',
    sections: [],
    objections: [],
    versions: null,
});

const DEPARTMENTS = [
    {
        ID: 7,
        NAME: 'ОП 1',
        USERS: [
            { ID: 10, NAME: 'Анна', LAST_NAME: 'Иванова' },
            { ID: 11, NAME: 'Сергей', LAST_NAME: 'Петров' },
        ],
    },
];

const windowOf = (kind: RopPeriodKind, key: string) => {
    const period = ropPeriodByKey(kind, key);
    if (!period) throw new Error(`нет периода ${key}`);
    return ropPeriodWindow(period, TZ);
};

const build = (
    setup: { structureFails?: boolean; calendarTimeZone?: string } = {},
) => {
    const settings = {
        resolveAnalytics: jest.fn().mockResolvedValue({
            calendar: {
                ...DEFAULT_WORK_CALENDAR,
                timeZone:
                    setup.calendarTimeZone ?? DEFAULT_WORK_CALENDAR.timeZone,
            },
            thresholds: defaultAttentionThresholds(),
            minDurationByType: minDurationMapOf(60),
        }),
    };
    const source = {
        rows: jest
            .fn()
            .mockResolvedValueOnce([
                row('p1', '10', '2026-09-15T08:00:00Z'),
                row('c1', '10', '2026-10-06T08:00:00Z'),
                row('x1', '99', '2026-10-06T09:00:00Z'),
            ])
            .mockResolvedValue([]),
        salesDepartments: setup.structureFails
            ? jest.fn().mockRejectedValue(new Error('нет доступа'))
            : jest.fn().mockResolvedValue(DEPARTMENTS),
    };
    const store = {
        read: jest.fn().mockResolvedValue(new Map<string, ManagerDigestCard>()),
        save: jest
            .fn()
            .mockResolvedValue({ created: 2, updated: 0, unchanged: 0 }),
    };
    const service = new PeriodDigestCardsService(
        settings as never,
        source as never,
        store as never,
    );
    const heartbeat = jest.fn().mockResolvedValue(undefined);
    const warnings: string[] = [];
    const run = (kind: RopPeriodKind, key: string) =>
        service.run(
            {
                domain: DOMAIN,
                period: windowOf(kind, key),
                timezone: TZ,
                options: periodDigestOptionsOf(
                    getPortalAppDefaults(EnumPortalAppCode.eventSales),
                ),
                now: new Date('2026-11-17T10:00:00Z'),
                heartbeat,
            },
            warnings,
        );
    return { source, store, heartbeat, run, warnings };
};

describe('расчёт карточек итогов периода портала', () => {
    it('пояс календаря AI-аналитики разошёлся с поясом портала — одна строка предупреждения', async () => {
        const same = build();
        await same.run('month', '2026-10');
        expect(same.warnings).toEqual([]);

        const different = build({ calendarTimeZone: 'Asia/Novosibirsk' });
        await different.run('month', '2026-10');
        expect(different.warnings).toHaveLength(1);
        expect(different.warnings[0]).toContain(
            'пояс календаря AI-аналитики (Asia/Novosibirsk) не совпадает с поясом портала (Europe/Moscow)',
        );
    });

    it('месяц: звонки прошлого и текущего месяца одним окном, год назад — отдельно, прошлые карточки по ключу', async () => {
        const { source, store, heartbeat, run } = build();

        const report = await run('month', '2026-10');

        const september = windowOf('month', '2026-09');
        const october = windowOf('month', '2026-10');
        const lastYear = windowOf('month', '2025-10');
        expect(source.rows).toHaveBeenNthCalledWith(
            1,
            DOMAIN,
            september.fromAt,
            october.toAt,
        );
        expect(source.rows).toHaveBeenNthCalledWith(
            2,
            DOMAIN,
            lastYear.fromAt,
            lastYear.toAt,
        );
        expect(store.read).toHaveBeenCalledTimes(1);
        expect(store.read).toHaveBeenCalledWith(DOMAIN, 'month', '2026-09');
        expect(heartbeat).toHaveBeenCalledTimes(2);
        expect(report.managers).toBe(2);
        expect(report.saved).toEqual({ created: 2, updated: 0, unchanged: 0 });
    });

    it('карточки — по сотрудникам отделов продаж; звонки разделены по периодам', async () => {
        const { store, run } = build();

        await run('month', '2026-10');

        const [, cards] = store.save.mock.calls[0] as [
            string,
            ManagerDigestCard[],
        ];
        expect(cards.map(card => card.managerId)).toEqual(['10', '11']);
        expect(cards[0]).toMatchObject({
            period: { kind: 'month', key: '2026-10' },
            metrics: { recorded: 1 },
            previous: {
                periodKey: '2026-09',
                analyzed: { before: { value: 1 } },
            },
        });
        // Звонившего вне отделов продаж без прошлой карточки — нет.
        expect(cards.map(card => card.managerId)).not.toContain('99');
        expect(cards[1]).toMatchObject({
            readiness: 'no_calls',
            previous: null,
        });
    });

    it('неделя: прошлая неделя и карточки последнего закрытого месяца', async () => {
        const { source, store, run } = build();

        await run('week', '2026-W46');

        expect(source.rows).toHaveBeenCalledTimes(1);
        expect(store.read).toHaveBeenCalledWith(DOMAIN, 'week', '2026-W45');
        expect(store.read).toHaveBeenCalledWith(DOMAIN, 'month', '2026-10');
    });

    it('структура не прочитана — прогон падает и повторится, ничего не сохраняется', async () => {
        const { store, run } = build({ structureFails: true });

        await expect(run('month', '2026-10')).rejects.toThrow('нет доступа');
        expect(store.save).not.toHaveBeenCalled();
    });
});
