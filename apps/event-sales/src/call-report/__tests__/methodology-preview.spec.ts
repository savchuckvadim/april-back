import { NotFoundException } from '@nestjs/common';
import type {
    Methodology,
    MethodologyPreviewState,
    ResolvedMethodology,
} from '@lib/call-lib/call-report/methodology';
import type { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';
import { MethodologyPreviewUseCase } from '../use-cases/methodology-preview.use-case';
import {
    buildMethodologyPreviewResult,
    restoreUncappedScores,
} from '../use-cases/methodology-preview.util';

const DOMAIN = 'gsr.bitrix24.ru';
const PREVIEW_ID = '0b9f1c9e-6f0e-4a59-9f2b-0f7a8c1d2e3f';

/** Черновик: один обязательный пункт холодного звонка и ограничитель на его пропуск. */
const DRAFT: Methodology = {
    code: 'draft-own',
    title: 'Черновик',
    version: '1.0.0',
    types: ['cold'],
    principles: [],
    checkpoints: [
        {
            code: 'cold.benefit',
            title: 'Назвал выгоду для клиента',
            types: ['cold'],
            evidence: 'quote',
            mandatory: true,
        },
    ],
    caps: [
        {
            code: 'cap.no_benefit',
            title: 'выгода не названа',
            when: [{ op: 'checkpoint_missed', checkpoint: 'cold.benefit' }],
            target: 'total',
            max: 5,
        },
    ],
    spirals: { enabled: false, minFull: 0, types: [] },
};

const RESOLVED: ResolvedMethodology = {
    methodology: DRAFT,
    scope: 'portal',
    source: 'table',
    versionTag: 'draft-own@1.0.0',
};

/** Действующий разбор: итог 6 после ограничителя, до него было 8. */
const storedAnalysis = (): AgentCallAnalysisDto =>
    ({
        callType: 'cold',
        score: 6,
        sections: [{ section: 'NEEDS', relevance: 80, score: 4 }],
        capsTriggered: [
            {
                code: 'old.needs',
                title: 'старый ограничитель раздела',
                target: 'NEEDS',
                max: 4,
                before: 7,
                after: 4,
                applied: true,
            },
            {
                code: 'old.needs_second',
                title: 'второй ограничитель того же раздела',
                target: 'NEEDS',
                max: 4,
                before: 4,
                after: 4,
                applied: false,
            },
            {
                code: 'old.total',
                title: 'старый ограничитель итога',
                target: 'total',
                max: 6,
                before: 8,
                after: 6,
                applied: true,
            },
            {
                code: 'old.price',
                title: 'раздела без оценки',
                target: 'PRICE',
                max: 5,
                before: null,
                after: null,
                applied: false,
            },
        ],
    }) as unknown as AgentCallAnalysisDto;

const passOutcome = (status: 'done' | 'missed') => ({
    result: {
        checkpoints: [
            {
                code: 'cold.benefit',
                status,
                quote:
                    status === 'done' ? 'Это сэкономит вам час в день.' : null,
                startSec: status === 'done' ? 42 : null,
                endSec: status === 'done' ? 47 : null,
            },
        ],
        spirals: null,
    },
    model: 'bitrix/bitrixgpt-5.5',
    tokens: 14200,
    talkRatioMax: 60,
});

describe('проверка черновика методики: расчёт', () => {
    it('оценки возвращаются к значениям до ограничителей — по первому сработавшему на цели', () => {
        const dto = storedAnalysis();

        restoreUncappedScores(dto);

        expect(dto.score).toBe(8);
        expect(dto.sections?.[0]?.score).toBe(7);
    });

    it('у методики нет прохода для типа звонка — модель не вызывалась, оценка не меняется', () => {
        const result = buildMethodologyPreviewResult(
            storedAnalysis(),
            'presentation',
            RESOLVED,
            null,
        );

        expect(result).toEqual({
            callType: 'presentation',
            applicable: false,
            methodology: null,
            capsTriggered: [],
            scoreBefore: 6,
            scoreAfter: 6,
            model: null,
            tokens: null,
        });
    });

    it('пункт выполнен: в итоге цитата и время, ограничитель черновика не сработал, оценка — без старых срезов', () => {
        const result = buildMethodologyPreviewResult(
            storedAnalysis(),
            'cold',
            RESOLVED,
            passOutcome('done'),
        );

        expect(result).toMatchObject({
            applicable: true,
            scoreBefore: 6,
            scoreAfter: 8,
            model: 'bitrix/bitrixgpt-5.5',
            tokens: 14200,
        });
        expect(result.methodology).toMatchObject({
            code: 'draft-own',
            checkpointsDone: 1,
            checkpointsTotal: 1,
        });
        expect(result.methodology?.checkpoints[0]).toMatchObject({
            code: 'cold.benefit',
            title: 'Назвал выгоду для клиента',
            status: 'done',
            quote: 'Это сэкономит вам час в день.',
            startSec: 42,
        });
        expect(
            result.capsTriggered.some(cap => cap.code === 'cap.no_benefit'),
        ).toBe(false);
        // Ограничители действующего разбора в итог черновика не тянутся.
        expect(result.capsTriggered.some(cap => cap.code === 'old.total')).toBe(
            false,
        );
    });

    it('пункт пропущен: ограничитель черновика срезает итог от исходной оценки', () => {
        const result = buildMethodologyPreviewResult(
            storedAnalysis(),
            'cold',
            RESOLVED,
            passOutcome('missed'),
        );

        expect(result.methodology).toMatchObject({
            checkpointsDone: 0,
            checkpointsTotal: 1,
        });
        expect(
            result.capsTriggered.find(cap => cap.code === 'cap.no_benefit'),
        ).toMatchObject({ before: 8, after: 5, applied: true });
        expect(result.scoreAfter).toBe(5);
    });
});

describe('MethodologyPreviewUseCase', () => {
    const DATA = {
        previewId: PREVIEW_ID,
        domain: DOMAIN,
        transcriptionId: '184523',
        config: DRAFT,
    };

    const makeDeps = (options?: {
        rowDomain?: string;
        text?: string;
        records?: unknown[];
        rowError?: Error;
        passError?: Error;
        passport?: Error | string;
    }) => {
        const states: MethodologyPreviewState[] = [];
        const store = {
            write: jest.fn((state: MethodologyPreviewState) => {
                states.push(state);
                return Promise.resolve(state);
            }),
        };
        const transcriptionStore = {
            findPipelineById: options?.rowError
                ? jest.fn().mockRejectedValue(options.rowError)
                : jest.fn().mockResolvedValue({
                      id: '184523',
                      domain: options?.rowDomain ?? DOMAIN,
                      segments: [],
                      text: options?.text ?? 'Менеджер: добрый день.',
                  }),
        };
        const analysisRecord = {
            id: '900',
            type: 'agent-analysis',
            status: 'done',
            transcription_id: '184523',
            user_result: storedAnalysis(),
        };
        const aiService = {
            findByTranscriptionIds: jest
                .fn()
                .mockResolvedValue(options?.records ?? [analysisRecord]),
            create: jest.fn(),
            update: jest.fn(),
        };
        const focusAnalysis = {
            runMethodologyPass: options?.passError
                ? jest.fn().mockRejectedValue(options.passError)
                : jest.fn().mockResolvedValue(passOutcome('missed')),
        };
        const contextBuilder = {
            build:
                options?.passport instanceof Error
                    ? jest.fn().mockRejectedValue(options.passport)
                    : jest.fn().mockResolvedValue({}),
            renderForPrompt: jest.fn().mockReturnValue('ПАСПОРТ ЗВОНКА'),
        };
        const settingsService = {
            resolve: jest
                .fn()
                .mockResolvedValue({ deepAnalysisModel: 'bitrix/own-model' }),
        };
        const useCase = new MethodologyPreviewUseCase(
            store as never,
            transcriptionStore as never,
            aiService as never,
            focusAnalysis as never,
            contextBuilder as never,
            settingsService as never,
        );
        return { useCase, states, aiService, focusAnalysis, analysisRecord };
    };

    it('успех: состояние идёт «идёт» → «готово», проход вызван с черновиком, паспортом и моделью портала', async () => {
        const { useCase, states, focusAnalysis } = makeDeps();

        const state = await useCase.execute(DATA);

        expect(states.map(item => item.status)).toEqual(['running', 'done']);
        expect(state.status).toBe('done');
        expect(state.error).toBeNull();
        expect(state.result).toMatchObject({
            callType: 'cold',
            applicable: true,
            scoreBefore: 6,
            scoreAfter: 5,
        });
        const [domain, transcript, callType, resolved, passport, options] =
            focusAnalysis.runMethodologyPass.mock.calls[0] as unknown as [
                string,
                string,
                string,
                ResolvedMethodology,
                string,
                { model: string },
            ];
        expect([domain, transcript, callType, passport]).toEqual([
            DOMAIN,
            'Менеджер: добрый день.',
            'cold',
            'ПАСПОРТ ЗВОНКА',
        ]);
        expect(resolved.versionTag).toBe('draft-own@1.0.0');
        expect(resolved.methodology.code).toBe('draft-own');
        expect(options).toEqual({ model: 'bitrix/own-model' });
    });

    it('проверка ничего не сохраняет: записи разбора не создаются и не меняются, действующий разбор цел', async () => {
        const { useCase, aiService, analysisRecord } = makeDeps();

        await useCase.execute(DATA);

        expect(aiService.create).not.toHaveBeenCalled();
        expect(aiService.update).not.toHaveBeenCalled();
        // Расчёт шёл по копии.
        expect(analysisRecord.user_result.score).toBe(6);
        expect(analysisRecord.user_result.sections?.[0]?.score).toBe(4);
    });

    it('паспорт звонка не собрался — проверка идёт без него', async () => {
        const { useCase, focusAnalysis } = makeDeps({
            passport: new Error('Битрикс не ответил'),
        });

        const state = await useCase.execute(DATA);

        expect(state.status).toBe('done');
        expect(
            (focusAnalysis.runMethodologyPass.mock.calls[0] as unknown[])[4],
        ).toBeUndefined();
    });

    it.each([
        [
            'черновик с ошибками',
            { config: { code: 'x' } },
            {},
            'Черновик не проходит проверку',
        ],
        [
            'расшифровка не найдена',
            {},
            { rowError: new NotFoundException('Transcription not found') },
            'Расшифровка № 184523 не найдена.',
        ],
        [
            'расшифровка другого портала',
            {},
            { rowDomain: 'other.bitrix24.ru' },
            'Расшифровка № 184523 относится к другому порталу.',
        ],
        [
            'пустая расшифровка',
            {},
            { text: '   ' },
            'У этого звонка нет расшифровки — проверять не на чем.',
        ],
        ['звонок не разобран', {}, { records: [] }, 'Звонок ещё не разобран'],
        [
            'модель не ответила',
            {},
            { passError: new Error('LLM недоступна') },
            'Проверка не выполнена: LLM недоступна',
        ],
    ])(
        'отказ «%s»: причина словами в состоянии, задание не падает',
        async (_name, dataPatch, depsOptions, message) => {
            const { useCase, states, focusAnalysis } = makeDeps(depsOptions);

            const state = await useCase.execute({ ...DATA, ...dataPatch });

            expect(state.status).toBe('failed');
            expect(state.error).toContain(message);
            expect(state.result).toBeNull();
            expect(states.map(item => item.status)).toEqual([
                'running',
                'failed',
            ]);
            if (!('passError' in depsOptions)) {
                expect(focusAnalysis.runMethodologyPass).not.toHaveBeenCalled();
            }
        },
    );
});
