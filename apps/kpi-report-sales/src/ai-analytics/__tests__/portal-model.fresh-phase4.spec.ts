import 'reflect-metadata';
import type { PoolSnapshot } from '@lib/sales-ai-analytics';
import type {
    PortalManagerMonth,
    PortalModelPayload,
} from '../domain/assembler/portal-model.types';
import type { PortalModelRecord } from '../domain/loaders/portal-model.loader';
import type { AiAnalyticsPortalSettings } from '../domain/loaders/settings.loader';
import { phase4InputsKeyOf } from '../domain/use-cases/portal-model.inputs';
import { PortalModelUseCase } from '../domain/use-cases/portal-model.use-case';
import {
    PHASE4_META,
    poolSnapshot,
    qualityLinkSnapshot,
} from './fixtures/phase4-snapshots.fixture';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';

/**
 * Идемпотентность модели портала и входы Фазы 4: повтор прогона за тот же
 * месяц переиспользует модель только при том же пуле (с учётом согласия) и
 * той же связи качества. После отзыва согласия или смены состава пула
 * модель пересчитывается, а не отдаётся из прошлой записи.
 */
const DOMAIN = 'a.bitrix24.ru';
const MONTH = '2026-09';
const NOW = new Date('2026-10-03T01:00:00Z');
const EDGE = 'call_to_presentation';
const CONSENT = { poolOptIn: true, poolConsentAt: '2026-01-10' } as const;

/** Окно: шесть месяцев по пять менеджеров. */
function months(): PortalManagerMonth[] {
    const keys = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', MONTH];

    return keys.flatMap(monthKey =>
        Array.from({ length: 5 }, (unused, index) => ({
            monthKey,
            managerId: String(11 + index),
            tenureBand: '6-18',
            edges: [{ edge: EDGE, n: 100 + index, s: 18 + index }],
            excludeFromNorms: false,
            workedDays: 20,
            daysSource: 'calendar' as const,
            callsDone: 400,
            presentations: 18 + index,
            salesCount: 3,
            averageCheck: 100_000,
            planSales: null,
            level: 'middle',
            score: { value: 7, n: 30 },
        })),
    );
}

function makeUseCase(
    previous: PortalModelRecord | null,
    settings: Partial<AiAnalyticsPortalSettings> = CONSENT,
): { useCase: PortalModelUseCase; upsert: jest.Mock } {
    const loader = {
        loadMonths: jest.fn().mockResolvedValue(months()),
        latestModel: jest.fn().mockResolvedValue(previous),
        loadModel: jest.fn().mockResolvedValue(null),
    };
    const upsert = jest.fn().mockResolvedValue({ id: 'ais-9' });
    const params = {
        load: jest.fn().mockResolvedValue({
            ctx: {},
            paramsVersion: 'pv-1',
            comparableFrom: '',
        }),
    };

    return {
        useCase: new PortalModelUseCase(
            settingsLoaderWith(settings),
            params as never,
            loader as never,
            { upsert } as never,
            { savePortalSettings: jest.fn() } as never,
        ),
        upsert,
    };
}

/** Первый прогон месяца с пулом на шине — запись модели, которую увидит повтор. */
async function firstModel(pool: PoolSnapshot): Promise<PortalModelRecord> {
    const { useCase } = makeUseCase(null);
    const result = await useCase.execute(
        { domain: DOMAIN, monthKey: MONTH, facts: { pool } },
        NOW,
    );

    return {
        id: 'ais-9',
        monthKey: MONTH,
        payload: result.payload as PortalModelPayload,
    };
}

