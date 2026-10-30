import type { SmartBackfillJobData } from '@lib/sales-ai-analytics';
import type { AgentAnalysisRewriteOutcome } from '../../agent-gate/services/agent-analysis-smart-rewrite.service';
import { CallReportSmartBackfillUseCase } from '../use-cases/call-report-smart-backfill.use-case';

const DOMAIN = 'g.bitrix24.ru';
const NOW = new Date('2026-10-30T09:00:00.000Z');

const DATA: SmartBackfillJobData = {
    domain: DOMAIN,
    mode: 'period',
    from: '2026-10-13',
    to: '2026-10-30',
    source: 'admin',
};

const candidate = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    transcription_id: `t-${id}`,
    report_item_id: `${Number(id) * 100}`,
    in_report: true,
    status: 'done',
    created_at: new Date('2026-10-20T10:00:00.000Z'),
    ...over,
});

const makeUseCase = (options: {
    candidates: ReturnType<typeof candidate>[];
    outcomes?: Record<string, AgentAnalysisRewriteOutcome>;
    previous?: { id: string; status: Record<string, unknown> } | null;
}) => {
    const aiService = {
        findSmartWriteCandidates: jest
            .fn()
            .mockResolvedValue(options.candidates),
        findById: jest.fn((id: string) =>
            Promise.resolve({
                id,
                transcription_id: `t-${id}`,
                user_result: { callType: 'presentation', agentName: 'claw' },
                provider: 'claw',
            }),
        ),
    };
    const rewrite = {
        rewrite: jest.fn((record: { id: string }) =>
            Promise.resolve(
                options.outcomes?.[record.id] ?? {
                    kind: 'written',
                    itemId: Number(record.id) * 100,
                },
            ),
        ),
    };
    const saved: Record<string, unknown>[] = [];
    const statusStore = {
        load: jest.fn().mockResolvedValue(options.previous ?? null),
        save: jest.fn((status: Record<string, unknown>) => {
            saved.push(
                JSON.parse(JSON.stringify(status)) as Record<string, unknown>,
            );
            return Promise.resolve('s-1');
        }),
    };
    const dispatcher = { dispatch: jest.fn().mockResolvedValue({ id: 'j' }) };
    const useCase = new CallReportSmartBackfillUseCase(
        aiService as never,
        rewrite as never,
        statusStore as never,
        dispatcher as never,
    );
    return { useCase, aiService, rewrite, statusStore, dispatcher, saved };
};

/**
 * Джоба дописывания полей: кандидаты окна переписываются по одному из
 * записи ais, счётчики по исходам, статус в ais, продолжение со смещением
 * (period) или без (pending), остановка при отсутствии смарта, dryRun.
 */
