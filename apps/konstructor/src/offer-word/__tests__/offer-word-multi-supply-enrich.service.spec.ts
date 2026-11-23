import {
    DocumentVariantDto,
    DocumentVariantSetsDto,
} from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import {
    SupplyCaptionPayload,
    SupplyPayloadEnricherService,
} from '@app/konstructor/document-generate/supply/supply-payload-enricher.service';
import {
    captionRow,
    createSupplyKit,
    fullSet,
    INTERNET_10_CAPTION,
    INTERNET_5_CAPTION,
    RowCaptions,
    supplyDto,
} from '@app/konstructor/document-generate/supply/__tests__/supply-caption.fixtures';
import { SupplyDto } from '@app/konstructor/dto/supply.dto';
import { ProductRowFullSetsDto } from '../dto/offer-word-generate-request.dto';
import { OfferWordMultiGenerateDto } from '../multi/dto/offer-word-multi-generate.dto';
import { OfferWordMultiSupplyEnrichService } from '../multi/services/offer-word-multi-supply-enrich.service';

/**
 * Подписи поставок в запросе КП v2: верх запроса печатается при одном
 * участнике, каждый вариант печатается сам, счёт собирается из sets.
 */
const build = () => {
    const kit = createSupplyKit();
    const enricher = new SupplyPayloadEnricherService(kit.supplyTexts);
    return {
        ...kit,
        enricher,
        service: new OfferWordMultiSupplyEnrichService(enricher),
    };
};

const variantOf = (
    title: string,
    supply: SupplyDto,
    captions: RowCaptions = {},
): DocumentVariantDto =>
    Object.assign(new DocumentVariantDto(), {
        variantSmartId: 1,
        title,
        supply,
        rows: [captionRow(`Строка ${title}`, supply, captions)],
        sets: Object.assign(new DocumentVariantSetsDto(), {
            general: [fullSet(1, supply, captions)],
            alternative: [fullSet(2, supply, captions)],
        }),
        total: captionRow(`Итого ${title}`, supply, captions),
    });

const requestOf = (
    supply: SupplyDto,
    variants?: DocumentVariantDto[],
): OfferWordMultiGenerateDto =>
    Object.assign(new OfferWordMultiGenerateDto(), {
        domain: 'test.bitrix24.ru',
        supply,
        rows: [captionRow('Строка запроса', supply)],
        sets: Object.assign(new ProductRowFullSetsDto(), {
            general: [fullSet(1, supply)],
            alternative: [fullSet(2, supply)],
        }),
        total: captionRow('Итого запроса', supply),
        ...(variants ? { variants } : {}),
    });

/** Подписи КП там, где их берут документы: supply, rows, total и оба набора. */
const captionsOf = (part: SupplyCaptionPayload) => {
    const sets = [
        ...(part.sets?.general ?? []),
        ...(part.sets?.alternative ?? []),
    ];
    return {
        supply: part.supply?.quantityForKp,
        rows: part.rows?.map(row => row.product.quantityForKp),
        total: part.total?.product.quantityForKp,
        sets: sets.map(set => [
            set.rows.garant?.[0]?.product.quantityForKp,
            set.total[0]?.product.quantityForKp,
        ]),
    };
};

const expectedCaptions = (caption: string) => ({
    supply: caption,
    rows: [caption],
    total: caption,
    sets: [
        [caption, caption],
        [caption, caption],
    ],
});

describe('OfferWordMultiSupplyEnrichService', () => {
    it('верх запроса и каждый вариант дополнены: supply, rows, total и sets', async () => {
        const { service } = build();
        const internet5 = supplyDto('internet_5', 5);
        const internet10 = supplyDto('internet_10', 10);
        const dto = requestOf(internet5, [
            variantOf('Юрист', internet5),
            variantOf('Бухгалтер', internet10),
        ]);

        const result = await service.enrich(dto);

        expect(captionsOf(result)).toEqual(
            expectedCaptions(INTERNET_5_CAPTION),
        );
        expect(result.variants).toHaveLength(2);
        expect(captionsOf(result.variants[0])).toEqual(
            expectedCaptions(INTERNET_5_CAPTION),
        );
        expect(captionsOf(result.variants[1])).toEqual(
            expectedCaptions(INTERNET_10_CAPTION),
        );
    });

    it('остальные поля запроса и варианта сохраняются', async () => {
        const { service } = build();
        const supply = supplyDto('internet_5', 5);
        const dto = requestOf(supply, [variantOf('Юрист', supply)]);

        const result = await service.enrich(dto);

        expect(result.domain).toBe('test.bitrix24.ru');
        expect(result.variants[0].title).toBe('Юрист');
        expect(result.variants[0].variantSmartId).toBe(1);
        expect(result.variants[0].rows[0].name).toBe('Строка Юрист');
    });

    it('подписи, пришедшие с фронта, остаются как есть', async () => {
        const { service } = build();
        const supply = supplyDto('internet_5', 5);
        const own: RowCaptions = {
            quantityForKp: 'Подпись из конструктора',
            forkp: 'Поставка из конструктора',
        };
        const ownSupply = Object.assign(supplyDto('internet_5', 5), {
            quantityForKp: own.quantityForKp,
        });
        const dto = requestOf(supply, [variantOf('Юрист', ownSupply, own)]);

        const result = await service.enrich(dto);

        expect(captionsOf(result.variants[0])).toEqual(
            expectedCaptions('Подпись из конструктора'),
        );
        expect(result.variants[0].rows[0].supply?.forkp).toBe(
            'Поставка из конструктора',
        );
    });

    it('одна память на запрос: поставка читается из справочника один раз, чтения идут по одному', async () => {
        const { service, enricher, repository } = build();
        const supply = supplyDto('internet_5', 5);
        const enrichPayload = jest.spyOn(enricher, 'enrichPayload');
        const dto = requestOf(supply, [
            variantOf('Юрист', supply),
            variantOf('Бухгалтер', supply),
            variantOf('Кадровик', supply),
        ]);

        await service.enrich(dto);

        // верх запроса и три варианта
        expect(enrichPayload).toHaveBeenCalledTimes(4);
        const memos = enrichPayload.mock.calls.map(([, memo]) => memo);
        expect(new Set(memos).size).toBe(1);
        expect(repository.byCodeCalls).toBe(1);
        expect(repository.maxInFlight).toBe(1);
    });

    it('запрос без variants остаётся без variants, пустой список остаётся пустым', async () => {
        const { service } = build();
        const supply = supplyDto('internet_5', 5);

        const single = await service.enrich(requestOf(supply));
        const empty = await service.enrich(requestOf(supply, []));

        expect(single.variants).toBeUndefined();
        expect(captionsOf(single)).toEqual(
            expectedCaptions(INTERNET_5_CAPTION),
        );
        expect(empty.variants).toEqual([]);
    });

    it('пришедший запрос и его варианты не меняются', async () => {
        const { service } = build();
        const supply = supplyDto('internet_5', 5);
        const dto = requestOf(supply, [variantOf('Юрист', supply)]);
        const before = structuredClone(dto);

        await service.enrich(dto);

        expect(dto).toEqual(before);
    });
});
