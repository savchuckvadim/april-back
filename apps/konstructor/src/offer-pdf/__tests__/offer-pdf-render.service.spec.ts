import { Readable } from 'stream';

const registerMock = jest.fn();
const hyphenationMock = jest.fn();
const pdfMock = jest.fn();

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
    pdf: pdfMock,
}));

import { NotFoundException } from '@nestjs/common';
import type { LayoutNode } from '../lib/pdf-layout';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { OfferPdfRenderService } from '../services/offer-pdf-render.service';
import { createOfferPdfModelFixture } from './fixtures/offer-pdf-model.fixture';

/** Раскладка первой страницы: шапка заданной высоты от края 26 */
const layoutWithHeader = (headerHeight: number): LayoutNode => ({
    type: 'DOCUMENT',
    children: [
        {
            type: 'PAGE',
            box: { top: 0, left: 0, width: 595, height: 842 },
            style: { paddingTop: 92, paddingBottom: 86 },
            children: [
                {
                    type: 'VIEW',
                    props: { fixed: true },
                    box: { top: 26, left: 44, width: 507, height: headerHeight },
                },
                {
                    type: 'VIEW',
                    props: { fixed: true },
                    box: { top: 768, left: 44, width: 507, height: 48 },
                },
            ],
        },
    ],
});

/** Заглушка pdf(): отдаёт поток с «файлом» и раскладку через onRender документа */
const mockPdfInstance = (headerHeight: number) => {
    const document = { props: {} as Record<string, unknown> };
    pdfMock.mockImplementation(() => ({
        container: { document },
        toBuffer: async () => {
            const onRender = document.props.onRender as
                | ((params: { _INTERNAL__LAYOUT__DATA_: LayoutNode }) => void)
                | undefined;
            onRender?.({ _INTERNAL__LAYOUT__DATA_: layoutWithHeader(headerHeight) });
            return Readable.from([Buffer.from('%PDF-1.7 mock')]);
        },
    }));
};

describe('рендер PDF-КП', () => {
    beforeEach(() => {
        pdfMock.mockReset();
        mockPdfInstance(55);
    });

    it('отдаёт PDF-буфер, время и код шаблона; шрифты регистрирует один раз на процесс', async () => {
        const service = new OfferPdfRenderService();
        const first = await service.render(createOfferPdfModelFixture());
        const second = await service.render(createOfferPdfModelFixture());

        expect(first.buffer.subarray(0, 4).toString()).toBe('%PDF');
        expect(first.durationMs).toBeGreaterThanOrEqual(0);
        expect(first.templateCode).toBe(OfferPdfTemplateCode.CLASSIC);
        expect(first.frame).toBeNull();
        expect(second.buffer.length).toBeGreaterThan(0);
        // шапка помещается в поля шаблона — по одному проходу на документ
        expect(pdfMock).toHaveBeenCalledTimes(2);
        expect(registerMock).toHaveBeenCalledTimes(1);
        expect(hyphenationMock).toHaveBeenCalledTimes(1);

        const [registration] = registerMock.mock.calls[0] as [
            { family: string; fonts: Array<{ src: string }> },
        ];
        expect(registration.family).toBe('PT Sans');
        expect(registration.fonts).toHaveLength(4);
        expect(registration.fonts[0].src).toMatch(/PT_Sans-Web-Regular\.ttf$/);
    });

    it('длинная шапка: второй проход с полями под неё', async () => {
        mockPdfInstance(80);
        const service = new OfferPdfRenderService();
        const result = await service.render(createOfferPdfModelFixture());

        expect(result.frame).toEqual({ paddingTop: 114, paddingBottom: 86 });
        expect(pdfMock).toHaveBeenCalledTimes(2);
        // второй проход получает шаблон с полями
        const secondElement = pdfMock.mock.calls[1][0] as {
            props: { frame?: { paddingTop: number } };
        };
        expect(secondElement.props.frame).toEqual({ paddingTop: 114, paddingBottom: 86 });
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
        expect(pdfMock).not.toHaveBeenCalled();
    });
});