describe('CallReportSmartBackfillUseCase', () => {
    it('переписывает каждую карточку из записи ais и раскладывает исходы по счётчикам', async () => {
        const { useCase, aiService, rewrite, saved } = makeUseCase({
            candidates: [
                candidate('1'),
                candidate('2'),
                candidate('3'),
                candidate('4'),
                candidate('5', { report_item_id: null }),
            ],
            outcomes: {
                '2': { kind: 'failed', error: 'HTTP 400', itemId: 200 },
                '3': { kind: 'itemMissing' },
                '4': { kind: 'noPayload' },
            },
        });

        const result = await useCase.execute(DATA, NOW);

        expect(aiService.findSmartWriteCandidates).toHaveBeenCalledWith(
            DOMAIN,
            'agent-analysis',
            expect.any(Date),
            expect.any(Date),
            { pendingOnly: false },
        );
        expect(aiService.findById).toHaveBeenCalledTimes(4);
        expect(rewrite.rewrite).toHaveBeenCalledWith({
            id: '1',
            transcription_id: 't-1',
            user_result: { callType: 'presentation', agentName: 'claw' },
            provider: 'claw',
        });
        expect(result).toMatchObject({
            candidates: 5,
            processed: 4,
            done: 1,
            failed: 1,
            missing: 1,
            skipped: 2,
            continuedWith: null,
            statusId: 's-1',
        });
        const last = saved[saved.length - 1];
        expect(last).toMatchObject({
            finished: true,
            lastError: 'HTTP 400',
            skippedBy: { noSmartItem: 1, superseded: 0, noPayload: 1 },
        });
    });

    it('режим period: квота исчерпана — продолжение со смещением, статус не закончен', async () => {
        const { useCase, dispatcher, saved } = makeUseCase({
            candidates: [candidate('1'), candidate('2'), candidate('3')],
        });

        const result = await useCase.execute({ ...DATA, quota: 2 }, NOW);

        expect(result.processed).toBe(2);
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            'call-report',
            'call-report-smart-backfill',
            { ...DATA, quota: 2, part: 2, offset: 2 },
            `call-report-smart-backfill:${DOMAIN}:period:2026-10-13:2026-10-30:run:part-2`,
            expect.objectContaining({ attempts: 1 }),
        );
        expect(saved[saved.length - 1]).toMatchObject({
            finished: false,
            continuedWith: expect.stringContaining('part-2') as string,
        });
    });

    it('часть 2 режима period начинает со смещения и не трогает уже пройденные', async () => {
        const { useCase, rewrite } = makeUseCase({
            candidates: [candidate('1'), candidate('2'), candidate('3')],
        });
        await useCase.execute({ ...DATA, quota: 2, part: 2, offset: 2 }, NOW);
        expect(rewrite.rewrite).toHaveBeenCalledTimes(1);
        expect(rewrite.rewrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: '3' }),
        );
    });

    it('режим pending: выборка только неудавшихся, продолжение без смещения', async () => {
        const { useCase, aiService, dispatcher } = makeUseCase({
            candidates: [
                candidate('1', { in_report: false }),
                candidate('2', { in_report: false }),
            ],
        });
        await useCase.execute(
            { ...DATA, mode: 'pending', source: 'cron', quota: 1 },
            NOW,
        );
        expect(aiService.findSmartWriteCandidates).toHaveBeenCalledWith(
            DOMAIN,
            'agent-analysis',
            expect.any(Date),
            expect.any(Date),
            { pendingOnly: true },
        );
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ mode: 'pending', part: 2, offset: 1 }),
            expect.stringContaining(':pending:'),
            expect.anything(),
        );
    });

    it('часть ничего не смогла — продолжения нет (упорный сбой не крутит цепочку)', async () => {
        const { useCase, dispatcher, saved } = makeUseCase({
            candidates: [candidate('1'), candidate('2')],
            outcomes: {
                '1': { kind: 'failed', error: 'boom', itemId: 100 },
            },
        });
        await useCase.execute({ ...DATA, quota: 1 }, NOW);
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
        expect(saved[saved.length - 1]).toMatchObject({
            finished: true,
            failed: 1,
            lastError: 'boom',
        });
    });

    it('смарт на портале не установлен — часть останавливается на первой карточке', async () => {
        const { useCase, rewrite, dispatcher, saved } = makeUseCase({
            candidates: [candidate('1'), candidate('2')],
            outcomes: { '1': { kind: 'smartMissing' } },
        });
        const result = await useCase.execute(DATA, NOW);
        expect(rewrite.rewrite).toHaveBeenCalledTimes(1);
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
        expect(result.failed).toBe(1);
        expect(saved[saved.length - 1]).toMatchObject({
            finished: true,
            lastError: expect.stringContaining('не установлен') as string,
        });
    });

    it('dryRun — только подсчёт: ни чтения записей, ни записи в Битрикс, статус закончен', async () => {
        const { useCase, aiService, rewrite, saved } = makeUseCase({
            candidates: [
                candidate('1'),
                candidate('2', {
                    status: 'superseded',
                    transcription_id: 't-1',
                }),
            ],
        });
        const result = await useCase.execute({ ...DATA, dryRun: true }, NOW);
        expect(aiService.findById).not.toHaveBeenCalled();
        expect(rewrite.rewrite).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            dryRun: true,
            candidates: 2,
            processed: 0,
        });
        expect(saved).toHaveLength(1);
        expect(saved[0]).toMatchObject({
            dryRun: true,
            finished: true,
            skippedBy: { superseded: 1 },
        });
    });

    it('ошибка чтения записи считается сбоем карточки, а не падением джобы', async () => {
        const { useCase, aiService } = makeUseCase({
            candidates: [candidate('1')],
        });
        aiService.findById.mockRejectedValue(new Error('db down'));
        const result = await useCase.execute(DATA, NOW);
        expect(result).toMatchObject({ failed: 1, done: 0 });
    });
});
