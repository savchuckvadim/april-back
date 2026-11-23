import { Logger } from '@nestjs/common';
import type {
    ProviderImageContent,
    ProviderImageRole,
} from '@lib/portal-lib/konstructor';
import { OfferPdfGenerateDto } from '../dto/offer-pdf-generate.dto';
import { OFFER_PDF_DEFAULT_SETTINGS } from '../model/offer-pdf-settings';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { OfferPdfDocumentModelService } from '../services/offer-pdf-document-model.service';
import { createOfferRenderDataFixture } from './fixtures/offer-pdf-model.fixture';

const data = createOfferRenderDataFixture();

interface RqStub {
    id?: number;
    type?: string;
    director?: string | null;
    position?: string | null;
    fullname?: string | null;
    shortname?: string | null;
}

const createService = (
    rq: RqStub | null,
    portalLetter: Promise<{ text: string } | null> = Promise.resolve(null),
    images: Promise<ProviderImageContent[]> = Promise.resolve([]),
) => {
    const letters = { findPortalDefault: jest.fn(() => portalLetter) };
    const renderData = {
        getOfferRenderData: jest
            .fn<Promise<typeof data>, [OfferPdfGenerateDto]>()
            .mockResolvedValue(data),
    };
    const provider = { findById: jest.fn().mockResolvedValue(rq) };
    // как настоящий сервис: отдаёт только картинки запрошенных ролей
    const providerImages = {
        loadContents: jest.fn(
            (_rqId: number, roles: readonly ProviderImageRole[]) =>
                images.then(list =>
                    list.filter(content => roles.includes(content.role)),
                ),
        ),
    };
    const service = new OfferPdfDocumentModelService(
        renderData as never,
        provider as never,
        letters as never,
        providerImages as never,
    );
    return { service, renderData, provider, letters, providerImages };
};

const stampBytes = Buffer.from('png-stamp');
const signatureBytes = Buffer.from('jpg-signature');
const logoBytes = Buffer.from('png-logo');

const allImages = (): ProviderImageContent[] => [
    { role: 'stamp', format: 'png', data: stampBytes },
    { role: 'signature_director', format: 'jpg', data: signatureBytes },
    { role: 'logo', format: 'png', data: logoBytes },
];

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

describe('сборка модели PDF-КП: картинки поставщика', () => {
    afterEach(() => jest.restoreAllMocks());

    const mutedWarn = () =>
        jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);

    it('есть картинки — печать, подпись руководителя и логотип лежат в model.images', async () => {
        const { service, providerImages } = createService(
            { id: 41, director: 'Кузнецов А. В.' },
            Promise.resolve(null),
            Promise.resolve(allImages()),
        );
        const model = await service.build(dto);

        expect(model.images).toEqual({
            stamp: { data: stampBytes, format: 'png' },
            signature: { data: signatureBytes, format: 'jpg' },
            logo: { data: logoBytes, format: 'png' },
        });
        // читаются реквизиты поставщика (rqs.id); подпись бухгалтера не запрашивается
        expect(providerImages.loadContents).toHaveBeenCalledWith(41, [
            'stamp',
            'signature_director',
            'logo',
        ]);
    });

    it('подпись бухгалтера, даже вернувшись из хранилища, в модель не попадает', async () => {
        const { service } = createService(
            { id: 41, director: 'Кузнецов А. В.' },
            Promise.resolve(null),
            Promise.resolve([
                {
                    role: 'signature_accountant',
                    format: 'png',
                    data: stampBytes,
                },
            ]),
        );
        expect((await service.build(dto)).images).toEqual({});
    });

    it('без картинок документ собирается как раньше: пустые images, прежний подписант', async () => {
        const { service } = createService({
            id: 41,
            director: 'Кузнецов А. В.',
            position: 'Директор',
        });
        const model = await service.build(dto);

        expect(model.images).toEqual({});
        expect(model.signer).toEqual({
            name: 'Кузнецов А. В.',
            position: 'Директор',
        });
    });

    it('«с печатями и подписями» выключено — читается и печатается только логотип', async () => {
        const { service, providerImages } = createService(
            { id: 41, director: 'Кузнецов А. В.', position: 'Директор' },
            Promise.resolve(null),
            Promise.resolve(allImages()),
        );
        const model = await service.build({
            ...dto,
            settings: { withStamps: false },
        });

        expect(providerImages.loadContents).toHaveBeenCalledTimes(1);
        expect(providerImages.loadContents).toHaveBeenCalledWith(41, ['logo']);
        expect(model.images).toEqual({
            logo: { data: logoBytes, format: 'png' },
        });
        expect(model.signer).toEqual({
            name: 'Кузнецов А. В.',
            position: 'Директор',
        });
    });

    it('«с печатями и подписями» включено — логотип читается вместе с печатью и подписью одним запросом', async () => {
        const { service, providerImages } = createService(
            { id: 41, director: 'Кузнецов А. В.' },
            Promise.resolve(null),
            Promise.resolve(allImages()),
        );
        await service.build({ ...dto, settings: { withStamps: true } });

        expect(providerImages.loadContents).toHaveBeenCalledTimes(1);
    });

    it('нет реквизитов поставщика — картинки не читаются', async () => {
        const { service, providerImages } = createService(null);
        expect((await service.build(dto)).images).toEqual({});
        expect(providerImages.loadContents).not.toHaveBeenCalled();
    });

    it('нет таблицы — документ без картинок и одна строка в логе', async () => {
        const warn = mutedWarn();
        const { service } = createService(
            { id: 41, director: 'Кузнецов А. В.' },
            Promise.resolve(null),
            Promise.reject(new Error('нет таблицы')),
        );

        const model = await service.build(dto);

        expect(model.images).toEqual({});
        expect(model.signer?.name).toBe('Кузнецов А. В.');
        expect(warn).toHaveBeenCalledTimes(1);
        const line = String(warn.mock.calls[0][0]);
        expect(line).toContain('не прочитаны');
        expect(line).toContain('нет таблицы');
        expect(line).not.toContain('\n');
    });

    it('галочка выключена, таблицы нет — документ без картинок и одна строка в логе', async () => {
        const warn = mutedWarn();
        const { service } = createService(
            { id: 41, director: 'Кузнецов А. В.' },
            Promise.resolve(null),
            Promise.reject(new Error('нет таблицы')),
        );

        const model = await service.build({
            ...dto,
            settings: { withStamps: false },
        });

        expect(model.images).toEqual({});
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('нет таблицы');
    });

    it('ошибка Prisma P2021 пишется одной строкой: «нет таблицы provider_images»', async () => {
        const warn = mutedWarn();
        const prismaError = Object.assign(
            new Error(
                '\nInvalid `prisma.providerImage.findMany()` invocation:\n\nThe table `provider_images` does not exist in the current database.',
            ),
            { code: 'P2021' },
        );
        const { service } = createService(
            { id: 41, director: 'Кузнецов А. В.' },
            Promise.resolve(null),
            Promise.reject(prismaError),
        );

        expect((await service.build(dto)).images).toEqual({});
        expect(warn).toHaveBeenCalledTimes(1);
        const line = String(warn.mock.calls[0][0]);
        expect(line).toContain('нет таблицы provider_images');
        expect(line).not.toContain('\n');
    });

    it('прочая ошибка чтения тоже одной строкой, без переносов из текста ошибки', async () => {
        const warn = mutedWarn();
        const { service } = createService(
            { id: 41, director: 'Кузнецов А. В.' },
            Promise.resolve(null),
            Promise.reject(new Error('соединение\nс базой\n  потеряно')),
        );

        expect((await service.build(dto)).images).toEqual({});
        expect(String(warn.mock.calls[0][0])).toContain(
            'соединение с базой потеряно',
        );
    });
});

