jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import { renderInvoicePdf } from '../invoice/invoice-pdf.template';
import { QR_CAPTION } from '../invoice/lib/invoice-pdf-lines.util';
import type { InvoicePdfModel } from '../invoice/model/invoice-pdf.model';
import type { OfferPdfImage } from '../model/offer-pdf-document.model';
import {
    createInvoiceDataFixture,
    createInvoicePdfModelFixture,
} from './fixtures/invoice-pdf-model.fixture';
import { createOfferRenderDataFixture } from './fixtures/offer-pdf-model.fixture';
import { collectTexts } from './helpers/react-pdf.mock';
import { expandHost, flattenHost } from './helpers/host-tree';

const textOf = (model: InvoicePdfModel): string =>
    collectTexts(renderInvoicePdf(model)).join('\n');

const imagesOf = (model: InvoicePdfModel) =>
    flattenHost(expandHost(renderInvoicePdf(model))).filter(
        node => node.type === 'IMAGE',
    );

const png = (name: string): OfferPdfImage => ({
    data: Buffer.from(`png:${name}`),
    format: 'png',
});

describe('PDF-шаблон счёта', () => {
    it('банковская шапка: банк, БИК, счета, ИНН, КПП и получатель', () => {
        const text = textOf(createInvoicePdfModelFixture());
        expect(text).toContain('ПАО Сбербанк');
        expect(text).toContain('Банк получателя');
        expect(text).toContain('БИК');
        expect(text).toContain('042007681');
        expect(text).toContain('30101810600000000681');
        expect(text).toContain('40702810013000012345');
        expect(text).toContain('ИНН 3666012345');
        expect(text).toContain('КПП 366601001');
        expect(text).toContain('Получатель');
        expect(text).toContain(
            'Общество с ограниченной ответственностью «Гарант-Сервис Воронеж»',
        );
    });

    it('заголовок, срок оплаты, поставщик и покупатель', () => {
        const text = textOf(createInvoicePdfModelFixture());
        expect(text).toContain('Счёт на оплату № 15 от 27 ноября 2026 г.');
        expect(text).toContain('Срок оплаты: ');
        expect(text).toContain('5 декабря 2026 г.');
        expect(text).toContain('Поставщик: ');
        expect(text).toContain('ИНН: 3666012345');
        expect(text).toContain('Покупатель: ');
        expect(text).toContain('ООО «Ромашка», ИНН: 3664098765');
    });

    it('срока оплаты нет, покупателя нет — строки не печатаются', () => {
        const text = textOf(
            createInvoicePdfModelFixture({
                data: createInvoiceDataFixture({
                    InvoicePaymentDate: '',
                    RecipientCompanyName: '',
                    RecipientName: '',
                }),
            }),
        );
        expect(text).not.toContain('Срок оплаты');
        expect(text).not.toContain('Покупатель');
    });

    it('таблица: название с формулировкой договора, количество, цены, сумма', () => {
        const text = textOf(createInvoicePdfModelFixture());
        for (const title of [
            '№',
            'Наименование',
            'Кол-во',
            'Ед.',
            'Цена',
            'Сумма',
        ]) {
            expect(text).toContain(title);
        }
        expect(text).toContain(
            'Услуги по информационному обслуживанию ГАРАНТ-Профессионал. Бухгалтерия',
        );
        expect(text).toContain('127 500,00');
    });

    it('скидка видна всегда, когда она есть у строк: колонка и цена по прайсу', () => {
        const text = textOf(createInvoicePdfModelFixture());
        expect(text).toContain('Скидка');
        expect(text).toContain('15 %');
        // цена до скидки — по прайсу
        expect(text).toContain('12 500,00');
    });

    it('скидки у строк нет — колонки «Скидка» нет', () => {
        const rows = createOfferRenderDataFixture().ProductRows.map(row => ({
            ...row,
            ProductDiscountPercent: '0',
        }));
        const text = textOf(
            createInvoicePdfModelFixture({
                data: createInvoiceDataFixture({ ProductRows: rows }),
            }),
        );
        expect(text).not.toContain('Скидка');
    });

    it('итоги: сумма, налог, число наименований, сумма прописью; итоговая скидка не печатается', () => {
        const text = textOf(createInvoicePdfModelFixture());
        expect(text).toContain('Итого: 145 500,00 руб.');
        expect(text).toContain('Без налога (НДС)');
        expect(text).toContain(
            'Всего наименований 2, на сумму 145 500,00 руб.',
        );
        expect(text).toContain('сто сорок пять тысяч пятьсот рублей 00 копеек');
        // TotalDiscountSum образца
        expect(text).not.toContain('22 500,00');
    });

    describe('QR для оплаты', () => {
        it('QR загружен — картинка и подсказка стоят в шапке', () => {
            const model = createInvoicePdfModelFixture({
                images: { qr: png('qr') },
            });
            expect(imagesOf(model)).toHaveLength(1);
            expect(textOf(model)).toContain(QR_CAPTION);
        });

        it('QR нет — ни картинки, ни подсказки', () => {
            const model = createInvoicePdfModelFixture();
            expect(imagesOf(model)).toHaveLength(0);
            expect(textOf(model)).not.toContain(QR_CAPTION);
        });
    });

    describe('печати и подписи', () => {
        it('есть подписант и картинки — должность, печать, подпись, расшифровка', () => {
            const model = createInvoicePdfModelFixture({
                images: {
                    stamp: png('stamp'),
                    signatureDirector: png('signature'),
                },
            });
            const text = textOf(model);
            expect(text).toContain(
                'Генеральный директор ООО «Гарант-Сервис Воронеж»',
            );
            expect(text).toContain('Кузнецов А. В.');
            expect(imagesOf(model)).toHaveLength(2);
        });

        it('картинок нет — блок печатает линию подписи', () => {
            const text = textOf(createInvoicePdfModelFixture());
            expect(text).toContain('Кузнецов А. В.');
            expect(text).toContain('________________');
        });

        it('подписанта нет (withStamps выключен) — блока нет вовсе', () => {
            const text = textOf(createInvoicePdfModelFixture({ signer: null }));
            expect(text).not.toContain('Кузнецов А. В.');
            expect(text).not.toContain('Генеральный директор');
            expect(text).not.toContain('Главный бухгалтер');
        });

        it('главный бухгалтер печатается с именем и подписью, как в легаси', () => {
            const model = createInvoicePdfModelFixture({
                images: { signatureAccountant: png('accountant') },
            });
            const text = textOf(model);
            expect(text).toContain('Главный бухгалтер');
            expect(text).toContain('Петрова М. И.');
            expect(imagesOf(model)).toHaveLength(1);
        });

        it('подписи бухгалтера нет — строки бухгалтера нет', () => {
            const text = textOf(createInvoicePdfModelFixture());
            expect(text).not.toContain('Главный бухгалтер');
        });
    });

    it('неизвестный код стиля — счёт рисуется стилем по умолчанию', () => {
        const text = textOf(
            createInvoicePdfModelFixture({ styleCode: 'нет-такого' }),
        );
        expect(text).toContain('Счёт на оплату № 15');
    });
});
