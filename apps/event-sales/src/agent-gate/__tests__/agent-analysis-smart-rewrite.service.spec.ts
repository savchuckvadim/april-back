import { CallReportSmartWriterService } from '@lib/call-lib/call-report/services/call-report-smart-writer.service';
import {
    AgentAnalysisSmartRewriteService,
    analysisOfRecord,
} from '../services/agent-analysis-smart-rewrite.service';

jest.mock(
    '@lib/call-lib/call-report/services/call-report-smart-writer.service',
);

const MockedWriter = CallReportSmartWriterService as jest.MockedClass<
    typeof CallReportSmartWriterService
>;

const ROW = {
    id: '42',
    dedupKey: 'test.bitrix24.ru:101',
    domain: 'test.bitrix24.ru',
    activityId: '101',
    callId: 'ext_1',
    callStartedAt: new Date('2026-10-20T10:00:00Z'),
    provider: 'yandex',
    status: 'done',
    text: 'текст',
    segments: null,
    durationSec: '700',
    entityType: 'deal',
    entityId: '555',
    userId: '7',
    createdAt: new Date(),
    updatedAt: new Date(),
};

/** Запись ais, как её сохранил приём: dto + agentName. */
const RECORD = {
    id: '18',
    transcription_id: '42',
    provider: 'call-report-analyzer',
    user_result: {
        callType: 'presentation',
        summary: 'Итог анализа',
        score: 8,
        sections: [
            { section: 'NEEDS', relevance: 100, score: 8 },
            // Дубль раздела старой записи — подготовка схлопывает.
            { section: 'NEEDS', relevance: 60, score: 5 },
        ],
        agentName: 'claw-main',
    },
};

const makeDeps = (options?: {
    smartInstalled?: boolean;
    existingId?: number | null;
    updateFailure?: string | null;
}) => {
    const store = { findPipelineById: jest.fn().mockResolvedValue(ROW) };
    const aiService = {
        update: jest.fn().mockResolvedValue({ id: '18' }),
        findByTranscriptionIds: jest
            .fn()
            .mockResolvedValue([
                { type: 'call-resume', result: 'резюме gigachat' },
            ]),
    };
    const pbxService = {
        init: jest.fn().mockResolvedValue({
            bitrix: {
                api: {
                    call: jest.fn().mockResolvedValue({
                        result: {
                            COMPANY_ID: '33',
                            CONTACT_ID: '44',
                            ASSIGNED_BY_ID: '317',
                        },
                    }),
                },
            },
        }),
    };
    const resolver = {
        resolve: jest.fn().mockResolvedValue(
            options?.smartInstalled === false
                ? null
                : {
                      entityTypeId: 1056,
                      typeId: 128,
                      ufKeyByCode: {},
                      enumItems: {},
                  },
        ),
    };
    const updateExisting = jest
        .fn()
        .mockResolvedValue(
            options?.existingId === undefined ? 700 : options.existingId,
        );
    MockedWriter.mockImplementation(
        () =>
            ({
                updateExisting,
                lastUpdateFailure: options?.updateFailure ?? null,
            }) as never,
    );
    const dealFamily = {
        resolve: jest.fn().mockResolvedValue({ mainDealId: 555 }),
    };
    const dealVerify = {
        filterAgentDeals: jest.fn().mockResolvedValue({}),
    };
    const service = new AgentAnalysisSmartRewriteService(
        store as never,
        aiService as never,
        pbxService as never,
        resolver as never,
        dealFamily as never,
        dealVerify as never,
    );
    return { service, aiService, updateExisting, store, resolver };
};

/**
 * Дописывание полей существующей карточки из записи ais: та же сборка,
 * что у приёма (связи, контекст, первичный RAG), update по xmlId без
 * создания элемента, транскрипт в таймлайн не дублируется, успех — в ais.
 */
describe('AgentAnalysisSmartRewriteService', () => {
    afterEach(() => jest.clearAllMocks());

    it('переписывает поля существующего элемента и отмечает запись как записанную', async () => {
        const { service, aiService, updateExisting } = makeDeps();

        const outcome = await service.rewrite(RECORD);

        expect(outcome).toEqual({ kind: 'written', itemId: 700 });
        expect(updateExisting).toHaveBeenCalledTimes(1);
        const input = (
            updateExisting.mock.calls[0] as [Record<string, unknown>]
        )[0];
        expect(input).toMatchObject({
            activityId: '101',
            companyId: 33,
            contactId: 44,
            mainDealId: 555,
            callType: 'presentation',
            summary: 'Итог анализа',
            resumeGigachat: 'резюме gigachat',
            agentName: 'claw-main',
            transcriptInTimeline: true,
        });
        // Дубли разделов схлопнуты подготовкой — одна запись на код.
        expect(input.sections).toHaveLength(1);
        expect(aiService.update).toHaveBeenCalledWith('18', {
            in_report: true,
            report_item_id: '700',
        });
    });

    it('элемента по активности нет — itemMissing, запись не трогается', async () => {
        const { service, aiService } = makeDeps({ existingId: null });
        await expect(service.rewrite(RECORD)).resolves.toEqual({
            kind: 'itemMissing',
        });
        expect(aiService.update).not.toHaveBeenCalled();
    });

    it('частичный update упал — failed с текстом, in_report не выставляется', async () => {
        const { service, aiService } = makeDeps({
            updateFailure: 'Request failed with status code 400',
        });
        await expect(service.rewrite(RECORD)).resolves.toEqual({
            kind: 'failed',
            error: 'Request failed with status code 400',
            itemId: 700,
        });
        expect(aiService.update).not.toHaveBeenCalled();
    });

    it('смарт не установлен — smartMissing; без разбора или транскрипции — noPayload', async () => {
        const { service: noSmart } = makeDeps({ smartInstalled: false });
        await expect(noSmart.rewrite(RECORD)).resolves.toEqual({
            kind: 'smartMissing',
        });
        const { service, store } = makeDeps();
        await expect(
            service.rewrite({ ...RECORD, user_result: 'строка' }),
        ).resolves.toEqual({ kind: 'noPayload' });
        await expect(
            service.rewrite({ ...RECORD, transcription_id: null }),
        ).resolves.toEqual({ kind: 'noPayload' });
        expect(store.findPipelineById).not.toHaveBeenCalled();
    });

    it('agentName берётся из записи, иначе из provider', async () => {
        const { service, updateExisting } = makeDeps();
        await service.rewrite({
            ...RECORD,
            user_result: { callType: 'cold', summary: 'x' },
        });
        const input = (
            updateExisting.mock.calls[0] as [Record<string, unknown>]
        )[0];
        expect(input.agentName).toBe('call-report-analyzer');
    });

    it('analysisOfRecord: объект — разбор, массив и скаляр — null', () => {
        expect(analysisOfRecord({ callType: 'x' })).toEqual({ callType: 'x' });
        expect(analysisOfRecord([])).toBeNull();
        expect(analysisOfRecord(null)).toBeNull();
        expect(analysisOfRecord('x')).toBeNull();
    });
});
