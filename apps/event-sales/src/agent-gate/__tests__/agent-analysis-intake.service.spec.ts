import { AgentAnalysisIntakeService } from '../services/agent-analysis-intake.service';
import { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import { CallReportSmartWriterService } from '@lib/call-lib/call-report/services/call-report-smart-writer.service';

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
    callStartedAt: new Date('2026-07-21T10:00:00Z'),
    provider: 'yandex',
    status: 'done',
    text: 'текст',
    durationSec: '700',
    entityType: 'deal',
    entityId: '555',
    userId: '7',
    createdAt: new Date(),
    updatedAt: new Date(),
};

const DTO: AgentCallAnalysisDto = {
    callType: 'presentation',
    summary: 'Итог анализа агента',
    needsFound: true,
    needs: ['практика 44-ФЗ'],
    presentationDone: true,
    score: 8,
};

const makeDeps = (options?: { smartInstalled?: boolean }) => {
    const store = { findPipelineById: jest.fn().mockResolvedValue(ROW) };
    const aiService = {
        create: jest.fn().mockResolvedValue({ id: '18' }),
        update: jest.fn().mockResolvedValue({ id: '18' }),
        findByTranscriptionIds: jest.fn().mockResolvedValue([
            { type: 'call-resume', result: 'резюме gigachat' },
            { type: 'call-recomendation', result: 'советы gigachat' },
        ]),
    };
    const timeline = { addTimelineComment: jest.fn().mockResolvedValue({}) };
    const pbxService = {
        init: jest.fn().mockResolvedValue({
            bitrix: {
                api: {
                    call: jest.fn().mockResolvedValue({
                        result: {
                            COMPANY_ID: '33',
                            CONTACT_ID: '44',
                            ASSIGNED_BY_ID: '7',
                        },
                    }),
                },
                timeline,
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
    const addItem = jest.fn().mockResolvedValue(7);
    MockedWriter.mockImplementation(() => ({ addItem }) as never);

    const service = new AgentAnalysisIntakeService(
        store as never,
        aiService as never,
        pbxService as never,
        resolver as never,
    );
    return { service, aiService, addItem, timeline };
};

describe('AgentAnalysisIntakeService', () => {
    afterEach(() => jest.clearAllMocks());

    it('сохраняет анализ в ais, создаёт смарт-элемент со связями и дублирует в таймлайн', async () => {
        const { service, aiService, addItem, timeline } = makeDeps();
        const result = await service.intake('42', 'claw-main', {
            ...DTO,
            sections: [
                { section: 'NEEDS', relevance: 100, score: 8 },
                { section: 'PRICE', relevance: 0 },
            ],
            relatedDeals: { presentationDealId: 601 },
            kpiItem: { itemId: '9001', status: 'confirmed' },
        } as never);

        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'claw-main',
                type: 'agent-analysis',
                result: DTO.summary,
                transcription_id: '42',
                domain: 'test.bitrix24.ru',
            }),
        );
        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({
                activityId: '101',
                dealId: 555,
                companyId: 33,
                contactId: 44,
                managerId: 7,
                callType: 'presentation',
                transcript: 'текст',
                mainDealId: 555,
                presentationDealId: 601,
                kpiItem: { itemId: '9001', status: 'confirmed' },
                resumeGigachat: 'резюме gigachat',
                recomendationGigachat: 'советы gigachat',
                agentName: 'claw-main',
            }),
        );
        expect(aiService.update).toHaveBeenCalledWith('18', {
            report_item_id: '7',
            in_report: true,
        });
        expect(timeline.addTimelineComment).toHaveBeenCalledWith(
            expect.objectContaining({
                ENTITY_ID: 555,
                ENTITY_TYPE: 'deal',
                AUTHOR_ID: '7',
            }),
        );
        expect(result).toEqual({
            aiId: '18',
            smartItemId: 7,
            smartInstalled: true,
        });
    });

    it('weightedScore считается по формуле Σ(score×relevance)/Σrelevance×10, если агент не прислал', async () => {
        const { service, addItem } = makeDeps();
        await service.intake('42', 'claw-main', {
            ...DTO,
            sections: [
                { section: 'NEEDS', relevance: 100, score: 8 },
                { section: 'PRESENTATION', relevance: 50, score: 4 },
                { section: 'PRICE', relevance: 0 },
            ],
        } as never);

        // (8×100 + 4×50) / 150 × 10 = 66.7 → 67; PRICE (relevance 0) исключён
        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({ weightedScore: 67 }),
        );
    });

    it('гранулярный чеклист главнее итога модели: все пункты true → hvostDone=true, один false в 5К → fiveKDone=false', async () => {
        const { service, addItem } = makeDeps();
        await service.intake('42', 'claw-main', {
            ...DTO,
            hvostDone: false,
            hvostSteps: {
                offer: true,
                complect: true,
                price: true,
                decisionDate: true,
                dateAgreed: true,
            },
            fiveKDone: true,
            fiveKItems: {
                clientWhat: true,
                clientReady: true,
                clientPrice: false,
                companyWho: true,
                companyHow: true,
                companyRight: true,
                colleagues: true,
                competitor: true,
                criteria: true,
            },
        } as never);

        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({
                hvostDone: true,
                fiveKDone: false,
                hvostSteps: expect.objectContaining({ offer: true }) as unknown,
                fiveKItems: expect.objectContaining({
                    clientPrice: false,
                }) as unknown,
            }),
        );
    });

    it('чеклист из одних null итоги не трогает (тип звонка не презентация)', async () => {
        const { service, addItem } = makeDeps();
        await service.intake('42', 'claw-main', {
            ...DTO,
            hvostDone: true,
            hvostSteps: {
                offer: null,
                complect: null,
                price: null,
                decisionDate: null,
                dateAgreed: null,
            },
        } as never);

        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({ hvostDone: true }),
        );
    });

    it('черновик flow (plan+report) сохраняется в ais.report_result', async () => {
        const { service, aiService } = makeDeps();
        await service.intake('42', 'claw-main', {
            ...DTO,
            flow: {
                report: { resultStatus: 'result' },
                plan: { isPlanned: true, typeCode: 'presentation' },
            },
        } as never);

        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                report_result: JSON.stringify({
                    report: { resultStatus: 'result' },
                    plan: { isPlanned: true, typeCode: 'presentation' },
                }),
            }),
        );
    });

    it('повторный push-back идемпотентен — возвращает существующий анализ без дубликатов', async () => {
        const { service, aiService, addItem } = makeDeps();
        aiService.findByTranscriptionIds.mockResolvedValue([
            { id: '18', type: 'agent-analysis', report_item_id: '7' },
        ]);
        const result = await service.intake('42', 'claw-main', DTO);

        expect(aiService.create).not.toHaveBeenCalled();
        expect(addItem).not.toHaveBeenCalled();
        expect(result).toEqual({
            aiId: '18',
            smartItemId: 7,
            smartInstalled: true,
        });
    });

    it('ретрай после установки смарта доливает элемент к существующей ais-записи', async () => {
        const { service, aiService, addItem } = makeDeps();
        aiService.findByTranscriptionIds
            .mockResolvedValueOnce([
                { id: '18', type: 'agent-analysis', report_item_id: null },
            ])
            .mockResolvedValue([
                { type: 'call-resume', result: 'резюме gigachat' },
            ]);
        const result = await service.intake('42', 'claw-main', DTO);

        expect(aiService.create).not.toHaveBeenCalled();
        expect(addItem).toHaveBeenCalled();
        expect(aiService.update).toHaveBeenCalledWith('18', {
            report_item_id: '7',
            in_report: true,
        });
        expect(result).toEqual({
            aiId: '18',
            smartItemId: 7,
            smartInstalled: true,
        });
    });

    it('без установленного смарта анализ сохраняется только в БД (graceful)', async () => {
        const { service, aiService, addItem } = makeDeps({
            smartInstalled: false,
        });
        const result = await service.intake('42', 'claw-main', DTO);

        expect(aiService.create).toHaveBeenCalled();
        expect(addItem).not.toHaveBeenCalled();
        expect(aiService.update).not.toHaveBeenCalled();
        expect(result).toEqual({
            aiId: '18',
            smartItemId: null,
            smartInstalled: false,
        });
    });
});
