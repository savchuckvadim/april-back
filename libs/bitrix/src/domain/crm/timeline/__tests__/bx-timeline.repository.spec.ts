import {
    BitrixBaseApi,
    EBxMethod,
    EBxNamespace,
    EBXEntity,
} from 'src/modules/bitrix/core';
import { BxTimelineRepository } from '../repository/bx-timeline.repository';

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
