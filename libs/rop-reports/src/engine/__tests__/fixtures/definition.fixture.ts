import { ETimeZone } from '@lib/shared/lib/date';
import {
    ROP_PERIOD_KIND,
    RopPeriod,
    RopPeriodKind,
    ropPeriodByKey,
} from '../../../period/rop-period';
import { RopDuePolicy } from '../../../period/rop-schedule';
import { RopPortalCalendar } from '../../../ports/rop-calendar.port';
import { ropKeys } from '../../../state/rop-keys';
import { RopRunStateService } from '../../../state/rop-run-state.service';
import { FakeRedis } from '../../../state/__tests__/fixtures/fake-redis.fixture';
import {
    RopCommonOptions,
    RopReportDefinition,
    RopRunContext,
    RopRunResult,
} from '../../rop-report.definition';

export const DOMAIN = 'gsr.bitrix24.ru';
export const KEYS = ropKeys('test:report');

export const period = (kind: RopPeriodKind, key: string): RopPeriod => {
    const found = ropPeriodByKey(kind, key);
    if (!found) throw new Error(`нет периода ${key}`);
    return found;
};

export const WEEK_46 = period(ROP_PERIOD_KIND.week, '2026-W46');
export const OCTOBER = period(ROP_PERIOD_KIND.month, '2026-10');

/** Политика, которая всегда отдаёт заданный период (или «рано»). */
export const fixedPolicy = (due: RopPeriod | null): RopDuePolicy => ({
    kind: due?.kind ?? ROP_PERIOD_KIND.week,
    due: () => due,
});

export const PORTAL: RopPortalCalendar = {
    timezone: ETimeZone.EUROPE_MOSCOW,
    calendar: { isWorkday: () => true },
    deadline: now => now,
};

export const result = (patch: Partial<RopRunResult> = {}): RopRunResult => ({
    domain: DOMAIN,
    kind: ROP_PERIOD_KIND.week,
    periodKey: WEEK_46.key,
    countOnly: false,
    recipients: 2,
    tasksCreated: 2,
    tasksAlreadyDone: 0,
    tasksClosed: 1,
    summary: ['Карточек менеджеров: 6, мало данных: 1'],
    warnings: [],
    ...patch,
});

export type RunMock = jest.Mock<
    Promise<RopRunResult>,
    [RopRunContext<RopCommonOptions>, string[]]
>;

export interface DefinitionSetup {
    readonly definition: RopReportDefinition<RopCommonOptions>;
    readonly run: RunMock;
    readonly resolveOptions: jest.Mock<
        Promise<RopCommonOptions>,
        [string, { countOnly?: boolean }]
    >;
    readonly enabledDomains: jest.Mock<Promise<string[]>, []>;
    readonly resolveCalendar: jest.Mock<Promise<RopPortalCalendar>, [string]>;
    readonly redis: FakeRedis;
    readonly state: RopRunStateService;
}

/** Определение отчёта на моках и настоящее состояние на Redis в памяти. */
export function makeDefinition(
    options: Partial<RopCommonOptions> = {},
): DefinitionSetup {
    const run: RunMock = jest.fn<
        Promise<RopRunResult>,
        [RopRunContext<RopCommonOptions>, string[]]
    >(context =>
        Promise.resolve(
            result({
                kind: context.period.kind,
                periodKey: context.period.key,
                countOnly: context.mode.countOnly,
            }),
        ),
    );
    const resolveOptions = jest.fn(
        (
            _domain: string,
            overrides: { countOnly?: boolean },
        ): Promise<RopCommonOptions> =>
            Promise.resolve({
                countOnly: overrides.countOnly ?? options.countOnly ?? false,
                policies: options.policies ?? [fixedPolicy(WEEK_46)],
            }),
    );
    const enabledDomains = jest.fn(
        (): Promise<string[]> => Promise.resolve([DOMAIN]),
    );
    const resolveCalendar = jest.fn<Promise<RopPortalCalendar>, [string]>(() =>
        Promise.resolve(PORTAL),
    );
    const redis = new FakeRedis();
    return {
        definition: {
            code: 'test-report',
            title: 'Итоги периода по менеджерам',
            keys: KEYS,
            maxAttempts: 5,
            calendar: { resolve: resolveCalendar },
            enabledDomains,
            resolveOptions,
            run,
        },
        run,
        resolveOptions,
        enabledDomains,
        resolveCalendar,
        redis,
        state: new RopRunStateService(redis.service()),
    };
}
