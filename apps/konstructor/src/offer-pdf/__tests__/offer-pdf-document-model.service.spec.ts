import { OfferPdfGenerateDto } from '../dto/offer-pdf-generate.dto';
import { OFFER_PDF_DEFAULT_SETTINGS } from '../model/offer-pdf-settings';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { OfferPdfDocumentModelService } from '../services/offer-pdf-document-model.service';
import { createOfferRenderDataFixture } from './fixtures/offer-pdf-model.fixture';

const data = createOfferRenderDataFixture();

const createService = (
    rq: { director?: string | null; position?: string | null } | null,
    portalLetter: Promise<{ text: string } | null> = Promise.resolve(null),
) => {
    const letters = { findPortalDefault: jest.fn(() => portalLetter) };
    const renderData = {
        getOfferRenderData: jest
            .fn<Promise<typeof data>, [OfferPdfGenerateDto]>()
            .mockResolvedValue(data),
    };
    const provider = { findById: jest.fn().mockResolvedValue(rq) };
    const service = new OfferPdfDocumentModelService(
        renderData as never,
        provider as never,
        letters as never,
    );
    return { service, renderData, provider, letters };
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
    it('данные — от OfferRenderDataService по запросу как есть (подписи уже дополнены), подписант — из реквизитов', async () => {
        const { service, renderData, provider } = createService({
            director: ' Кузнецов А. В. ',
            position: 'Директор',
        });
        const model = await service.build(dto);

        const [passed] = renderData.getOfferRenderData.mock.calls[0];
        expect(passed).toBe(dto);

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

    it('письмо: из запроса сильнее письма портала, пустое — письмо портала', async () => {
        const own = createService(
            null,
            Promise.resolve({ text: 'Вот уже 35 лет…' }),
        );
        const withText = await own.service.build({
            ...dto,
            letter: { text: ' Своё письмо ' },
        });
        expect(withText.letter.text).toBe('Своё письмо');
        expect(own.letters.findPortalDefault).not.toHaveBeenCalled();

        const portal = createService(
            null,
            Promise.resolve({ text: ' Вот уже 35 лет… ' }),
        );
        const withoutText = await portal.service.build(dto);
        expect(withoutText.letter.text).toBe('Вот уже 35 лет…');
        expect(portal.letters.findPortalDefault).toHaveBeenCalledWith(
            'test.bitrix24.ru',
        );
    });

    it('сбой чтения письма портала не роняет КП — текст шаблона по умолчанию', async () => {
        const { service } = createService(
            null,
            Promise.reject(new Error('нет таблицы')),
        );
        expect((await service.build(dto)).letter.text).toBeNull();
    });

    it('название варианта попадает в модель обрезанным; без него или пустое — null', async () => {
        const { service } = createService(null);
        expect(
            (await service.build(dto, { variantTitle: ' Юрист ' }))
                .variantTitle,
        ).toBe('Юрист');
        expect((await service.build(dto)).variantTitle).toBeNull();
        expect(
            (await service.build(dto, { variantTitle: '  ' })).variantTitle,
        ).toBeNull();
        expect(
            (await service.build(dto, { variantTitle: null })).variantTitle,
        ).toBeNull();
    });

    it('настройки, письмо, стиль и гамма берутся из запроса и не зависят от варианта', async () => {
        const { service } = createService(null);
        const request = {
            ...dto,
            templateCode: OfferPdfTemplateCode.PRISM,
            palette: ' garant ',
            documentNumber: 'КП-9',
            settings: { withStamps: false },
            letter: { appeal: 'Здравствуйте!', text: 'Письмо' },
        };
        const first = await service.build(request, { variantTitle: 'Юрист' });
        const second = await service.build(request, {
            variantTitle: 'Бухгалтер',
        });

        for (const model of [first, second]) {
            expect(model.templateCode).toBe(OfferPdfTemplateCode.PRISM);
            expect(model.palette).toBe('garant');
            expect(model.meta.documentNumber).toBe('КП-9');
            expect(model.settings.withStamps).toBe(false);
            expect(model.letter).toEqual({
                appeal: 'Здравствуйте!',
                text: 'Письмо',
            });
        }
        expect(first.variantTitle).toBe('Юрист');
        expect(second.variantTitle).toBe('Бухгалтер');
    });
});
