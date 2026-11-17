import {
    BitrixBaseApi,
    EBxMethod,
    EBxNamespace,
    EBXEntity,
} from 'src/modules/bitrix/core';
import { BxTimelineRepository } from '../repository/bx-timeline.repository';
import { BxTimelineService } from '../services/bx-timeline.service';
import { BxTimelineBatchService } from '../services/bx-timeline.batch.service';
import type { IBXTimelineLogMessage } from '../interface/bx-timeline.interface';

/**
 * Комментарии таймлайна: список с сортировкой (самые свежие) и замена текста
 * — crm.timeline.comment.list / crm.timeline.comment.update.
 */
function harness() {
    const callType = jest.fn(() => Promise.resolve({ result: [] }));
    const repository = new BxTimelineRepository({
        callType,
    } as unknown as BitrixBaseApi);
    return { repository, callType };
}

describe('BxTimelineRepository', () => {
    it('список без сортировки — запрос как раньше, без ключа order', async () => {
        const { repository, callType } = harness();

        await repository.getTimelineComments(
            { ENTITY_TYPE: 'deal', ENTITY_ID: 10 },
            ['ID', 'COMMENT'],
        );

        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.CRM,
            EBXEntity.TIMELINE_COMMENT,
            EBxMethod.LIST,
            {
                filter: { ENTITY_TYPE: 'deal', ENTITY_ID: 10 },
                select: ['ID', 'COMMENT'],
                start: -1,
            },
        );
    });

    it('список с сортировкой — самые свежие комментарии первой страницей', async () => {
        const { repository, callType } = harness();

        await repository.getTimelineComments(
            { ENTITY_TYPE: 'DYNAMIC_1058', ENTITY_ID: 9001 },
            ['ID', 'COMMENT'],
            { ID: 'DESC' },
        );

        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.CRM,
            EBXEntity.TIMELINE_COMMENT,
            EBxMethod.LIST,
            {
                filter: { ENTITY_TYPE: 'DYNAMIC_1058', ENTITY_ID: 9001 },
                select: ['ID', 'COMMENT'],
                order: { ID: 'DESC' },
                start: -1,
            },
        );
    });

    it('замена текста — только поле COMMENT по идентификатору комментария', async () => {
        const { repository, callType } = harness();

        await repository.updateTimelineComment('77', 'Новый текст');

        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.CRM,
            EBXEntity.TIMELINE_COMMENT,
            EBxMethod.UPDATE,
            { id: '77', fields: { COMMENT: 'Новый текст' } },
        );
    });
});

/**
 * crm.timeline.logmessage.add: строка метода собирается ядром из CRM +
 * 'timeline.logmessage' + 'add', поля — только документированные
 * (entityTypeId, entityId, title, text, iconCode) внутри `fields`.
 */
const message: IBXTimelineLogMessage = {
    entityTypeId: 2,
    entityId: 9041,
    title: 'Движение сделки',
    text: 'Под риском',
    iconCode: 'info',
};

describe('BxTimelineRepository: служебная лог-запись', () => {
    let callType: jest.Mock;
    let addCmdBatchType: jest.Mock;
    let api: BitrixBaseApi;

    beforeEach(() => {
        callType = jest.fn().mockResolvedValue({
            result: { logMessage: { id: 1 } },
        });
        addCmdBatchType = jest.fn();
        api = { callType, addCmdBatchType } as unknown as BitrixBaseApi;
    });

    it('addLogMessage — crm.timeline.logmessage.add с полями в fields', async () => {
        const response = await new BxTimelineRepository(api).addLogMessage(
            message,
        );

        expect(EBXEntity.TIMELINE_LOG_MESSAGE).toBe('timeline.logmessage');
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.CRM,
            EBXEntity.TIMELINE_LOG_MESSAGE,
            EBxMethod.ADD,
            { fields: message },
        );
        expect(response).toEqual({ result: { logMessage: { id: 1 } } });
    });

    it('без автоповтора: options уходят в callType пятым аргументом', async () => {
        const repo = new BxTimelineRepository(api);
        await repo.addLogMessage(message, { retries: 0 });
        await repo.addTimelineComment(
            { ENTITY_ID: 9041, ENTITY_TYPE: 'deal', COMMENT: 'Текст' },
            { retries: 0 },
        );

        expect(callType).toHaveBeenNthCalledWith(
            1,
            EBxNamespace.CRM,
            EBXEntity.TIMELINE_LOG_MESSAGE,
            EBxMethod.ADD,
            { fields: message },
            { retries: 0 },
        );
        expect(callType).toHaveBeenNthCalledWith(
            2,
            EBxNamespace.CRM,
            EBXEntity.TIMELINE_COMMENT,
            EBxMethod.ADD,
            {
                fields: {
                    ENTITY_ID: 9041,
                    ENTITY_TYPE: 'deal',
                    COMMENT: 'Текст',
                },
            },
            { retries: 0 },
        );
    });

    it('сервис и batch-сервис идут тем же методом', async () => {
        const service = new BxTimelineService();
        service.init(api);
        await service.addLogMessage(message);
        expect(callType).toHaveBeenCalledTimes(1);

        const batch = new BxTimelineBatchService();
        batch.init(api);
        batch.addLogMessage('log_1', message);
        expect(addCmdBatchType).toHaveBeenCalledWith(
            'log_1',
            EBxNamespace.CRM,
            EBXEntity.TIMELINE_LOG_MESSAGE,
            EBxMethod.ADD,
            { fields: message },
        );
    });
});
