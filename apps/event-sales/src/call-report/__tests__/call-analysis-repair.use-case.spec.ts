import { CallAnalysisRepairUseCase } from '../use-cases/call-analysis-repair.use-case';
import { repairSummaryLine } from '../cron/call-analysis-repair.scheduler';
import { REPAIR_LEGACY_SINCE } from '../use-cases/call-analysis-repair.util';

/**
 * Догон разборов (требование владельца 10.11.2026): упавшее и неполное
 * переделывается, когда поставщик модели снова отвечает.
 */
const DOMAIN = 'gsirk.bitrix24.ru';
const NOW = new Date(REPAIR_LEGACY_SINCE.getTime() + 20 * 60 * 60 * 1000);

const partialRecord = (over: Record<string, unknown> = {}) => ({
    id: '500',
    type: 'agent-analysis',
    status: 'done',
    transcription_id: 't-1',
    provider: 'call-report-pipeline',
    createdAt: new Date(NOW.getTime() - 60 * 60 * 1000),
    user_result: {
        incompleteParts: ['movement', 'synthesis'],
        callType: 'cold',
        sections: [{ section: 'GREETING' }],
    },
    ...over,
});

const ROW = { id: 't-1', domain: DOMAIN, durationSec: 300, text: 'текст' };

const makeDeps = (over: { open?: boolean; enabled?: boolean } = {}) => {
    const aiService = {
        findByDomainTypesInPeriod: jest
            .fn()
            .mockResolvedValue([partialRecord()]),
        findByTranscriptionIds: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
            id: '501',
            transcription_id: 't-1',
            user_result: { score: 70 },
            provider: 'reanalysis',
        }),
        update: jest.fn().mockResolvedValue(undefined),
    };
    const rerunService = {
        rerun: jest.fn().mockResolvedValue({
            row: ROW,
            dto: {
                callType: 'cold',
                score: 70,
                sections: [{ section: 'GREETING' }, { section: 'CLOSING' }],
                incompleteParts: [],
            },
            usage: {},
        }),
    };
    const smartRewrite = {
        rewrite: jest.fn().mockResolvedValue({ kind: 'written', itemId: 77 }),
    };
    const attempts = new Map<string, number>();
    const store = {
        listFailed: jest.fn().mockResolvedValue([]),
        dropFailed: jest.fn().mockResolvedValue(undefined),
        attempts: jest.fn((id: string) =>
            Promise.resolve(attempts.get(id) ?? 0),
        ),
        bumpAttempt: jest.fn((id: string) => {
            const next = (attempts.get(id) ?? 0) + 1;
            attempts.set(id, next);
            return Promise.resolve(next);
        }),
    };
    const settingsService = {
        resolve: jest.fn().mockResolvedValue({
            enabled: over.enabled ?? true,
            deepAnalysisModel: null,
        }),
    };
    const orderResolver = {
        orderFor: jest
            .fn()
            .mockResolvedValue(['vibecode', 'openai-compatible']),
    };
    const circuitBreaker = {
        isOpen: jest.fn().mockResolvedValue(over.open ?? false),
    };
    const queueDispatcher = { dispatch: jest.fn().mockResolvedValue({}) };
    const callTypeRegistry = {
        resolve: jest.fn().mockResolvedValue({ codes: ['cold', 'call'] }),
    };
    const useCase = new CallAnalysisRepairUseCase(
        aiService as never,
        rerunService as never,
        smartRewrite as never,
        store as never,
        settingsService as never,
        orderResolver as never,
        circuitBreaker as never,
        queueDispatcher as never,
        callTypeRegistry as never,
    );
    return {
        useCase,
        aiService,
        rerunService,
        smartRewrite,
        store,
        attempts,
        circuitBreaker,
        queueDispatcher,
    };
};

