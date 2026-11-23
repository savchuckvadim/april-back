import { Test } from '@nestjs/testing';
import { PBXService } from '@lib/pbx';
import { COMPLECT_VARIANT_STAGE } from '@lib/portal-lib/pbx/pbx-complect-variant-smart';
import { ComplectVariantLifecycleService } from '../services/complect-variant-lifecycle.service';
import { ComplectVariantOfferStageService } from '../services/complect-variant-offer-stage.service';

/**
 * Стадия «КП» участникам: точка одна — генерация КП. Best-effort: сбой
 * портала или смарта КП не ломает, оно уже сохранено.
 */
const setup = async (init = jest.fn()) => {
    init.mockResolvedValue({ bitrix: {}, PortalModel: {} });
    const moduleRef = await Test.createTestingModule({
        providers: [
            ComplectVariantOfferStageService,
            { provide: PBXService, useValue: { init } },
        ],
    }).compile();
    return { service: moduleRef.get(ComplectVariantOfferStageService), init };
};

describe('ComplectVariantOfferStageService', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('участники переводятся на стадию «КП» только вперёд, одним вызовом', async () => {
        const markStageForward = jest
            .spyOn(
                ComplectVariantLifecycleService.prototype,
                'markStageForward',
            )
            .mockResolvedValue({ requested: 2, moved: 2, skipped: 0 });
        const { service, init } = await setup();

        await service.markOffer('test.bitrix24.ru', [
            { variantSmartId: 11 },
            { variantSmartId: 12 },
        ]);

        expect(init).toHaveBeenCalledWith('test.bitrix24.ru');
        expect(markStageForward).toHaveBeenCalledTimes(1);
        expect(markStageForward).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            [11, 12],
            COMPLECT_VARIANT_STAGE.OFFER,
        );
    });

    it('варианты без элемента смарта пропускаются; нет ни одного — на портал не ходим', async () => {
        const markStageForward = jest
            .spyOn(
                ComplectVariantLifecycleService.prototype,
                'markStageForward',
            )
            .mockResolvedValue({ requested: 1, moved: 1, skipped: 0 });
        const { service, init } = await setup();

        await service.markOffer('test.bitrix24.ru', [
            { variantSmartId: null },
            { variantSmartId: 0 },
            { variantSmartId: 7 },
        ]);
        expect(markStageForward).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            [7],
            COMPLECT_VARIANT_STAGE.OFFER,
        );

        init.mockClear();
        await service.markOffer('test.bitrix24.ru', [{ variantSmartId: null }]);
        await service.markOffer('test.bitrix24.ru', []);
        await service.markOffer('test.bitrix24.ru', undefined);
        expect(init).not.toHaveBeenCalled();
    });

    it('сбой подключения к порталу не бросается наружу', async () => {
        const markStageForward = jest.spyOn(
            ComplectVariantLifecycleService.prototype,
            'markStageForward',
        );
        const { service, init } = await setup();
        init.mockRejectedValue(new Error('портал недоступен'));

        await expect(
            service.markOffer('test.bitrix24.ru', [{ variantSmartId: 11 }]),
        ).resolves.toBeUndefined();
        expect(markStageForward).not.toHaveBeenCalled();
    });

    it('сбой перевода стадии не бросается наружу', async () => {
        jest.spyOn(
            ComplectVariantLifecycleService.prototype,
            'markStageForward',
        ).mockRejectedValue(new Error('смарт не отвечает'));
        const { service } = await setup();

        await expect(
            service.markOffer('test.bitrix24.ru', [{ variantSmartId: 11 }]),
        ).resolves.toBeUndefined();
    });
});
