jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import { OfferPdfGenerateDto } from '../dto/offer-pdf-generate.dto';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { OfferPdfGenerateService } from '../services/offer-pdf-generate.service';
import { createOfferPdfModelFixture } from './fixtures/offer-pdf-model.fixture';

const buffer = Buffer.from('%PDF-1.7 test');
const model = createOfferPdfModelFixture();
const SERVER_LINK = 'https://app.test/api/files/token';
const BITRIX_LINK = 'https://test.bitrix24.ru/disk/file/42';

const createService = (bitrix: 'ok' | 'fallback' | 'throws' = 'ok') => {
    const modelService = { build: jest.fn().mockResolvedValue(model) };
    const renderService = {
        render: jest.fn().mockResolvedValue({
            buffer,
            durationMs: 42,
            templateCode: OfferPdfTemplateCode.CLASSIC,
        }),
    };
    const storage = { saveFile: jest.fn().mockResolvedValue('/abs/offer.pdf') };
    const fileLink = {
        createPublicLink: jest.fn().mockResolvedValue('/api/files/token'),
    };
    const config = { get: jest.fn().mockReturnValue('https://app.test') };
    const bxSaveFlow = {
        saveDocuments: jest
            .fn()
            .mockImplementation(
                (data: {
                    documents: Array<{ link: string; name: string }>;
                }) => {
                    if (bitrix === 'throws') {
                        return Promise.reject(new Error('нет доступа к Диску'));
                    }
                    const [doc] = data.documents;
                    return Promise.resolve({
                        portalFolderId: 1,
                        documents: [
                            {
                                link: bitrix === 'ok' ? BITRIX_LINK : doc.link,
                                name: doc.name,
                                type: 'offer',
                            },
                        ],
                        files: [],
                    });
                },
            ),
    };
    const timeline = {
        sendDocumentToBitrix: jest.fn().mockResolvedValue(undefined),
    };
    const service = new OfferPdfGenerateService(
        modelService as never,
        renderService as never,
        storage as never,
        fileLink as never,
        config as never,
        bxSaveFlow as never,
        timeline as never,
    );
    return {
        service,
        modelService,
        renderService,
        storage,
        fileLink,
        bxSaveFlow,
        timeline,
    };
};

const dto = {
    domain: 'test.bitrix24.ru',
    userId: 15,
    companyId: '7',
    dealId: '100',
    sets: {
        general: [
            {
                rows: {
                    garant: [
                        {
                            name: 'Бухгалтерия',
                            supply: { name: 'Интернет 3 ОД' },
                        },
                    ],
                },
            },
        ],
        alternative: [],
    },
} as unknown as OfferPdfGenerateDto;
const year = String(new Date().getFullYear());

describe('генерация PDF-КП', () => {
    it('предпросмотр — только рендер, без записи на диск и Битрикса', async () => {
        const { service, storage, fileLink, modelService, bxSaveFlow } =
            createService();
        const result = await service.preview(dto);
        expect(modelService.build).toHaveBeenCalledWith(dto);
        expect(result.buffer).toBe(buffer);
        expect(storage.saveFile).not.toHaveBeenCalled();
        expect(fileLink.createPublicLink).not.toHaveBeenCalled();
        expect(bxSaveFlow.saveDocuments).not.toHaveBeenCalled();
    });

    it('генерация кладёт файл в konstructor/offer/<год>/<домен>/<пользователь>, грузит в сделку и пишет в таймлайн', async () => {
        const { service, storage, fileLink, bxSaveFlow, timeline } =
            createService();
        const result = await service.generate(dto);

        expect(storage.saveFile).toHaveBeenCalledTimes(1);
        const [savedBuffer, fileName, , subPath] = storage.saveFile.mock
            .calls[0] as [Buffer, string, string, string];
        expect(savedBuffer).toBe(buffer);
        expect(fileName).toMatch(/^offer-[0-9a-f-]{36}\.pdf$/);
        expect(subPath).toBe(`konstructor/offer/${year}/test.bitrix24.ru/15`);
        expect(fileLink.createPublicLink).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            15,
            'konstructor',
            'offer',
            year,
            fileName,
        );

        expect(bxSaveFlow.saveDocuments).toHaveBeenCalledWith({
            domain: 'test.bitrix24.ru',
            companyId: '7',
            userId: 15,
            dealId: '100',
            documents: [
                {
                    absolutePath: '/abs/offer.pdf',
                    link: SERVER_LINK,
                    name: 'КП Бухгалтерия - Интернет 3 ОД',
                    type: 'offer',
                },
            ],
            onlyBitrixSave: false,
        });
        expect(timeline.sendDocumentToBitrix).toHaveBeenCalledWith(
            expect.objectContaining({
                dealId: '100',
                documents: [expect.objectContaining({ link: BITRIX_LINK })],
            }),
        );
        expect(result).toEqual({
            link: SERVER_LINK,
            fileName,
            templateCode: OfferPdfTemplateCode.CLASSIC,
            durationMs: 42,
            size: buffer.length,
            savedToDeal: true,
            bitrixLink: BITRIX_LINK,
            dealMessage: null,
        });
    });

    it('Диск Битрикса не принял файл — ссылка на сервер остаётся, в ответе причина', async () => {
        const { service, timeline } = createService('fallback');
        const result = await service.generate(dto);
        expect(result.savedToDeal).toBe(false);
        expect(result.bitrixLink).toBeNull();
        expect(result.dealMessage).toContain('ссылка на сервер');
        expect(timeline.sendDocumentToBitrix).toHaveBeenCalledTimes(1);
    });

    it('ошибка Битрикса не роняет генерацию', async () => {
        const { service, timeline } = createService('throws');
        const result = await service.generate(dto);
        expect(result.link).toBe(SERVER_LINK);
        expect(result.savedToDeal).toBe(false);
        expect(result.dealMessage).toContain('нет доступа к Диску');
        expect(timeline.sendDocumentToBitrix).not.toHaveBeenCalled();
    });

    it('saveToDeal=false — в Битрикс не ходим', async () => {
        const { service, bxSaveFlow, timeline } = createService();
        const result = await service.generate({ ...dto, saveToDeal: false });
        expect(bxSaveFlow.saveDocuments).not.toHaveBeenCalled();
        expect(timeline.sendDocumentToBitrix).not.toHaveBeenCalled();
        expect(result.savedToDeal).toBe(false);
        expect(result.dealMessage).toBeNull();
    });
});
