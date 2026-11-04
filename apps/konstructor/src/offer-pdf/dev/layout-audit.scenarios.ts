import {
    IInfblockGroupsRenderData,
    IInfblockRenderData,
} from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { createOfferRenderDataFixture } from '../__tests__/fixtures/offer-pdf-model.fixture';
import {
    DocumentFieldDescriptionMode,
    DocumentFieldViewMode,
} from '../model/offer-document-settings.type';
import { OfferPdfDocumentModel } from '../model/offer-pdf-document.model';
import { OfferPdfSettingsInput } from '../model/offer-pdf-settings';

/** Крайние данные: на них старый PHP-подсчёт строк ошибался чаще всего. */

const LONG =
    'Нормативные акты органов власти региона: законы, постановления, распоряжения, приказы ведомств и органов местного самоуправления, в том числе документы, утратившие силу, с историей редакций и справочной информацией о порядке применения. ';

const regionBlock = (index: number): IInfblockRenderData => ({
    name: `Законодательство региона № ${index}`,
    infoblock: `Законодательство региона № ${index}`,
    smallDescription: 'Нормативные акты органов власти региона.',
    mediumDescription: LONG,
    bigDescription: LONG.repeat(4),
});

const base = createOfferRenderDataFixture();

const withRegions = (count: number): IInfblockGroupsRenderData[] => [
    {
        groupsName: 'Нормативно-правовые акты',
        infoblocks: [
            ...base.infoblocksByGroups[0].infoblocks,
            ...Array.from({ length: count }, (_, index) => regionBlock(index + 1)),
        ],
    },
    ...base.infoblocksByGroups.slice(1),
];

const manyRows = Array.from({ length: 9 }, (_, index) => ({
    ...base.ProductRows[0],
    ProductNumber: String(index + 1),
    ProductName: `ГАРАНТ-Профессионал. Комплект ${index + 1} с длинным названием для переноса строки`,
}));

const longCompany = {
    MyCompanyName: 'ООО «Гарант-Сервис Воронеж, Липецк, Тамбов и Белгород»',
    MyCompanyFullName:
        'Общество с ограниченной ответственностью «Гарант-Сервис Воронеж, Липецк, Тамбов и Белгород»',
    MyCompanyPrimaryAddress:
        '394018, Воронежская область, город Воронеж, улица Фридриха Энгельса, дом 25б, этаж 3, офис 301, помещение 7, литера А',
    MyCompanyPhone: '+7 (473) 200-00-00, +7 (473) 200-00-01, +7 (473) 200-00-02',
    MyCompanyEmail: 'sales@garant-vrn.ru, support@garant-vrn.ru',
    ManagerName: 'Александра Константиновна Преображенская-Воронцова',
    ManagerPosition: 'Руководитель отдела продаж и сопровождения клиентов',
    ManagerEmail: 'preobrazhenskaya-vorontsova@garant-vrn.ru',
    ManagerPhone: '+7 (920) 400-00-00, доб. 1234',
};

const letterText = (paragraphs: number): string =>
    Array.from(
        { length: paragraphs },
        (_, index) => `Абзац ${index + 1}. ${LONG}${LONG}`,
    ).join('\n');

export interface AuditScenario {
    name: string;
    settings: OfferPdfSettingsInput;
    model?: Partial<OfferPdfDocumentModel>;
}

export const AUDIT_SCENARIOS: AuditScenario[] = [
    { name: '01-default', settings: {} },
    {
        name: '02-long-header-footer',
        settings: {},
        model: { data: createOfferRenderDataFixture(longCompany) },
    },
    {
        name: '03-regions-35-list-small',
        settings: {},
        model: {
            data: createOfferRenderDataFixture({
                infoblocksByGroups: withRegions(35),
            }),
        },
    },
    {
        name: '04-regions-35-list-big',
        settings: { descriptionMode: DocumentFieldDescriptionMode.BIG },
        model: {
            data: createOfferRenderDataFixture({
                infoblocksByGroups: withRegions(35),
            }),
        },
    },
    {
        name: '05-regions-35-table-no',
        settings: {
            viewMode: DocumentFieldViewMode.TABLE,
            descriptionMode: DocumentFieldDescriptionMode.NO,
        },
        model: {
            data: createOfferRenderDataFixture({
                infoblocksByGroups: withRegions(35),
            }),
        },
    },
    {
        name: '06-regions-35-table-groups-big',
        settings: {
            viewMode: DocumentFieldViewMode.TABLE_WITH_GROUP,
            descriptionMode: DocumentFieldDescriptionMode.BIG,
        },
        model: {
            data: createOfferRenderDataFixture({
                infoblocksByGroups: withRegions(35),
            }),
        },
    },
    {
        name: '07-many-rows-sale-phrase',
        settings: {
            salePhrase:
                'При оплате до конца месяца — дополнительная скидка 5 %.\nПри оплате за год — подарок: Академия ГАРАНТ на 32 часа.\nПредложение действует до конца квартала, количество мест ограничено.\nПодробности у вашего менеджера.',
        },
        model: { data: createOfferRenderDataFixture({ ProductRows: manyRows }) },
    },
    {
        name: '08-price-first-many-rows',
        settings: { isPriceFirst: true },
        model: {
            data: createOfferRenderDataFixture({
                ProductRows: manyRows,
                infoblocksByGroups: withRegions(12),
            }),
        },
    },
    {
        name: '09-long-letter',
        settings: {},
        model: {
            letter: { appeal: 'Уважаемый Иван Петрович!', text: letterText(9) },
        },
    },
    {
        name: '10-long-letter-price-first-stamps',
        settings: {
            isPriceFirst: true,
            descriptionMode: DocumentFieldDescriptionMode.MEDIUM,
        },
        model: {
            letter: { appeal: null, text: letterText(7) },
            data: createOfferRenderDataFixture({
                ProductRows: manyRows.slice(0, 5),
            }),
        },
    },
];
