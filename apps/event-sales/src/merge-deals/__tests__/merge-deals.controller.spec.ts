import { MergeDealsController } from '../controllers/merge-deals.controller';
import { MergeDealsRequestDto } from '../dto/merge-deals.dto';
import {
    MERGE_DEALS_MODULE_NAME,
    MERGE_DEALS_STUB_MESSAGE,
    MergeDealsService,
} from '../services/merge-deals.service';

describe('MergeDealsController', () => {
    const controller = new MergeDealsController(new MergeDealsService());

    const dto: MergeDealsRequestDto = {
        domain: 'example.bitrix24.ru',
        targetDealId: 1024,
        sourceDealIds: [1025, 1026],
    };

    it('health отдаёт статус модуля с признаком незавершённой реализации', () => {
        expect(controller.getHealth()).toEqual({
            status: 'ok',
            module: MERGE_DEALS_MODULE_NAME,
            implemented: false,
        });
    });

    it('merge возвращает эхо запроса со статусом not_implemented', () => {
        expect(controller.merge(dto)).toEqual({
            status: 'not_implemented',
            domain: dto.domain,
            targetDealId: dto.targetDealId,
            sourceDealIds: dto.sourceDealIds,
            message: MERGE_DEALS_STUB_MESSAGE,
        });
    });

    it('merge не отдаёт наружу ссылку на массив из запроса', () => {
        const response = controller.merge(dto);

        expect(response.sourceDealIds).not.toBe(dto.sourceDealIds);
    });
});
