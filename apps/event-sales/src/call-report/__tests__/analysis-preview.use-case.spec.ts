import { Logger } from '@nestjs/common';
import type { AnalysisPreviewState } from '@lib/call-lib/call-report/analysis-preview';
import type { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';
import { AnalysisPreviewUseCase } from '../use-cases/analysis-preview.use-case';
import { buildAnalysisPreviewResult } from '../use-cases/analysis-preview.util';

const DOMAIN = 'gsr.bitrix24.ru';
const PREVIEW_ID = '0b9f1c9e-6f0e-4a59-9f2b-0f7a8c1d2e3f';

/** Действующий разбор звонка (как в ais.user_result). */
const ACTIVE = {
    callType: 'presentation',
    classifierCallType: 'presentation',
    score: 6,
    sections: [
        { section: 'NEEDS', relevance: 100, score: 5 },
        { section: 'PRICE', relevance: 60, score: 4 },
    ],
};

/** Проверочный разбор с цитатами. */
const previewDto = (): AgentCallAnalysisDto =>
    ({
        score: 7,
        sections: [
            {
                section: 'NEEDS',
                relevance: 100,
                score: 6,
                quote: 'какие задачи у бухгалтерии',
                startSec: 95,
            },
            { section: 'GREETING', relevance: 100, score: 8, quote: null },
            { section: 'REFUSAL', relevance: 0 },
        ],
        needItems: [
            {
                need: 'Следить за НДС',
                quote: 'изменения по НДС',
                startSec: 120,
            },
            { need: 'Шаблоны договоров', quote: null, startSec: null },
        ],
        hvostSteps: {
            desire: true,
            offered: true,
            priceReaction: false,
            decisionProcess: null,
            decisionWay: true,
        },
        hvostEvidence: [
            { key: 'desire', quote: 'мне понравилось', startSec: 600 },
            { key: 'offered', quote: 'комплект для бухгалтера', startSec: 640 },
        ],
        fiveKItems: { client: true, company: false },
        fiveKEvidence: [],
        incompleteParts: [],
        usage: { tokens: 61250 },
    }) as unknown as AgentCallAnalysisDto;

describe('итог проверки разбора на звонке', () => {
    const result = buildAnalysisPreviewResult({
        dto: previewDto(),
        before: ACTIVE,
        callType: 'presentation',
        durationSec: 1260,
        promptVersion: 'focus-v3.4-2026-11-18',
    });

    it('места: разделы с актуальностью, потребности, раскрытые пункты «хвоста» и 5К', () => {
        expect(
            result.points.map(point => [
                point.kind,
                point.title,
                point.startSec,
            ]),
        ).toEqual([
            ['section', 'Выявление потребностей', 95],
            ['section', 'Приветствие', null],
            ['need', 'Следить за НДС', 120],
            ['need', 'Шаблоны договоров', null],
            ['hvost', 'Желание работать с Гарантом', 600],
            ['hvost', 'Что предложили', 640],
            ['hvost', 'Выход на решение', null],
            ['five_k', 'Клиент', null],
        ]);
    });

    it('сводка по видам: сколько мест и сколько с секундой', () => {
        expect(result.coverage).toEqual([
            { kind: 'section', total: 2, withTime: 1 },
            { kind: 'need', total: 2, withTime: 1 },
            { kind: 'hvost', total: 3, withTime: 2 },
            { kind: 'five_k', total: 1, withTime: 0 },
        ]);
    });

    it('оценки «сейчас → по проверке»: итог и разделы в порядке рубрики', () => {
        expect([result.scoreBefore, result.scoreAfter]).toEqual([6, 7]);
        expect(result.sections).toEqual([
            {
                section: 'GREETING',
                title: 'Приветствие',
                before: null,
                after: 8,
            },
            {
                section: 'NEEDS',
                title: 'Выявление потребностей',
                before: 5,
                after: 6,
            },
            {
                section: 'PRICE',
                title: 'Работа по цене',
                before: 4,
                after: null,
            },
        ]);
        expect(result.tokens).toBe(61250);
        expect(result.promptVersion).toBe('focus-v3.4-2026-11-18');
    });
});

describe('AnalysisPreviewUseCase', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => jest.restoreAllMocks());

    const makeDeps = (options?: {
        domain?: string;
        records?: unknown[];
        dto?: AgentCallAnalysisDto | null;
    }) => {
        const writes: AnalysisPreviewState[] = [];
        const store = {
            write: jest.fn((state: AnalysisPreviewState) => {
                writes.push(state);
                return Promise.resolve(state);
            }),
        };
        const row = {
            id: '184523',
            domain: options?.domain ?? DOMAIN,
            durationSec: '1260',
            segments: [],
            text: 'текст',
        };
        const transcriptionStore = {
            findPipelineById: jest.fn().mockResolvedValue(row),
        };
        const aiService = {
            findByTranscriptionIds: jest.fn().mockResolvedValue(
                options?.records ?? [
                    {
                        id: '1',
                        type: 'agent-analysis',
                        status: 'done',
                        user_result: ACTIVE,
                    },
                ],
            ),
        };
        const rerun = {
            rerun: jest
                .fn()
                .mockResolvedValue(
                    options?.dto === null
                        ? null
                        : { row, dto: options?.dto ?? previewDto(), usage: {} },
                ),
        };
        const settings = {
            resolve: jest
                .fn()
                .mockResolvedValue({ deepAnalysisModel: 'bitrixgpt-5.5' }),
        };
        const useCase = new AnalysisPreviewUseCase(
            store as never,
            transcriptionStore as never,
            aiService as never,
            rerun as never,
            settings as never,
        );
        return { useCase, writes, rerun, aiService };
    };

    const JOB = {
        previewId: PREVIEW_ID,
        domain: DOMAIN,
        transcriptionId: '184523',
    };

    it('разбор с цитатами по модели портала, ничего не пишет кроме состояния в Redis', async () => {
        const { useCase, writes, rerun } = makeDeps();

        const state = await useCase.execute(JOB);

        expect(rerun.rerun).toHaveBeenCalledWith({
            transcriptionId: '184523',
            source: ACTIVE,
            model: 'bitrixgpt-5.5',
            quoteEvidence: true,
        });
        expect(writes.map(item => item.status)).toEqual(['running', 'done']);
        expect(state.result?.promptVersion).toBe('focus-v3.4-2026-11-18');
        expect(state.result?.callType).toBe('presentation');
        expect(state.result?.durationSec).toBe(1260);
    });

    it('звонок другого портала — отказ словами, модель не зовётся', async () => {
        const { useCase, rerun } = makeDeps({ domain: 'garant.bitrix24.ru' });

        const state = await useCase.execute(JOB);

        expect(state.status).toBe('failed');
        expect(state.error).toContain('относится к другому порталу');
        expect(rerun.rerun).not.toHaveBeenCalled();
    });

    it('звонок не разобран — отказ словами, модель не зовётся', async () => {
        const { useCase, rerun } = makeDeps({ records: [] });

        const state = await useCase.execute(JOB);

        expect(state.status).toBe('failed');
        expect(state.error).toContain('Звонок ещё не разобран');
        expect(rerun.rerun).not.toHaveBeenCalled();
    });

    it('разбор не собрался — отказ словами, без исключения наружу', async () => {
        const { useCase } = makeDeps({ dto: null });

        const state = await useCase.execute(JOB);

        expect(state.status).toBe('failed');
        expect(state.error).toContain('Разбор не собрался');
    });
});
