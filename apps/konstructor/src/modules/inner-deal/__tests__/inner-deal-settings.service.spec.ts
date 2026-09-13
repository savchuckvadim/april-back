import { BxDocumentDeal } from 'generated/prisma';
import { InnerDealRepository } from '../repositories/inner-deal.repository';
import { InnerDealService } from '../services/inner-deal.service';
import { ComplectCompositionDto } from '../dto/complect-composition.dto';
import {
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
} from '../type/complect-composition.type';

/**
 * Настройки сборки живут в колонке `settings` строки сделки и меняются
 * отдельной ручкой. Главное свойство: сохранение настроек не должно трогать
 * слепок конструктора — иначе выбор режима стирал бы собранный комплект.
 */
describe('InnerDealService.updateSettings', () => {
    const SETTINGS: ComplectCompositionDto = {
        mode: ComplectModeEnum.MULTI_CONTRACT,
        offer: {
            infoblocks: ComplectOfferInfoblocksEnum.MERGED,
            showAlternatives: true,
        },
        openVariantSmartId: 9001,
    };

    const makeService = (existing: Partial<BxDocumentDeal> | null) => {
        const update = jest
            .fn()
            .mockImplementation((id: bigint, data: Partial<BxDocumentDeal>) =>
                Promise.resolve({ ...existing, ...data, id }),
            );
        const create = jest
            .fn()
            .mockImplementation((data: Partial<BxDocumentDeal>) =>
                Promise.resolve({ ...data, id: BigInt(1) }),
            );
        const repository = {
            findSnapshot: jest.fn().mockResolvedValue(existing),
            update,
            create,
            findPortalIdByDomain: jest.fn().mockResolvedValue(BigInt(77)),
        } as unknown as InnerDealRepository;

        return { service: new InnerDealService(repository), update, create };
    };

    it('слепок уже есть — обновляем только настройки', async () => {
        const { service, update, create } = makeService({
            id: BigInt(5652),
            rows: '{"sets":{}}',
            app: '{"deal":1}',
        });

        await service.updateSettings('gsr.bitrix24.ru', 159701, SETTINGS);

        expect(create).not.toHaveBeenCalled();
        const [id, data] = update.mock.calls[0] as [
            bigint,
            Partial<BxDocumentDeal>,
        ];
        expect(id).toBe(BigInt(5652));
        // в запись уходит ТОЛЬКО колонка настроек
        expect(Object.keys(data)).toEqual(['settings']);
        expect(JSON.parse(data.settings as string)).toEqual(SETTINGS);
    });

    it('слепка ещё нет — заводим строку с одними настройками', async () => {
        const { service, create } = makeService(null);

        await service.updateSettings('gsr.bitrix24.ru', 159701, SETTINGS);

        const [data] = create.mock.calls[0] as [Partial<BxDocumentDeal>];
        expect(data.dealId).toBe(159701);
        expect(data.domain).toBe('gsr.bitrix24.ru');
        // строка сделки, а не варианта и не сервисного смарта
        expect(data.smartId).toBeNull();
        expect(data.serviceSmartId).toBeNull();
        expect(data.portalId).toBe(BigInt(77));
    });

    it('settings:null очищает колонку, а не пишет строку "null"', async () => {
        const { service, update } = makeService({ id: BigInt(5652) });

        await service.updateSettings('gsr.bitrix24.ru', 159701, null);

        const [, data] = update.mock.calls[0] as [
            bigint,
            Partial<BxDocumentDeal>,
        ];
        expect(data.settings).toBeNull();
    });
});
