import { AnalyticsCallLiteRow } from '@lib/call-lib';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    type SnapshotReadiness,
} from '@lib/sales-ai-analytics';
import {
    settingsPhase4FieldsOf,
    toHypothesisDto,
} from '../domain/presenter/settings-phase4.presenter';
import {
    poolConsentOf,
    savePoolConsent,
} from '../domain/use-cases/settings-pool.util';
import { SettingsUseCase } from '../domain/use-cases/settings.use-case';
import type {
    AiAnalyticsSnapshotRecord,
    AiAnalyticsSnapshotStore,
} from '../store/ai-analytics-snapshot.store';
import {
    callsLoaderWith,
    liteRow,
    portalSettings,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';
import { portalModel } from './fixtures/norms.fixture';
import { backtestSnapshot } from './fixtures/phase4-snapshots.fixture';

/**
 * Настройки витрины Фазы 4: гипотеза и согласие на пул в ответе
 * `settings/get`, блок `pool` сохранения (дата согласия — день портала)
 * и ступени готовности L4/L5 из последних снапшотов с флагами портала.
 */
const NOW = new Date('2026-09-05T09:00:00Z');
const DAY = 86_400_000;

const presentations = (
    count: number,
    daysAgo: number,
): AnalyticsCallLiteRow[] =>
    Array.from({ length: count }, (_, index) =>
        liteRow({
            transcriptionId: `p${daysAgo}-${index}`,
            callType: 'presentation',
            callStartedAt: new Date(NOW.getTime() - daysAgo * DAY),
        }),
    );

const record = (type: string, payload: unknown): AiAnalyticsSnapshotRecord =>
    ({
        id: `ais-${type}`,
        domain: 'd',
        type,
        periodKey: '2026-09',
        managerId: null,
        calcVersion: 'v1',
        paramsVersion: 'pv-1',
        inputsHash: 'h',
        generatedAt: '2026-09-05T01:00:00Z',
        createdAt: new Date('2026-09-05T01:00:00Z'),
        status: 'done',
        payload,
    }) as AiAnalyticsSnapshotRecord;

const MODEL_READINESS: SnapshotReadiness = {
    mode: 'norms',
    historyMonths: 6,
    presentations: 420,
    sales: 31,
    comparableFrom: '',
    reasons: [],
};

/** Стор: модель портала по ключам и последняя проверка точности прогноза. */
function storeWith(options: {
    calendarSource?: string;
    backtest?: boolean;
}): AiAnalyticsSnapshotStore {
    const model = record(
        AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
        portalModel({
            window: Array.from({ length: 12 }, (_, index) => `m-${index}`),
            readiness: {
                ...MODEL_READINESS,
                ...(options.calendarSource === undefined
                    ? {}
                    : { calendarSource: options.calendarSource }),
            } as SnapshotReadiness,
        }),
    );
    const findByKeys = jest.fn((_domain: string, type: string) =>
        Promise.resolve(
            type === AI_ANALYTICS_SNAPSHOT_TYPE.portalModel
                ? [model]
                : type === AI_ANALYTICS_SNAPSHOT_TYPE.forecastBacktest &&
                    options.backtest === true
                  ? [record(type, backtestSnapshot())]
                  : [],
        ),
    );
    const latest = jest.fn((_domain: string, type: string) =>
        Promise.resolve(
            type === AI_ANALYTICS_SNAPSHOT_TYPE.forecastBacktest &&
                options.backtest === true
                ? record(type, backtestSnapshot())
                : null,
        ),
    );
    return { findByKeys, latest } as unknown as AiAnalyticsSnapshotStore;
}

const LEVELS = [
    { managerId: 10, level: 'middle', since: null, source: 'manual' },
] as never;

async function execute(
    settings: Parameters<typeof settingsLoaderWith>[0],
    store: AiAnalyticsSnapshotStore,
) {
    const { loader } = callsLoaderWith([
        ...presentations(30, 10),
        ...presentations(80, 100),
    ]);

    return new SettingsUseCase(
        loader,
        settingsLoaderWith({ levels: LEVELS, ...settings }),
        store,
    ).execute('d', { now: NOW });
}

describe('settings/get: гипотеза и согласие на пул', () => {
    it('гипотеза без пустых даты и автора, согласие как в настройках', () => {
        expect(
            settingsPhase4FieldsOf(
                portalSettings({
                    hypothesis: {
                        pairs: [
                            { s: 6, n: 40 },
                            { s: 8, n: 30 },
                        ],
                        since: '',
                        author: '447',
                    },
                    poolOptIn: true,
                    poolConsentAt: '2026-09-01',
                }),
            ),
        ).toEqual({
            hypothesis: {
                pairs: [
                    { s: 6, n: 40 },
                    { s: 8, n: 30 },
                ],
                author: '447',
            },
            pool: { optIn: true, consentAt: '2026-09-01' },
        });
        expect(toHypothesisDto(null)).toBeNull();
    });

    it('ответ use-case несёт hypothesis и pool', async () => {
        const dto = await execute(
            { poolOptIn: false, poolConsentAt: null },
            storeWith({}),
        );
        expect(dto).toMatchObject({
            hypothesis: null,
            pool: { optIn: false, consentAt: null },
        });
    });
});

describe('settings/save: блок pool', () => {
    it('включение — день портала, выключение — пустая строка', () => {
        expect(poolConsentOf({ optIn: true }, '2026-09-05')).toEqual({
            optIn: true,
            consentAt: '2026-09-05',
        });
        expect(poolConsentOf({ optIn: false }, '2026-09-05')).toEqual({
            optIn: false,
            consentAt: '',
        });
        expect(poolConsentOf(undefined, '2026-09-05')).toBeNull();
    });

    it('повторное включение не сдвигает дату согласия', () => {
        expect(
            poolConsentOf({ optIn: true }, '2026-09-05', {
                optIn: true,
                consentAt: '2026-08-01T00:00:00.000Z',
            }),
        ).toEqual({ optIn: true, consentAt: '2026-08-01' });
        expect(
            poolConsentOf({ optIn: true }, '2026-09-05', {
                optIn: false,
                consentAt: '2026-08-01',
            }),
        ).toEqual({ optIn: true, consentAt: '2026-09-05' });
    });

    it('пишет через стор только при пришедшем блоке', async () => {
        const savePool = jest.fn().mockResolvedValue(undefined);
        await expect(
            savePoolConsent({ savePool }, 'd', undefined, '2026-09-05'),
        ).resolves.toBeNull();
        expect(savePool).not.toHaveBeenCalled();

        await savePoolConsent({ savePool }, 'd', { optIn: true }, '2026-09-05');
        expect(savePool).toHaveBeenCalledWith('d', {
            optIn: true,
            consentAt: '2026-09-05',
        });
    });
});

describe('settings/get: готовность Фазы 4', () => {
    it('ни снапшотов ступеней, ни флагов — режим по лестнице Фазы 2', async () => {
        const dto = await execute({ holidays: ['2026-01-01'] }, storeWith({}));
        expect(dto.readiness.mode).toBe('norms');
        expect(dto.readiness.reasons).toEqual([]);
    });

    it('прогноз проверен, флаг включён в параметрах модели — forecast', async () => {
        const dto = await execute(
            {
                holidays: ['2026-01-01'],
                modelParams: { forecast_stage_enabled: true },
            } as never,
            storeWith({ backtest: true }),
        );
        expect(dto.readiness.mode).toBe('forecast');
    });

    it('флаг выключен — нормы с причиной «ступень выключена»', async () => {
        const dto = await execute(
            { holidays: ['2026-01-01'] },
            storeWith({ backtest: true }),
        );
        expect(dto.readiness.mode).toBe('norms');
        expect(dto.readiness.reasons).toEqual(['forecast-stage-disabled']);
    });

    it('источник календаря модели важнее праздников ключа настроек', async () => {
        const fallback = await execute(
            { holidays: ['2026-01-01'] },
            storeWith({ calendarSource: 'fallback' }),
        );
        const imported = await execute(
            { holidays: [] },
            storeWith({ calendarSource: 'import' }),
        );
        expect(fallback.readiness.mode).toBe('descriptive');
        expect(fallback.readiness.reasons).toContain('calendar-not-imported');
        expect(imported.readiness.mode).toBe('norms');
    });
});
