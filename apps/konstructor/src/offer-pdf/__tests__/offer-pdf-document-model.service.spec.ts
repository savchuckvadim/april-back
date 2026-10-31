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
    const service = new OfferPdfDocumentModelService(
        renderData as never,
        provider as never,
    );
    return { service, renderData, provider };
};

const dto = {
    providerId: 7,
    domain: 'test.bitrix24.ru',
    userId: 1,
} as OfferPdfGenerateDto;

describe('сборка модели PDF-КП', () => {
    it('данные — от OfferRenderDataService, подписант — из реквизитов поставщика', async () => {
        const { service, renderData, provider } = createService({
            director: ' Кузнецов А. В. ',
            position: 'Директор',
        });
        const model = await service.build(dto);

        expect(renderData.getOfferRenderData).toHaveBeenCalledWith(dto);
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
