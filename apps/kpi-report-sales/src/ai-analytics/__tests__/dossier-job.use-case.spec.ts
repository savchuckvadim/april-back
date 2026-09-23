import { AI_ANALYTICS_WS_EVENTS } from '../constants/ai-analytics.const';
import {
    AI_DOSSIER_REASONS,
    AI_DOSSIER_SECTIONS,
    AI_DOSSIER_TTL_SECONDS,
} from '../constants/ai-dossier.const';
import { AI_ANALYTICS_CALC_VERSION } from '../constants/ai-overview.const';
import type { DossierSources } from '../domain/loaders/dossier-sources.loader';
import { DossierJobUseCase } from '../domain/use-cases/dossier-job.use-case';
import type { AiDossierJobData } from '../dto/ai-dossier.dto';

const DOMAIN = 'april.bitrix24.ru';
const MANAGER = '512';
const NOW = new Date('2026-09-22T06:15:00.000Z');
const KEY =
    'sales-ai-analytics:v1:april.bitrix24.ru:dossier:512:2026-07_2026-09';

const job = (overrides: Partial<AiDossierJobData> = {}): AiDossierJobData => ({
    domain: DOMAIN,
    managerId: MANAGER,
    months: ['2026-07', '2026-08', '2026-09'],
    requestKey: KEY,
    socketId: 'sock',
    ...overrides,
});

/** Пустые источники: ни одного снапшота, ни меток, ни реакций. */
const emptySources = (): DossierSources => ({
    months: [],
    weeks: [],
    style: null,
    styleOptOut: false,
    readiness: null,
    feedback: [],
    ropMarks: [],
    snapshotIds: [],
});

/** Источники с месяцем, неделей, меткой и реакцией — «всё на месте». */
const fullSources = (): DossierSources => ({
    months: [
        {
            id: 'm-1',
            periodKey: '2026-09',
            managerId: MANAGER,
            generatedAt: '2026-09-21T00:00:00.000Z',
            payload: {
                n: 40,
                score: { value: 7.5, n: 40, confidence: { level: 'ok' } },
                passport: {
                    since: '2025-04-01',
                    sinceSource: 'employment-date',
                    status: 'active',
                    leftAt: null,
                    level: 'middle',
                    tenureMonths: 17,
                    tenureBand: 'experienced',
                },
            },
        },
    ],
    weeks: [
        {
            id: 'w-1',
            periodKey: '2026-W38',
            managerId: MANAGER,
            generatedAt: '2026-09-21T00:00:00.000Z',
            payload: {
                n: 11,
                score: { value: 7.1, n: 11, confidence: { level: 'low' } },
                objections: [
                    {
                        category: 'price',
                        n: 3,
                        calls: 2,
                        handledRatePct: {
                            value: 66,
                            n: 3,
                            confidence: { level: 'low' },
                        },
                        outcomes: {
                            continued: 2,
                            converted: 1,
                            disengaged: 0,
                            other: 0,
                        },
                    },
                ],
            },
        },
    ],
    style: null,
    styleOptOut: false,
    readiness: {
        mode: 'norms',
        historyMonths: 6,
        presentations: 140,
        sales: 22,
        comparableFrom: '2026-03-01',
        reasons: [],
        betaSource: 'none',
        betaCountdown: null,
    },
    feedback: [
        { kind: 'useful', managerId: MANAGER },
        { kind: 'useful', managerId: MANAGER },
        { kind: 'disagree', managerId: MANAGER },
        { kind: 'useful', managerId: '447' },
    ],
    ropMarks: [
        {
            managerId: MANAGER,
            agree: true,
            ropScore: 8,
            sections: ['needs', 'closing'],
        },
        {
            managerId: MANAGER,
            agree: false,
            ropScore: 6,
            sections: ['needs'],
        },
    ],
    snapshotIds: ['w-1', 'm-1'],
});

