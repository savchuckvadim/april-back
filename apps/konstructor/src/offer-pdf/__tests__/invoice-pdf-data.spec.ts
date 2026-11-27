import type { RqEntity } from '@lib/portal-lib/konstructor/provider';
import { splitInvoiceRenderData } from '@app/konstructor/offer-word/lib/invoice-single-items.util';
import type { IInvoiceRenderData } from '@app/konstructor/offer-word/services/render-data-services/invoice-render-data.service';
import {
    buyerLine,
    invoiceTitle,
    invoiceTotalLines,
    paymentDueLine,
    supplierLine,
} from '../invoice/lib/invoice-pdf-lines.util';
import {
    buildInvoicePdfModel,
    invoiceImageRoles,
    invoiceImagesOf,
    type InvoiceImageContent,
} from '../invoice/lib/invoice-pdf-model.util';
import {
    buildInvoiceSigner,
    shortCompanyTitle,
    shortPersonName,
} from '../invoice/lib/invoice-pdf-signer.util';
import {
    findInvoicePdfStyle,
    INVOICE_PDF_CLASSIC_STYLE,
    INVOICE_PDF_DEFAULT_STYLE_CODE,
} from '../invoice/style/invoice-pdf-style.registry';
import { createInvoiceDataFixture } from './fixtures/invoice-pdf-model.fixture';

const rq = (over: Partial<RqEntity> = {}): RqEntity =>
    ({
        id: 7,
        type: 'org',
        name: 'Ромашка',
        fullname: 'Общество с ограниченной ответственностью «Ромашка»',
        shortname: 'ООО «Ромашка»',
        position: 'Генеральный директор',
        director: 'Иванов Пётр Сергеевич',
        accountant: 'Сидорова Мария Ивановна',
        ...over,
    }) as RqEntity;

const image = (role: InvoiceImageContent['role']): InvoiceImageContent => ({
    role,
    format: 'png',
    data: Buffer.from(`png:${role}`),
});

describe('счёт PDF: подписант', () => {
    it('фамилия с инициалами по трём словам; иначе имя как есть', () => {
        expect(shortPersonName('Иванов Пётр Сергеевич')).toBe('Иванов П. С.');
        expect(shortPersonName('  Иванов   Пётр  Сергеевич ')).toBe(
            'Иванов П. С.',
        );
        expect(shortPersonName('Иванов Пётр')).toBe('Иванов Пётр');
        expect(shortPersonName(null)).toBe('');
        expect(shortPersonName('null')).toBe('');
    });

    it('ООО вместо «Общество с ограниченной ответственностью»', () => {
        expect(
            shortCompanyTitle(
                'Общество с ограниченной  ответственностью «Ромашка»',
            ),
        ).toBe('ООО «Ромашка»');
        expect(shortCompanyTitle('АО «Лилия»')).toBe('АО «Лилия»');
    });

    it('организация: должность с названием слева, фамилия с инициалами справа, бухгалтер', () => {
        expect(buildInvoiceSigner(rq())).toEqual({
            position: 'Генеральный директор ООО «Ромашка»',
            director: 'Иванов П. С.',
            accountant: 'Сидорова М. И.',
        });
    });

    it('ИП: слева полное название предпринимателя, справа пусто, как в легаси', () => {
        const signer = buildInvoiceSigner(
            rq({
                type: 'ip',
                fullname: 'Индивидуальный предприниматель Орлов Олег Олегович',
                position: 'Руководитель',
                director: 'Орлов Олег Олегович',
                accountant: '',
            }),
        );
        expect(signer).toEqual({
            position: 'Индивидуальный предприниматель Орлов Олег Олегович',
            director: '',
            accountant: '',
        });
    });

    it('нет реквизитов или печатать нечего — null', () => {
        expect(buildInvoiceSigner(null)).toBeNull();
        expect(
            buildInvoiceSigner(
                rq({
                    fullname: '',
                    shortname: '',
                    name: '',
                    position: '',
                    director: '',
                }),
            ),
        ).toBeNull();
    });

    it('в полях реквизитов строка «null» не печатается', () => {
        expect(
            buildInvoiceSigner(
                rq({ position: 'null', director: 'null', accountant: 'null' }),
            ),
        ).toEqual({ position: 'ООО «Ромашка»', director: '', accountant: '' });
    });
});