describe('PortalModelUseCase — свежесть модели и входы Фазы 4', () => {
    it('тот же пул за тот же месяц — модель не переписывается', async () => {
        const previous = await firstModel(poolSnapshot());
        expect(previous.payload.pool).not.toBeNull();
        expect(previous.payload.signature?.phase4InputsKey).toEqual(
            expect.any(String),
        );
        const { useCase, upsert } = makeUseCase(previous);

        const result = await useCase.execute(
            {
                domain: DOMAIN,
                monthKey: MONTH,
                facts: { pool: poolSnapshot() },
            },
            NOW,
        );

        expect(upsert).not.toHaveBeenCalled();
        expect(result).toMatchObject({ id: 'ais-9', written: 0 });
    });

    it('пул пересобран с другим моментом записи — модель не переписывается', async () => {
        const previous = await firstModel(poolSnapshot());
        const { useCase, upsert } = makeUseCase(previous);
        const rebuilt = poolSnapshot({
            meta: { ...PHASE4_META, generatedAt: '2026-10-03T02:00:00.000Z' },
        });

        const result = await useCase.execute(
            { domain: DOMAIN, monthKey: MONTH, facts: { pool: rebuilt } },
            NOW,
        );

        expect(upsert).not.toHaveBeenCalled();
        expect(result.written).toBe(0);
    });

    it('состав пула сменился (портал отозвал согласие) — модель пересчитывается', async () => {
        const previous = await firstModel(poolSnapshot());
        const { useCase, upsert } = makeUseCase(previous);
        const shrunk = poolSnapshot({
            eligible: 3,
            lognormal: { m: 10.5, v: 0.4, n: 250 },
            portals: [
                { portalKey: 'self-key', included: true, reason: 'included' },
            ],
        });

        const result = await useCase.execute(
            { domain: DOMAIN, monthKey: MONTH, facts: { pool: shrunk } },
            NOW,
        );

        expect(upsert).toHaveBeenCalledTimes(1);
        expect(result.written).toBe(1);
        expect(result.payload?.signature.phase4InputsKey).not.toBe(
            previous.payload.signature?.phase4InputsKey,
        );
    });

    it('портал сам отозвал согласие — повтор месяца пересчитывает модель без пула', async () => {
        const previous = await firstModel(poolSnapshot());
        const { useCase, upsert } = makeUseCase(previous, {
            poolOptIn: false,
            poolConsentAt: null,
        });

        const result = await useCase.execute(
            {
                domain: DOMAIN,
                monthKey: MONTH,
                facts: { pool: poolSnapshot() },
            },
            NOW,
        );

        expect(upsert).toHaveBeenCalledTimes(1);
        expect(result.written).toBe(1);
        expect(result.payload?.pool ?? null).toBeNull();
    });

    it('модель без отпечатка входов (записана до правки) — пересчитывается', async () => {
        const previous = await firstModel(poolSnapshot());
        const { phase4InputsKey: unused, ...legacySignature } = previous.payload
            .signature ?? {
            rubricVersion: null,
            scriptHash: null,
            priceMedian: null,
        };
        expect(unused).toEqual(expect.any(String));
        const legacy: PortalModelRecord = {
            ...previous,
            payload: { ...previous.payload, signature: legacySignature },
        };
        const { useCase, upsert } = makeUseCase(legacy);

        const result = await useCase.execute(
            {
                domain: DOMAIN,
                monthKey: MONTH,
                facts: { pool: poolSnapshot() },
            },
            NOW,
        );

        expect(upsert).toHaveBeenCalledTimes(1);
        expect(result.written).toBe(1);
    });
});

describe('phase4InputsKeyOf', () => {
    it('не зависит от порядка ключей и момента записи, зависит от содержимого', () => {
        const pool = poolSnapshot();
        const reordered = Object.fromEntries(
            Object.entries(pool).reverse(),
        ) as unknown as PoolSnapshot;
        const base = phase4InputsKeyOf({ pool, qualityLink: null });

        expect(phase4InputsKeyOf({ pool: reordered, qualityLink: null })).toBe(
            base,
        );
        expect(
            phase4InputsKeyOf({
                pool: poolSnapshot({
                    meta: { ...PHASE4_META, generatedAt: '2027-01-01' },
                }),
                qualityLink: null,
            }),
        ).toBe(base);
        expect(phase4InputsKeyOf({ pool: null, qualityLink: null })).not.toBe(
            base,
        );
        expect(
            phase4InputsKeyOf({ pool, qualityLink: qualityLinkSnapshot() }),
        ).not.toBe(base);
        expect(
            phase4InputsKeyOf({
                pool: poolSnapshot({ lognormal: { m: 11, v: 0.5, n: 301 } }),
                qualityLink: null,
            }),
        ).not.toBe(base);
    });
});