function makeJob(sources: DossierSources, loadFails = false) {
    const load = loadFails
        ? jest.fn().mockRejectedValue(new Error('ais недоступна'))
        : jest.fn().mockResolvedValue(sources);
    const setJson = jest.fn().mockResolvedValue(undefined);
    const sendToClient = jest.fn();
    const useCase = new DossierJobUseCase(
        { load } as never,
        { setJson } as never,
        { sendToClient } as never,
    );

    return { useCase, load, setJson, sendToClient };
}

/** Коды причин по разделам — удобный вид для ожиданий. */
const reasonsOf = (
    reasons: readonly { section: string; reason: string }[],
): Record<string, string> =>
    Object.fromEntries(reasons.map(item => [item.section, item.reason]));

describe('DossierJobUseCase: сборка досье в воркере', () => {
    it('полные источники: разделы собраны, счётчики сходятся с фикстурой', async () => {
        const { useCase } = makeJob(fullSources());
        const dto = await useCase.execute(job(), NOW);

        expect(dto.managerId).toBe(MANAGER);
        expect(dto.passport).toEqual({
            managerId: MANAGER,
            since: '2025-04-01',
            sinceSource: 'employment-date',
            status: 'active',
            leftAt: null,
            level: 'middle',
            tenureMonths: 17,
            tenureBand: 'experienced',
        });
        expect(dto.series).toEqual({
            weeks: [
                {
                    periodKey: '2026-W38',
                    n: 11,
                    score: { value: 7.1, n: 11, confidence: { level: 'low' } },
                },
            ],
            months: [
                {
                    periodKey: '2026-09',
                    n: 40,
                    score: { value: 7.5, n: 40, confidence: { level: 'ok' } },
                },
            ],
        });
        // Реакция чужого менеджера в свод не попадает: 3 из 4.
        expect(dto.feedbackSummary).toEqual({
            total: 3,
            byKind: { useful: 2, disagree: 1 },
        });
        expect(dto.ropMarks).toEqual({
            total: 2,
            agree: 1,
            // (8 + 6) / 2 = 7.
            ropScore: { value: 7, n: 2, confidence: { level: 'ok' } },
            // needs встретился дважды, closing — один раз.
            sections: ['needs', 'closing'],
        });
        expect(dto.objections).toEqual([
            expect.objectContaining({ category: 'price', n: 3, calls: 2 }),
        ]);
        expect(dto.readiness?.mode).toBe('norms');
        expect(dto.meta).toEqual({
            calcVersion: AI_ANALYTICS_CALC_VERSION,
            snapshotIds: ['m-1', 'w-1'],
            generatedAt: NOW.toISOString(),
            months: ['2026-07', '2026-08', '2026-09'],
        });
    });

    it('разделы соседних потоков пусты с причиной section-not-available', async () => {
        const { useCase } = makeJob(fullSources());
        const dto = await useCase.execute(job(), NOW);

        expect(dto.trends).toBeNull();
        expect(dto.planFact).toBeNull();
        expect(dto.yoy).toBeNull();
        const codes = reasonsOf(dto.reasons);
        for (const code of [
            AI_DOSSIER_SECTIONS.trends,
            AI_DOSSIER_SECTIONS.planFact,
            AI_DOSSIER_SECTIONS.yoy,
        ]) {
            expect(codes[code]).toBe(AI_DOSSIER_REASONS.sectionNotAvailable);
        }
        // У каждой причины есть человеческая подпись.
        for (const reason of dto.reasons) {
            expect(reason.text.length).toBeGreaterThan(0);
        }
    });

    it('снапшотов нет: досье собирается целиком, каждый раздел — null с причиной', async () => {
        const { useCase, setJson, sendToClient } = makeJob(emptySources());
        const dto = await useCase.execute(job(), NOW);

        expect(dto.passport).toBeNull();
        expect(dto.series).toBeNull();
        expect(dto.style).toBeNull();
        expect(dto.objections).toBeNull();
        expect(dto.feedbackSummary).toBeNull();
        expect(dto.ropMarks).toBeNull();
        expect(dto.readiness).toBeNull();
        const codes = reasonsOf(dto.reasons);
        expect(codes[AI_DOSSIER_SECTIONS.passport]).toBe(
            AI_DOSSIER_REASONS.noSnapshots,
        );
        expect(codes[AI_DOSSIER_SECTIONS.readiness]).toBe(
            AI_DOSSIER_REASONS.noSnapshots,
        );
        // Все десять разделов пусты — значит, десять причин.
        expect(dto.reasons).toHaveLength(
            Object.keys(AI_DOSSIER_SECTIONS).length,
        );
        expect(setJson).toHaveBeenCalledTimes(1);
        expect(sendToClient).toHaveBeenCalledTimes(1);
    });

    it('отказ от профилирования: карточка стиля со статусом opt_out и причина', async () => {
        const { useCase } = makeJob({
            ...emptySources(),
            styleOptOut: true,
        });
        const dto = await useCase.execute(job(), NOW);

        expect(dto.style?.status).toBe('opt_out');
        expect(reasonsOf(dto.reasons)[AI_DOSSIER_SECTIONS.style]).toBe(
            AI_DOSSIER_REASONS.styleOptOut,
        );
    });

    it('успех: write-through в кэш с TTL живого окна и WS :done', async () => {
        const { useCase, setJson, sendToClient } = makeJob(fullSources());
        const dto = await useCase.execute(job(), NOW);

        expect(setJson).toHaveBeenCalledWith(
            KEY,
            { status: 'ready', data: dto },
            AI_DOSSIER_TTL_SECONDS.live,
        );
        expect(sendToClient).toHaveBeenCalledWith('sock', {
            event: AI_ANALYTICS_WS_EVENTS.DOSSIER_DONE,
            data: { requestKey: KEY, generatedAt: NOW.toISOString() },
        });
    });

    it('окно из закрытых месяцев кладётся в кэш надолго', async () => {
        const { useCase, setJson } = makeJob(fullSources());
        await useCase.execute(
            job({ months: ['2026-05', '2026-06', '2026-07'] }),
            NOW,
        );

        expect(setJson).toHaveBeenCalledWith(
            KEY,
            expect.objectContaining({ status: 'ready' }),
            AI_DOSSIER_TTL_SECONDS.closed,
        );
    });

    it('падение источников: error-конверт 120 с, WS :error и rethrow', async () => {
        const { useCase, setJson, sendToClient } = makeJob(
            emptySources(),
            true,
        );

        await expect(useCase.execute(job(), NOW)).rejects.toThrow(
            'ais недоступна',
        );
        expect(setJson).toHaveBeenCalledWith(
            KEY,
            { status: 'error', message: 'ais недоступна' },
            AI_DOSSIER_TTL_SECONDS.error,
        );
        expect(sendToClient).toHaveBeenCalledWith('sock', {
            event: AI_ANALYTICS_WS_EVENTS.DOSSIER_ERROR,
            data: { requestKey: KEY, message: 'ais недоступна' },
        });
    });

    it('без socketId WS не шлётся, но кэш пишется', async () => {
        const { useCase, setJson, sendToClient } = makeJob(fullSources());
        await useCase.execute(job({ socketId: undefined }), NOW);

        expect(sendToClient).not.toHaveBeenCalled();
        expect(setJson).toHaveBeenCalledTimes(1);
    });

    it('ошибка записи кэша не роняет джобу и не отменяет WS', async () => {
        const { useCase, setJson, sendToClient } = makeJob(fullSources());
        setJson.mockRejectedValueOnce(new Error('redis недоступен'));

        await expect(useCase.execute(job(), NOW)).resolves.toMatchObject({
            managerId: MANAGER,
        });
        expect(sendToClient).toHaveBeenCalledTimes(1);
    });
});
