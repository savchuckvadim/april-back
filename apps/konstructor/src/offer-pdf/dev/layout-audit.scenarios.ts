import {
    IInfblockGroupsRenderData,
    IInfblockRenderData,
} from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import {
    createOfferRenderDataFixture,
    productRowsWithSets,
} from '../__tests__/fixtures/offer-pdf-model.fixture';
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
            ...Array.from({ length: count }, (_, index) =>
                regionBlock(index + 1),
            ),
        ],
    },
    ...base.infoblocksByGroups.slice(1),
];

const manyRows = Array.from({ length: 9 }, (_, index) => ({
    ...base.ProductRows[0],
    ProductNumber: String(index + 1),
    ProductName: `ГАРАНТ-Профессионал. Комплект ${index + 1} с длинным названием для переноса строки`,
}));

/**
 * Цен очень много: большая таблица после наполнения открывает новый лист
 * и идёт с его верха целиком (priceStartsOwnSheet).
 */
const fourteenRows = Array.from({ length: 14 }, (_, index) => ({
    ...base.ProductRows[0],
    ProductNumber: String(index + 1),
    ProductName: `ГАРАНТ-Профессионал. Комплект ${index + 1}`,
}));

/**
 * Наборы для сравнения: «Итого» при них скрыто (TotalRow нет), перед первой
 * строкой каждого набора печатается заголовок «Набор N».
 */
const setRow = (name: string) => ({
    ...base.ProductRows[0],
    ProductName: name,
});

/** Общий набор из двух строк и два набора для сравнения по две строки */
const twoSetsByTwoRows = productRowsWithSets(base.ProductRows, [
    [
        setRow('ГАРАНТ-Профессионал. Бухгалтерия, 1 одновременный доступ'),
        setRow('Правовой консалтинг'),
    ],
    [
        setRow('ГАРАНТ-Профессионал. Бухгалтерия, 3 одновременных доступа'),
        setRow('Правовой консалтинг и Академия ГАРАНТ'),
    ],
]);

/** Семь наборов для сравнения (предел) по одной строке */
const sevenSetsByOneRow = productRowsWithSets(
    base.ProductRows,
    Array.from({ length: 7 }, (_, index) => [
        setRow(`ГАРАНТ-Профессионал. Вариант комплекта ${index + 1}`),
    ]),
);

/**
 * Длинная таблица с наборами: ряды названий в две строки, разрывы листа
 * приходятся на разные места, в том числе на границы наборов.
 */
const longTableWithSets = productRowsWithSets(
    fourteenRows.slice(0, 4),
    Array.from({ length: 5 }, (_, setIndex) =>
        Array.from({ length: 3 }, (_, rowIndex) =>
            setRow(
                `ГАРАНТ-Профессионал. Комплект ${setIndex + 1}.${rowIndex + 1} с длинным названием для переноса строки`,
            ),
        ),
    ),
);

/**
 * Двенадцать строк общего набора (нечётные с названием в две строки) и четыре
 * набора по одной строке: в «Классике» разрыв листа приходится на заголовок
 * «Набор 1» — он обязан уйти на следующий лист вместе со своей строкой.
 */
const titleNearPageEnd = productRowsWithSets(
    Array.from({ length: 12 }, (_, index) =>
        setRow(
            `Общий набор, строка ${index + 1}${index % 2 ? ' с длинным названием для переноса строки в таблице' : ''}`,
        ),
    ),
    Array.from({ length: 4 }, (_, setIndex) => [
        setRow(`Набор ${setIndex + 1}, строка 1`),
    ]),
);

