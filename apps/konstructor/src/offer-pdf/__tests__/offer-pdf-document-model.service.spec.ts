import { OfferPdfGenerateDto } from '../dto/offer-pdf-generate.dto';
import { OFFER_PDF_DEFAULT_SETTINGS } from '../model/offer-pdf-settings';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { OfferPdfDocumentModelService } from '../services/offer-pdf-document-model.service';
import { createOfferRenderDataFixture } from './fixtures/offer-pdf-model.fixture';

const data = createOfferRenderDataFixture();

const createService = (
    rq: { director?: string | null; position?: string | null } | null,
) => {
    const renderData = {
        getOfferRenderData: jest.fn().mockResolvedValue(data),
    };
    const provider = { findById: jest.fn().mockResolvedValue(rq) };
    // обогащение подписей поставок: помечаем, что прошли через него
    const enricher = {
        enrichSupply: jest.fn((supply: unknown) =>
            Promise.resolve({ ...(supply as object), enriched: true }),
        ),
        enrichRows: jest.fn((rows: unknown[]) =>
            Promise.resolve(
                rows.map(row => ({ ...(row as object), enriched: true })),
            ),
        ),
        enrichRow: jest.fn((row: unknown) =>
            Promise.resolve({ ...(row as object), enriched: true }),
        ),
    };
    const service = new OfferPdfDocumentModelService(
        renderData as never,
        provider as never,
        enricher as never,
    );
    return { service, renderData, provider, enricher };
};

const dto = {
    providerId: 7,
    domain: 'test.bitrix24.ru',
    userId: 1,
    supply: { code: 'internet_3' },
    rows: [{ id: 1 }, { id: 2 }],
    total: { id: 0 },
} as unknown as OfferPdfGenerateDto;

describe('сборка модели PDF-КП', () => {
    it('данные — от OfferRenderDataService по обогащённому запросу, подписант — из реквизитов', async () => {
        const { service, renderData, provider, enricher } = createService({
            director: ' Кузнецов А. В. ',
            position: 'Директор',
        });
        const model = await service.build(dto);

        expect(enricher.enrichSupply).toHaveBeenCalledWith(dto.supply);
        expect(enricher.enrichRows).toHaveBeenCalledWith(dto.rows);
        expect(enricher.enrichRow).toHaveBeenCalledWith(dto.total);
        // jest.fn без дженериков — сигнатура jest.fn<…> различается между версиями типов
        const calls = renderData.getOfferRenderData.mock
            .calls as unknown as Array<[OfferPdfGenerateDto]>;
        const [passed] = calls[0];
        expect(passed.supply).toEqual({ code: 'internet_3', enriched: true });
        expect(passed.rows).toEqual([
            { id: 1, enriched: true },
            { id: 2, enriched: true },
        ]);
        expect(passed.total).toEqual({ id: 0, enriched: true });
        expect(passed.providerId).toBe(7);

        expect(provider.findById).toHaveBeenCalledWith(7);
        expect(model.data).toBe(data);
        expect(model.signer).toEqual({
            name: 'Кузнецов А. В.',
            position: 'Директор',
        });
        expect(model.templateCode).toBe(OfferPdfTemplateCode.CLASSIC);
        expect(model.settings).toEqual(OFFER_PDF_DEFAULT_SETTINGS);
        expect(model.letter).toEqual({ appeal: null, text: null });
        expect(model.images).toEqual({});
    });

    it('дата по-русски, номер документа обрезается', async () => {
        const { service } = createService(null);
        const model = await service.build({ ...dto, documentNumber: ' КП-7 ' });
        expect(model.meta.date).toMatch(/^\d{1,2} [а-я]+ \d{4} г\.$/);
        expect(model.meta.documentNumber).toBe('КП-7');
    });

    it('без руководителя подписанта нет; должность по умолчанию — «Руководитель»', async () => {
        expect(
            (await createService(null).service.build(dto)).signer,
        ).toBeNull();
        expect(
            (await createService({ director: 'null' }).service.build(dto))
                .signer,
        ).toBeNull();
        expect(
            (await createService({ director: 'Иванов' }).service.build(dto))
                .signer,
        ).toEqual({ name: 'Иванов', position: 'Руководитель' });
    });

    it('письмо и настройки из запроса', async () => {
        const { service } = createService(null);
        const model = await service.build({
            ...dto,
            templateCode: OfferPdfTemplateCode.CLASSIC,
            letter: { appeal: '  Уважаемый!  ', text: '' },
            settings: { withManager: false },
        });
        expect(model.letter).toEqual({ appeal: 'Уважаемый!', text: null });
        expect(model.settings.withManager).toBe(false);
        expect(model.settings.withStamps).toBe(true);
    });
});