describe('сборка модели PDF-КП: подписант без директора (ИП)', () => {
    const ip: RqStub = {
        id: 41,
        type: 'ip',
        director: '',
        fullname: 'Индивидуальный предприниматель Иванов Иван Иванович',
        shortname: 'ИП Иванов И. И.',
    };

    it('есть печать — блок печатается: слева название поставщика, справа пусто', async () => {
        const { service } = createService(
            ip,
            Promise.resolve(null),
            Promise.resolve(allImages()),
        );
        const model = await service.build(dto);

        expect(model.signer).toEqual({
            name: '',
            position: 'Индивидуальный предприниматель Иванов Иван Иванович',
        });
        expect(model.images.stamp).toBeDefined();
    });

    it('есть только подпись — блок тоже печатается', async () => {
        const { service } = createService(
            ip,
            Promise.resolve(null),
            Promise.resolve([
                { role: 'signature_director', format: 'png', data: stampBytes },
            ]),
        );
        expect((await service.build(dto)).signer?.position).toBe(
            'Индивидуальный предприниматель Иванов Иван Иванович',
        );
    });

    it('галочка выключена — блока подписи нет, логотип остаётся', async () => {
        const { service } = createService(
            ip,
            Promise.resolve(null),
            Promise.resolve(allImages()),
        );
        const model = await service.build({
            ...dto,
            settings: { withStamps: false },
        });

        expect(model.signer).toBeNull();
        expect(model.images).toEqual({
            logo: { data: logoBytes, format: 'png' },
        });
    });

    it('есть только логотип — блока подписи нет, как и раньше', async () => {
        const { service } = createService(
            ip,
            Promise.resolve(null),
            Promise.resolve([{ role: 'logo', format: 'png', data: logoBytes }]),
        );
        const model = await service.build(dto);

        expect(model.signer).toBeNull();
        expect(model.images.logo).toBeDefined();
    });

    it('картинок нет — подписанта нет, документ печатается как раньше', async () => {
        const { service } = createService(ip);
        expect((await service.build(dto)).signer).toBeNull();
    });

    it('полное название пусто — слева краткое название', async () => {
        const { service } = createService(
            { ...ip, fullname: 'null' },
            Promise.resolve(null),
            Promise.resolve(allImages()),
        );
        expect((await service.build(dto)).signer?.position).toBe(
            'ИП Иванов И. И.',
        );
    });

    it('директор указан — подписант прежний, картинки на него не влияют', async () => {
        const { service } = createService(
            { ...ip, director: 'Иванов И. И.', position: 'Директор' },
            Promise.resolve(null),
            Promise.resolve(allImages()),
        );
        expect((await service.build(dto)).signer).toEqual({
            name: 'Иванов И. И.',
            position: 'Директор',
        });
    });
});
