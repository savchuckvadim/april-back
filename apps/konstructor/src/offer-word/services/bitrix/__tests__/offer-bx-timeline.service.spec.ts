import type { PBXService } from '@lib/pbx/pbx.service';
import { OfferBxTimelineService } from '../offer-bx-timeline.service';

const setup = () => {
    const addTimelineComment = jest.fn();
    const callBatchWithConcurrency = jest.fn().mockResolvedValue(undefined);
    const pbx = {
        init: jest.fn().mockResolvedValue({
            bitrix: {
                batch: { timeline: { addTimelineComment } },
                api: { callBatchWithConcurrency },
            },
        }),
    } as unknown as PBXService;
    return {
        service: new OfferBxTimelineService(pbx),
        addTimelineComment,
        callBatchWithConcurrency,
    };
};

describe('OfferBxTimelineService.sendErrorToBitrix', () => {
    it('в сделку уходит причина под значком ошибки', async () => {
        const { service, addTimelineComment, callBatchWithConcurrency } =
            setup();

        await service.sendErrorToBitrix({
            domain: 'gsirk.bitrix24.ru',
            companyId: '3',
            userId: 6,
            dealId: '281275',
            reason: 'КП не сформировано: загрузка на Диск — Битрикс ответил «Не удалось сохранить файл» (DISK_FOLDER_22002). Повторите формирование.',
        });

        expect(addTimelineComment).toHaveBeenCalledTimes(1);
        expect(addTimelineComment).toHaveBeenCalledWith(
            expect.stringContaining('_add_timeline_deal_281275'),
            {
                ENTITY_ID: '281275',
                ENTITY_TYPE: 'deal',
                AUTHOR_ID: '6',
                COMMENT:
                    '❌ КП не сформировано: загрузка на Диск — Битрикс ответил «Не удалось сохранить файл» (DISK_FOLDER_22002). Повторите формирование.',
            },
        );
        expect(callBatchWithConcurrency).toHaveBeenCalledWith(1);
    });

    it('«&», «+» и «%» из ответа Битрикса экранируются: команда пачки не обрывается', async () => {
        const { service, addTimelineComment } = setup();

        await service.sendErrorToBitrix({
            domain: 'gsirk.bitrix24.ru',
            companyId: '3',
            userId: 6,
            dealId: '281275',
            reason: 'КП не сформировано: Битрикс ответил «Лимит 100% & 5+ файлов #1»',
        });

        const data = addTimelineComment.mock.calls[0][1] as { COMMENT: string };
        expect(data.COMMENT).toBe(
            '❌ КП не сформировано: Битрикс ответил «Лимит 100%25 %26 5%2B файлов %231»',
        );
    });
});
