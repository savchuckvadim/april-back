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

const createService = () => {
    const modelService = { build: jest.fn().mockResolvedValue(model) };
    const renderService = {
        render: jest.fn().mockResolvedValue({
            buffer,
            durationMs: 42,
            templateCode: OfferPdfTemplateCode.CLASSIC,
        }),
    };
    const storage = { saveFile: jest.fn().mockResolvedValue('/abs/path') };
    const fileLink = {
        createPublicLink: jest.fn().mockResolvedValue('/api/files/token'),
    };
    const config = { get: jest.fn().mockReturnValue('https://app.test') };
    const service = new OfferPdfGenerateService(
        modelService as never,
        renderService as never,
        storage as never,
        fileLink as never,
        config as never,
    );
    return { service, modelService, renderService, storage, fileLink };
};

const dto = { domain: 'test.bitrix24.ru', userId: 15 } as OfferPdfGenerateDto;
const year = String(new Date().getFullYear());

describe('генерация PDF-КП', () => {
    it('предпросмотр — только рендер, без записи на диск', async () => {
        const { service, storage, fileLink, modelService } = createService();
        const result = await service.preview(dto);
        expect(modelService.build).toHaveBeenCalledWith(dto);
        expect(result.buffer).toBe(buffer);
        expect(storage.saveFile).not.toHaveBeenCalled();
        expect(fileLink.createPublicLink).not.toHaveBeenCalled();
    });

    it('генерация кладёт файл в konstructor/offer/<год>/<домен>/<пользователь> и отдаёт ссылку', async () => {
        const { service, storage, fileLink } = createService();
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
        expect(result).toEqual({
            link: 'https://app.test/api/files/token',
            fileName,
            templateCode: OfferPdfTemplateCode.CLASSIC,
            durationMs: 42,
            size: buffer.length,
        });
    });
});