describe('счёт PDF: картинки и модель', () => {
    it('роли: QR всегда, печать и подписи только при withStamps', () => {
        expect(invoiceImageRoles(true)).toEqual([
            'stamp',
            'signature_director',
            'signature_accountant',
            'qr',
        ]);
        expect(invoiceImageRoles(false)).toEqual(['qr']);
    });

    it('картинки по местам модели; роль, которую счёт не печатает (логотип), отбрасывается', () => {
        const contents = [
            image('stamp'),
            image('signature_director'),
            image('signature_accountant'),
            image('qr'),
            image('logo'),
        ];
        const images = invoiceImagesOf(contents, true);
        expect(Object.keys(images).sort()).toEqual([
            'qr',
            'signatureAccountant',
            'signatureDirector',
            'stamp',
        ]);
        expect(images.qr).toEqual({
            data: Buffer.from('png:qr'),
            format: 'png',
        });
    });

    it('withStamps=false: из прочитанного в модель попадает только QR', () => {
        const images = invoiceImagesOf(
            [image('stamp'), image('signature_director'), image('qr')],
            false,
        );
        expect(Object.keys(images)).toEqual(['qr']);
    });

    it('QR нет у реквизитов — ключа qr в модели нет', () => {
        const images = invoiceImagesOf([image('stamp')], true);
        expect(images).not.toHaveProperty('qr');
    });

    it('модель счёта: withStamps включён — подписант и картинки, выключен — ни блока, ни печати', () => {
        const data = createInvoiceDataFixture();
        const contents = [image('stamp'), image('qr')];

        const on = buildInvoicePdfModel({
            data,
            rq: rq(),
            contents,
            withStamps: true,
        });
        expect(on.signer?.director).toBe('Иванов П. С.');
        expect(Object.keys(on.images).sort()).toEqual(['qr', 'stamp']);
        expect(on.styleCode).toBe(INVOICE_PDF_DEFAULT_STYLE_CODE);

        const off = buildInvoicePdfModel({
            data,
            rq: rq(),
            contents,
            withStamps: false,
            styleCode: 'classic',
        });
        expect(off.signer).toBeNull();
        expect(Object.keys(off.images)).toEqual(['qr']);
    });

    it('стиль: неизвестный или пустой код — стиль по умолчанию', () => {
        expect(findInvoicePdfStyle('classic')).toBe(INVOICE_PDF_CLASSIC_STYLE);
        expect(findInvoicePdfStyle('нет-такого')).toBe(
            INVOICE_PDF_CLASSIC_STYLE,
        );
        expect(findInvoicePdfStyle(null)).toBe(INVOICE_PDF_CLASSIC_STYLE);
        expect(findInvoicePdfStyle(undefined)).toBe(INVOICE_PDF_CLASSIC_STYLE);
    });
});

