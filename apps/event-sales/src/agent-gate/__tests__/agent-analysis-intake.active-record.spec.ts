import { AgentAnalysisIntakeService } from '../services/agent-analysis-intake.service';

/**
 * Идемпотентность приёма после переразбора: при старой superseded и новой
 * активной записи повторный push-back возвращает АКТИВНУЮ (её карточку),
 * новых записей и вызовов Битрикса нет.
 */
const ROW = {
    id: '42',
    domain: 'test.bitrix24.ru',
    activityId: '101',
    callStartedAt: new Date('2026-07-21T10:00:00Z'),
    text: 'текст',
    durationSec: '700',
    entityType: 'deal',
    entityId: '555',
    userId: '7',
};

function makeService(records: unknown[]) {
    const store = { findPipelineById: jest.fn().mockResolvedValue(ROW) };
    const aiService = {
        create: jest.fn(),
        update: jest.fn(),
        findByTranscriptionIds: jest.fn().mockResolvedValue(records),
    };
    const pbxService = { init: jest.fn() };
    const service = new AgentAnalysisIntakeService(
        store as never,
        aiService as never,
        pbxService as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
    );
    return { service, aiService, pbxService };
}

describe('AgentAnalysisIntakeService: активная запись при повторном push-back', () => {
    it('старая superseded + новая активная → возвращается новая без дубликатов и Битрикса', async () => {
        const { service, aiService, pbxService } = makeService([
            {
                id: '1',
                type: 'agent-analysis',
                status: 'superseded',
                report_item_id: '500',
            },
            {
                id: '2',
                type: 'agent-analysis',
                status: 'done',
                report_item_id: '600',
            },
        ]);
        const result = await service.intake('42', 'agent', {
            callType: 'presentation',
            summary: 'итог',
            needsFound: false,
            presentationDone: false,
        });
        expect(result).toEqual({
            aiId: '2',
            smartItemId: 600,
            smartInstalled: true,
        });
        expect(aiService.create).not.toHaveBeenCalled();
        expect(pbxService.init).not.toHaveBeenCalled();
    });

    it('только замещённая запись с карточкой — идемпотентность сохраняется по ней', async () => {
        const { service, aiService } = makeService([
            {
                id: '1',
                type: 'agent-analysis',
                status: 'superseded',
                report_item_id: '500',
            },
        ]);
        const result = await service.intake('42', 'agent', {
            callType: 'presentation',
            summary: 'итог',
            needsFound: false,
            presentationDone: false,
        });
        expect(result.aiId).toBe('1');
        expect(aiService.create).not.toHaveBeenCalled();
    });
});