describe('CallAnalysisRepairUseCase', () => {
    it('первый поставщик на паузе — портал пропускается, модель не зовём', async () => {
        const { useCase, rerunService } = makeDeps({ open: true });
        const result = await useCase.repairDomain(DOMAIN, NOW);
        expect(result.skipped).toMatch(/vibecode на паузе/);
        expect(rerunService.rerun).not.toHaveBeenCalled();
    });

    it('выключенный конвейер портала — пропуск', async () => {
        const { useCase } = makeDeps({ enabled: false });
        expect((await useCase.repairDomain(DOMAIN, NOW)).skipped).toMatch(
            /выключен/,
        );
    });

    it('неполный разбор переделан полностью: новая запись, старая superseded, карточка переписана', async () => {
        const { useCase, aiService, smartRewrite } = makeDeps();
        const result = await useCase.repairDomain(DOMAIN, NOW);
        expect(result).toMatchObject({ repaired: 1, stillPartial: 0 });
        expect(aiService.create).toHaveBeenCalledTimes(1);
        expect(aiService.update).toHaveBeenCalledWith('500', {
            status: 'superseded',
        });
        expect(smartRewrite.rewrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: '501', transcription_id: 't-1' }),
        );
    });

    it('переразбор опять неполный — старую запись не трогаем, попробуем позже', async () => {
        const { useCase, aiService, rerunService } = makeDeps();
        rerunService.rerun.mockResolvedValue({
            row: ROW,
            dto: { callType: 'cold', incompleteParts: ['synthesis'] },
            usage: {},
        });
        const result = await useCase.repairDomain(DOMAIN, NOW);
        expect(result).toMatchObject({ repaired: 0, stillPartial: 1 });
        expect(aiService.create).not.toHaveBeenCalled();
        expect(aiService.update).not.toHaveBeenCalled();
    });

    it('третья неудачная попытка — звонок брошен; после неё больше не берём', async () => {
        const { useCase, rerunService, attempts } = makeDeps();
        rerunService.rerun.mockResolvedValue(null);
        attempts.set('t-1', 2);
        expect(await useCase.repairDomain(DOMAIN, NOW)).toMatchObject({
            gaveUp: 1,
        });
        rerunService.rerun.mockClear();
        await useCase.repairDomain(DOMAIN, NOW);
        expect(rerunService.rerun).not.toHaveBeenCalled();
    });

    it('звонок без разбора — стадия анализа ставится заново, отметка снимается', async () => {
        const { useCase, store, queueDispatcher, aiService } = makeDeps();
        aiService.findByDomainTypesInPeriod.mockResolvedValue([]);
        store.listFailed.mockResolvedValue([
            {
                payload: {
                    domain: DOMAIN,
                    activityId: 101,
                    dealId: 5,
                    transcriptionId: 't-9',
                },
                failedAt: new Date(
                    NOW.getTime() - 30 * 60 * 1000,
                ).toISOString(),
            },
        ]);
        const result = await useCase.repairDomain(DOMAIN, NOW);
        expect(result.requeued).toBe(1);
        expect(queueDispatcher.dispatch).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            expect.objectContaining({ transcriptionId: 't-9' }),
            expect.stringContaining(':analyze:repair-1'),
            expect.objectContaining({ attempts: 1 }),
        );
        expect(store.dropFailed).toHaveBeenCalledWith(DOMAIN, 't-9');
    });

    /**
     * Ревью 11.11.2026: пока VibeCode на паузе, разборы сразу получают
     * отметку провала — после вечернего наплыва их десятки. При общей
     * квоте 5 они ждали бы сутками и вытесняли переделку неполных.
     */
    it('квоты раздельные: десяток звонков без разбора ставится разом, неполный всё равно переделывается', async () => {
        const { useCase, store, queueDispatcher, rerunService } = makeDeps();
        store.listFailed.mockResolvedValue(
            Array.from({ length: 12 }, (_, index) => ({
                payload: {
                    domain: DOMAIN,
                    activityId: 200 + index,
                    transcriptionId: `t-f${index}`,
                },
                failedAt: new Date(NOW.getTime() - 60_000).toISOString(),
            })),
        );

        const result = await useCase.repairDomain(DOMAIN, NOW);

        expect(result.requeued).toBe(12);
        expect(queueDispatcher.dispatch).toHaveBeenCalledTimes(12);
        expect(result.repaired).toBe(1);
        expect(rerunService.rerun).toHaveBeenCalledTimes(1);
    });

    it('отметка старше 72 часов — снимается и попадает в итог как брошенная по сроку', async () => {
        const { useCase, store, queueDispatcher, aiService } = makeDeps();
        aiService.findByDomainTypesInPeriod.mockResolvedValue([]);
        store.listFailed.mockResolvedValue([
            {
                payload: {
                    domain: DOMAIN,
                    activityId: 7,
                    transcriptionId: 't-old',
                },
                failedAt: new Date(
                    NOW.getTime() - 73 * 60 * 60 * 1000,
                ).toISOString(),
            },
        ]);

        const result = await useCase.repairDomain(DOMAIN, NOW);

        expect(result).toMatchObject({ requeued: 0, expired: 1 });
        expect(queueDispatcher.dispatch).not.toHaveBeenCalled();
        expect(store.dropFailed).toHaveBeenCalledWith(DOMAIN, 't-old');
    });

    it('звонок без разбора, но разбор уже появился — просто снимаем отметку', async () => {
        const { useCase, store, queueDispatcher, aiService } = makeDeps();
        aiService.findByDomainTypesInPeriod.mockResolvedValue([]);
        aiService.findByTranscriptionIds.mockResolvedValue([
            { id: '9', type: 'agent-analysis' },
        ]);
        store.listFailed.mockResolvedValue([
            {
                payload: {
                    domain: DOMAIN,
                    activityId: 1,
                    transcriptionId: 't-9',
                },
                failedAt: NOW.toISOString(),
            },
        ]);
        const result = await useCase.repairDomain(DOMAIN, NOW);
        expect(result.requeued).toBe(0);
        expect(queueDispatcher.dispatch).not.toHaveBeenCalled();
        expect(store.dropFailed).toHaveBeenCalledWith(DOMAIN, 't-9');
    });
});

describe('repairSummaryLine', () => {
    it('строка итога только при изменениях', () => {
        expect(
            repairSummaryLine({
                domain: DOMAIN,
                skipped: null,
                repaired: 2,
                stillPartial: 0,
                requeued: 1,
                gaveUp: 0,
                expired: 0,
            }),
        ).toBe(`${DOMAIN}: дособрано разборов 2, звонков поставлено заново 1`);
        expect(
            repairSummaryLine({
                domain: DOMAIN,
                skipped: null,
                repaired: 0,
                stillPartial: 0,
                requeued: 0,
                gaveUp: 0,
                expired: 0,
            }),
        ).toBe('');
    });

    it('брошенные по сроку — отдельной частью с просьбой посмотреть руками', () => {
        expect(
            repairSummaryLine({
                domain: DOMAIN,
                skipped: null,
                repaired: 0,
                stillPartial: 0,
                requeued: 0,
                gaveUp: 0,
                expired: 3,
            }),
        ).toBe(
            `${DOMAIN}: не разобрано за 72 часа и брошено 3 — смотреть руками`,
        );
    });
});
