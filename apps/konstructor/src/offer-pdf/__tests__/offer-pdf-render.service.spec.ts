const registerMock = jest.fn();
const hyphenationMock = jest.fn();
const renderToBufferMock = jest.fn();

jest.mock('@react-pdf/renderer', () => ({
    ...jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
    Font: {
        register: registerMock,
        registerHyphenationCallback: hyphenationMock,
    },
    renderToBuffer: renderToBufferMock,
}));

import { NotFoundException } from '@nestjs/common';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { OfferPdfRenderService } from '../services/offer-pdf-render.service';
import { createOfferPdfModelFixture } from './fixtures/offer-pdf-model.fixture';

describe('рендер PDF-КП', () => {
    beforeEach(() => {
        renderToBufferMock.mockResolvedValue(Buffer.from('%PDF-1.7 mock'));
    });

    it('отдаёт PDF-буфер, время и код шаблона; шрифты регистрирует один раз на процесс', async () => {
        const service = new OfferPdfRenderService();
        const first = await service.render(createOfferPdfModelFixture());
        const second = await service.render(createOfferPdfModelFixture());

        expect(first.buffer.subarray(0, 4).toString()).toBe('%PDF');
        expect(first.durationMs).toBeGreaterThanOrEqual(0);
        expect(first.templateCode).toBe(OfferPdfTemplateCode.CLASSIC);
        expect(second.buffer.length).toBeGreaterThan(0);
        expect(renderToBufferMock).toHaveBeenCalledTimes(2);
        expect(registerMock).toHaveBeenCalledTimes(1);
        expect(hyphenationMock).toHaveBeenCalledTimes(1);

        const [registration] = registerMock.mock.calls[0] as [
            { family: string; fonts: Array<{ src: string }> },
        ];
        expect(registration.family).toBe('PT Sans');
        expect(registration.fonts).toHaveLength(4);
        expect(registration.fonts[0].src).toMatch(/PT_Sans-Web-Regular\.ttf$/);
    });

    it('неизвестный шаблон → NotFoundException, рендер не запускается', async () => {
        const service = new OfferPdfRenderService();
        await expect(
            service.render(
                createOfferPdfModelFixture({
                    templateCode: 'nope' as OfferPdfTemplateCode,
                }),
            ),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