const longCompany = {
    MyCompanyName: 'ООО «Гарант-Сервис Воронеж, Липецк, Тамбов и Белгород»',
    MyCompanyFullName:
        'Общество с ограниченной ответственностью «Гарант-Сервис Воронеж, Липецк, Тамбов и Белгород»',
    MyCompanyPrimaryAddress:
        '394018, Воронежская область, город Воронеж, улица Фридриха Энгельса, дом 25б, этаж 3, офис 301, помещение 7, литера А',
    MyCompanyPhone:
        '+7 (473) 200-00-00, +7 (473) 200-00-01, +7 (473) 200-00-02',
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

/**
 * Описание длиннее страницы — как «Большая библиотека юриста» (список
 * журналов) и «...бухгалтера» сплошным абзацем: неразрывная строка таблицы
 * вылезала под подвал, следующая рисовалась поверх неё (КП 15.11).
 */
const journals = Array.from(
    { length: 70 },
    (_, index) =>
        `Журнал «Правовое обозрение № ${index + 1}: практика и комментарии»`,
).join('\n');

const hugeBlocks = (): IInfblockGroupsRenderData[] => [
    {
        groupsName: 'Консультационные материалы',
        infoblocks: [
            {
                name: 'Большая библиотека юриста',
                infoblock: 'Большая библиотека юриста',
                smallDescription: 'Консультации для юристов.',
                mediumDescription: 'Консультации для юристов.',
                bigDescription: `Информационный блок содержит тысячи консультаций.\n${journals}`,
            },
            {
                name: 'Большая библиотека бухгалтера и кадрового работника',
                infoblock: 'Большая библиотека бухгалтера',
                smallDescription: 'Библиотека для бухгалтера.',
                mediumDescription: 'Библиотека для бухгалтера.',
                bigDescription: LONG.repeat(28),
            },
            regionBlock(1),
        ],
    },
    ...base.infoblocksByGroups.slice(1),
];

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
        model: {
            data: createOfferRenderDataFixture({ ProductRows: manyRows }),
        },
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
    {
        name: '11-huge-descriptions-table',
        settings: {
            viewMode: DocumentFieldViewMode.TABLE,
            descriptionMode: DocumentFieldDescriptionMode.BIG,
        },
        model: {
            data: createOfferRenderDataFixture({
                infoblocksByGroups: hugeBlocks(),
            }),
        },
    },
    {
        name: '12-huge-descriptions-table-groups',
        settings: {
            viewMode: DocumentFieldViewMode.TABLE_WITH_GROUP,
            descriptionMode: DocumentFieldDescriptionMode.BIG,
        },
        model: {
            data: createOfferRenderDataFixture({
                infoblocksByGroups: hugeBlocks(),
            }),
        },
    },
    {
        name: '13-huge-descriptions-list',
        settings: { descriptionMode: DocumentFieldDescriptionMode.BIG },
        model: {
            data: createOfferRenderDataFixture({
                infoblocksByGroups: hugeBlocks(),
            }),
        },
    },
    // список без описаний: у «Модерна» и «Искры» — названия в две колонки
    {
        name: '14-regions-35-list-names',
        settings: { descriptionMode: DocumentFieldDescriptionMode.NO },
        model: {
            data: createOfferRenderDataFixture({
                infoblocksByGroups: withRegions(35),
            }),
        },
    },
    // 14 цен после наполнения (обычный порядок): «Стоимость» открывает лист
    {
        name: '15-many-prices-after-infoblocks',
        settings: {},
        model: {
            data: createOfferRenderDataFixture({ ProductRows: fourteenRows }),
        },
    },
    // общий набор из двух строк и два набора для сравнения по две строки: заголовки «Набор 1», «Набор 2», «Итого» нет
    {
        name: '16-compare-sets-two-by-two',
        settings: {},
        model: {
            data: createOfferRenderDataFixture({
                ProductRows: twoSetsByTwoRows,
                TotalRow: undefined,
            }),
        },
    },
    // семь наборов для сравнения по одной строке
    {
        name: '17-compare-sets-seven-by-one',
        settings: {},
        model: {
            data: createOfferRenderDataFixture({
                ProductRows: sevenSetsByOneRow,
                TotalRow: undefined,
            }),
        },
    },
    // длинная таблица с наборами после наполнения: разрыв листа рядом с заголовками наборов
    {
        name: '18-compare-sets-long-table',
        settings: {},
        model: {
            data: createOfferRenderDataFixture({
                ProductRows: longTableWithSets,
                TotalRow: undefined,
            }),
        },
    },
    // разрыв листа у заголовка набора: заголовок не остаётся последним на листе
    {
        name: '19-compare-sets-title-near-page-end',
        settings: {},
        model: {
            data: createOfferRenderDataFixture({
                ProductRows: titleNearPageEnd,
                TotalRow: undefined,
            }),
        },
    },
];
