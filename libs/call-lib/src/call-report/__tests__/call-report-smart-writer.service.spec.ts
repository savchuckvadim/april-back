import { CallReportSmartWriterService } from '../services/call-report-smart-writer.service';
import { CallReportSmartInfo } from '../services/call-report-smart-resolver.service';

const SMART_INFO: CallReportSmartInfo = {
    // UF-ключи собираются по typeId (128); entityTypeId — адресация item.add.
    entityTypeId: 1056,
    typeId: 128,
    ufKeyByCode: {},
    enumItems: {
        CALL_TYPE: { presentation: 51, cold: 50 },
        KPI_ITEM_STATUS: { confirmed: 60, suspected: 61 },
        HISTORY_ITEM_STATUS: { confirmed: 70, suspected: 71 },
        INTERLOCUTOR_ROLE: { lpr: 80 },
        OBJECTION_CATEGORIES: { price: 90, need: 91 },
        COMPETITORS: { consultant: 95 },
        COACHING_PRIORITY: { urgent: 97 },
    },
};

const makeBitrix = () => ({
    item: {
        add: jest.fn().mockResolvedValue({ result: { item: { id: 7 } } }),
        list: jest.fn().mockResolvedValue({ result: { items: [] } }),
    },
});

describe('CallReportSmartWriterService', () => {
    it('создаёт элемент со связями, camelCase UF-полями и enum по id', async () => {
        const bitrix = makeBitrix();
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        const itemId = await writer.addItem({
            activityId: '101',
            dealId: 555,
            companyId: 33,
            contactId: 44,
            managerId: 7,
            callType: 'presentation',
            durationSec: 700,
            needsFound: true,
            presentationDone: false,
            summary: 'Резюме & детали =100%',
            transcriptionId: '42',
        });

        expect(itemId).toBe(7);
        // Элемент создаётся по entityTypeId, UF-ключи — по typeId (128).
        expect(bitrix.item.add).toHaveBeenCalledWith(
            '1056',
            expect.objectContaining({
                parentId2: 555,
                companyId: 33,
                contactId: 44,
                assignedById: 7,
                ufCrm128ActivityId: '101',
                ufCrm128CallType: 51,
                ufCrm128DurationSec: 700,
                ufCrm128NeedsFound: 1,
                ufCrm128PresentationDone: 0,
                ufCrm128Summary: 'Резюме & детали =100%',
                ufCrm128TranscriptionId: '42',
            }),
        );
    });

    it('пишет связи воронок crm-массивами, привязки списков и разделы анализа', async () => {
        const bitrix = makeBitrix();
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await writer.addItem({
            activityId: '101',
            mainDealId: 555,
            presentationDealId: 601,
            xoDealId: 602,
            kpiItem: { itemId: '9001', status: 'confirmed' },
            historyItem: { itemId: '9002', status: 'suspected' },
            sections: [
                {
                    section: 'OBJECTIONS',
                    relevance: 100,
                    score: 6,
                    analysis: 'возражение из-за слабых потребностей',
                    advice: 'потренировать уточняющие вопросы',
                },
                { section: 'PRICE', relevance: 0 },
            ],
        });

        const addCall = bitrix.item.add.mock.calls[0] as unknown[];
        const fields = addCall[1] as Record<string, unknown>;
        expect(fields.ufCrm128DealMain).toEqual(['D_555']);
        expect(fields.ufCrm128DealPresentation).toEqual(['D_601']);
        expect(fields.ufCrm128DealXo).toEqual(['D_602']);
        expect(fields.ufCrm128KpiItemId).toBe('9001');
        expect(fields.ufCrm128KpiItemStatus).toBe(60);
        expect(fields.ufCrm128HistoryItemStatus).toBe(71);
        expect(fields.ufCrm128ObjectionsRelevance).toBe(100);
        expect(fields.ufCrm128ObjectionsScore).toBe(6);
        expect(fields.ufCrm128ObjectionsAdvice).toBe(
            'потренировать уточняющие вопросы',
        );
        expect(fields.ufCrm128PriceRelevance).toBe(0);
        expect(fields.ufCrm128PriceScore).toBeUndefined();
    });

    it('v3: next step, событийные флаги, multi-enum справочники и метрики речи', async () => {
        const bitrix = makeBitrix();
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await writer.addItem({
            activityId: '101',
            interlocutorRole: 'lpr',
            nextStepSet: true,
            nextStep: 'Презентация в четверг, подключает главбуха',
            nextStepDate: '2026-07-24',
            priceDiscussed: true,
            competitorMentioned: true,
            competitors: ['consultant', 'unknown-comp'],
            objectionCategories: ['price', 'need'],
            talkRatioPct: 52,
            questionsCount: 9,
            weightedScore: 62,
            coachingPriority: 'urgent',
        });

        const addCall = bitrix.item.add.mock.calls[0] as unknown[];
        const fields = addCall[1] as Record<string, unknown>;
        expect(fields.ufCrm128InterlocutorRole).toBe(80);
        expect(fields.ufCrm128NextStepSet).toBe(1);
        expect(fields.ufCrm128NextStepDate).toBe('2026-07-24');
        expect(fields.ufCrm128PriceDiscussed).toBe(1);
        expect(fields.ufCrm128CompetitorMentioned).toBe(1);
        expect(fields.ufCrm128Competitors).toEqual([95]);
        expect(fields.ufCrm128ObjectionCategories).toEqual([90, 91]);
        expect(fields.ufCrm128TalkRatioPct).toBe(52);
        expect(fields.ufCrm128QuestionsCount).toBe(9);
        expect(fields.ufCrm128WeightedScore).toBe(62);
        expect(fields.ufCrm128CoachingPriority).toBe(97);
    });

    it('длинный транскрипт раскладывается кусками по полям TRANSCRIPT_N', async () => {
        const bitrix = makeBitrix();
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await writer.addItem({
            activityId: '101',
            transcript: 'а'.repeat(90_000),
        });

        const addCall = bitrix.item.add.mock.calls[0] as unknown[];
        const fields = addCall[1] as Record<string, unknown>;
        expect((fields.ufCrm128Transcript1 as string).length).toBe(40_000);
        expect((fields.ufCrm128Transcript2 as string).length).toBe(40_000);
        expect((fields.ufCrm128Transcript3 as string).length).toBe(10_000);
        expect(fields.ufCrm128Transcript4).toBeUndefined();
    });

    it('неизвестный код enum пропускается, поле не пишется', async () => {
        const bitrix = makeBitrix();
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await writer.addItem({ activityId: '101', callType: 'unknown-type' });
        const addCall = bitrix.item.add.mock.calls[0] as unknown[];
        const fields = addCall[1] as Record<string, unknown>;
        expect(fields.ufCrm128CallType).toBeUndefined();
    });

    it('дедуп по xmlId: пишет aicall_{activityId} и не создаёт дубль', async () => {
        const bitrix = makeBitrix();
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await writer.addItem({ activityId: '101' });
        expect(bitrix.item.list).toHaveBeenCalledWith(
            '1056',
            { xmlId: 'aicall_101' },
            ['id', 'xmlId'],
        );
        const addCall = bitrix.item.add.mock.calls[0] as unknown[];
        const fields = addCall[1] as Record<string, unknown>;
        expect(fields.xmlId).toBe('aicall_101');

        // Повтор: элемент уже есть в Bitrix → возвращаем его id без add.
        bitrix.item.list.mockResolvedValue({
            result: { items: [{ id: 42 }] },
        });
        bitrix.item.add.mockClear();
        const itemId = await writer.addItem({ activityId: '101' });
        expect(itemId).toBe(42);
        expect(bitrix.item.add).not.toHaveBeenCalled();
    });

    it('сломанный поиск по xmlId не блокирует запись (fail-open)', async () => {
        const bitrix = makeBitrix();
        bitrix.item.list.mockRejectedValue(new Error('list down'));
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        const itemId = await writer.addItem({ activityId: '101' });
        expect(itemId).toBe(7);
    });

    it('бросает ошибку, если Bitrix не вернул id элемента', async () => {
        const bitrix = makeBitrix();
        bitrix.item.add.mockResolvedValue({ result: {} });
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await expect(writer.addItem({ activityId: '101' })).rejects.toThrow(
            'не вернул id',
        );
    });
});