describe('счёт PDF: строки текста', () => {
    it('заголовок: номер и дата; без номера — без «№»', () => {
        expect(
            invoiceTitle({
                InvoiceNumber: '15',
                InvoiceDate: '27 ноября 2026 г.',
            }),
        ).toBe('Счёт на оплату № 15 от 27 ноября 2026 г.');
        expect(
            invoiceTitle({
                InvoiceNumber: ' ',
                InvoiceDate: '27 ноября 2026 г.',
            }),
        ).toBe('Счёт на оплату от 27 ноября 2026 г.');
    });

    it('срок оплаты есть только когда задан', () => {
        expect(
            paymentDueLine({ InvoicePaymentDate: '5 декабря 2026 г.' }),
        ).toBe('5 декабря 2026 г.');
        expect(paymentDueLine({ InvoicePaymentDate: '' })).toBeNull();
    });

    it('поставщик: название, ИНН, КПП, адрес, телефон; пустое пропускается', () => {
        const data = createInvoiceDataFixture();
        expect(supplierLine(data)).toBe(
            'Общество с ограниченной ответственностью «Гарант-Сервис Воронеж», ИНН: 3666012345, КПП: 366601001, 394018, г. Воронеж, ул. Плехановская, д. 22, +7 (473) 200-00-00',
        );
        expect(
            supplierLine({
                ...data,
                MyCompanyKPP: '',
                MyCompanyPhone: '',
                MyCompanyAddress: '',
            }),
        ).toBe(
            'Общество с ограниченной ответственностью «Гарант-Сервис Воронеж», ИНН: 3666012345',
        );
    });

    it('покупатель: организация с ИНН, физлицо по имени, без обоих — строки нет', () => {
        expect(
            buyerLine({
                RecipientCompanyName: 'ООО «Ромашка»',
                RecipientName: 'Иван Петрович',
                RecipientInn: '3664098765',
            }),
        ).toBe('ООО «Ромашка», ИНН: 3664098765');
        expect(
            buyerLine({
                RecipientCompanyName: '',
                RecipientName: 'Иван Петрович',
                RecipientInn: '',
            }),
        ).toBe('Иван Петрович');
        expect(
            buyerLine({
                RecipientCompanyName: '',
                RecipientName: '',
                RecipientInn: '3664098765',
            }),
        ).toBeNull();
    });

    it('итоги без налога: сумма, «Без налога», число наименований, сумма прописью без скобок', () => {
        const total = createInvoiceDataFixture().TotalRow[0];
        expect(
            invoiceTotalLines(
                {
                    ...total,
                    TotalSum: '145500.00',
                    TotalSumString:
                        '(Сто сорок пять тысяч пятьсот рублей 00 копеек)',
                },
                2,
            ),
        ).toEqual({
            total: 'Итого: 145500.00 руб.',
            tax: 'Без налога (НДС)',
            count: 'Всего наименований 2, на сумму 145500.00 руб.',
            words: 'Сто сорок пять тысяч пятьсот рублей 00 копеек',
        });
    });

    it('итоги с налогом: строка налога с суммой', () => {
        const total = createInvoiceDataFixture().TotalRow[0];
        const lines = invoiceTotalLines(
            {
                ...total,
                TaxSum: '6928.57',
                TotalTaxInvoiceInfo: 'Налог (НДС 5%)',
            },
            1,
        );
        expect(lines?.tax).toBe('Налог (НДС 5%): 6928.57 руб.');
    });

    it('строки «Итого» нет — итогов нет', () => {
        expect(invoiceTotalLines(undefined, 3)).toBeNull();
    });
});

describe('счёт PDF: данные счёта по наборам (общий шаг с Word)', () => {
    const renderData = {
        InvoiceNumber: '15',
        prices: [
            {
                rows: { ProductRows: [] },
                total: {},
                setKind: 'general',
                setIndex: 0,
            },
            {
                rows: { ProductRows: [] },
                total: {},
                setKind: 'alternative',
                setIndex: 0,
            },
            {
                rows: { ProductRows: [] },
                total: {},
                setKind: 'alternative',
                setIndex: 1,
            },
        ],
    } as unknown as IInvoiceRenderData;

    it('номера N, N-1, N-2 и набор каждого счёта', () => {
        const items = splitInvoiceRenderData(renderData);
        expect(items.map(item => item.data.InvoiceNumber)).toEqual([
            '15',
            '15-1',
            '15-2',
        ]);
        expect(items.map(item => [item.setKind, item.setIndex])).toEqual([
            ['general', 0],
            ['alternative', 0],
            ['alternative', 1],
        ]);
    });

    it('сквозной сдвиг номера продолжает нумерацию прежних вызовов', () => {
        expect(
            splitInvoiceRenderData(renderData, 2).map(
                item => item.data.InvoiceNumber,
            ),
        ).toEqual(['15-2', '15-3', '15-4']);
    });
});
