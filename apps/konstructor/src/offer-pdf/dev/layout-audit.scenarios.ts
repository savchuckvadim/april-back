import {
    IInfblockGroupsRenderData,
    IInfblockRenderData,
} from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import {
    createAlternativeSetFixture,
    createComplectSectionFixture,
    createOfferRenderDataFixture,
    productRowsWithSets,
} from '../__tests__/fixtures/offer-pdf-model.fixture';
import {
    DocumentFieldDescriptionMode,
    DocumentFieldViewMode,
} from '../model/offer-document-settings.type';
import { IOfferWordRenderData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-data.service';
import {
    OfferPdfDocumentModel,
    OfferPdfImages,
} from '../model/offer-pdf-document.model';
import { OfferPdfSettingsInput } from '../model/offer-pdf-settings';
import { createAuditProviderImages } from './layout-audit.images';

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

/**
 * Короткая таблица цен с заголовками наборов, как в КП 27.11.2026: одна
 * общая строка и два набора по строке. Таблица до трёх строк не рвётся.
 */
const oneGeneralTwoSetsByOne = productRowsWithSets(
    base.ProductRows.slice(0, 1),
    [
        [setRow('ГАРАНТ-Профессионал. Бухгалтерия, 3 одновременных доступа')],
        [setRow('Правовой консалтинг и Академия ГАРАНТ')],
    ],
);

/** Подпись под «Стоимостью» в две строки, как у договора сопровождения */
const LONG_PRICE_CAPTION =
    'Услуги по сопровождению экземпляров Систем ГАРАНТ: информационное обслуживание, обновление и консультации на весь срок договора';

/**
 * Короткая таблица цен после наполнения с `regions` региональными блоками:
 * от их числа зависит, где на листе начнётся раздел «Стоимость». Заголовок
 * с подписью уходят на следующий лист вместе с таблицей (orphan-price-heading).
 */
const smallPriceAfterRegions = (
    regions: number,
    rows: Partial<IOfferWordRenderData>,
): Partial<OfferPdfDocumentModel> => ({
    data: createOfferRenderDataFixture({
        infoblocksByGroups: withRegions(regions),
        GeneralProductByContractName: LONG_PRICE_CAPTION,
        ...rows,
    }),
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

/** Название варианта в три строки: как «Набор для юриста с библиотекой и модулем» с хвостом */
const LONG_VARIANT_TITLE =
    'Вариант «Юрист и бухгалтер»: ГАРАНТ-Профессионал на 3 одновременных доступа с большой библиотекой, обучением и сопровождением на весь срок договора';

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

/**
 * Общий набор из нескольких комплектов, наполнение «по комплектам». Названия
 * начинаются с «Комплект N. » — по ним аудит находит заголовки комплектов
 * (COMPLECT_TITLE_PATTERN в layout-audit).
 */
const separateComplects = (
    complects: ReadonlyArray<
        readonly [name: string, supplyName: string, IInfblockGroupsRenderData[]]
    >,
): Partial<IOfferWordRenderData> => ({
    IsComplectsSeparate: true,
    ComplectSections: complects.map(
        ([name, supplyName, sectionGroups], index) =>
            createComplectSectionFixture(
                `Комплект ${index + 1}. ${name}`,
                supplyName,
                sectionGroups,
            ),
    ),
    infoblocksByGroups: complects.flatMap(
        ([, , sectionGroups]) => sectionGroups,
    ),
});

/**
 * Наполнение наборов для сравнения: по набору «Набор N» (как заголовок набора
 * в таблице цен — по нему аудит находит плашки наборов, SET_TITLE_PATTERN в
 * layout-audit) и по комплектам в нём. Комплекты названы «Комплект N. » — по
 * ним аудит находит заголовки комплектов.
 */
type AuditComplect = readonly [
    name: string,
    supplyName: string,
    IInfblockGroupsRenderData[],
];

const alternativeSets = (
    sets: ReadonlyArray<ReadonlyArray<AuditComplect>>,
): Partial<IOfferWordRenderData> => ({
    IsAlternativeComplects: true,
    AlternativeComplectSections: sets.map((complects, setIndex) =>
        createAlternativeSetFixture(
            setIndex + 1,
            complects.map(([name, supplyName, sectionGroups], index) =>
                createComplectSectionFixture(
                    `Комплект ${index + 1}. ${name}`,
                    supplyName,
                    sectionGroups,
                ),
            ),
        ),
    ),
});

/** Общий набор из двух строк и три набора для сравнения по две строки: заголовки «Набор 1» – «Набор 3» в таблице цен */
const threeSetsByTwoRows = productRowsWithSets(
    base.ProductRows,
    Array.from({ length: 3 }, (_, setIndex) => [
        setRow(`ГАРАНТ-Профессионал. Набор ${setIndex + 1}, основной комплект`),
        setRow(`Правовой консалтинг, набор ${setIndex + 1}`),
    ]),
);

/**
 * Три набора для сравнения по два комплекта с большими описаниями: у каждого
 * комплекта по двенадцать длинных региональных блоков в первой группе.
 */
const threeSetsByTwoBigComplects = alternativeSets(
    [1, 2, 3].map((set): AuditComplect[] => [
        [
            `ГАРАНТ-Профессионал. Бухгалтерия, набор ${set}`,
            `Интернет ${set} ОД`,
            withRegions(12),
        ],
        [
            `ГАРАНТ-Профессионал. Юрист, набор ${set}`,
            `Интернет ${set + 2} ОД`,
            base.infoblocksByGroups.slice(1),
        ],
    ]),
);

export interface AuditScenario {
    name: string;
    settings: OfferPdfSettingsInput;
    model?: Partial<OfferPdfDocumentModel>;
    /**
     * Картинки поставщика (печать, подпись, логотип). Рисуются в коде через
     * sharp, поэтому задаются функцией: sharp работает асинхронно.
     */
    images?: () => Promise<OfferPdfImages>;
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
    // вариант комплекта печатается своим документом: название на титульнике
    // и в шапке первого листа
    {
        name: '20-variant-title',
        settings: {},
        model: { variantTitle: 'Юрист: ГАРАНТ-Профессионал на 3 доступа' },
    },
    // длинное название без титульника, «сначала цена»: название открывает лист
    // письма, под ним письмо и таблица цен
    {
        name: '21-variant-title-long-no-cover-price-first',
        settings: { withCover: false, isPriceFirst: true },
        model: {
            variantTitle: LONG_VARIANT_TITLE,
            data: createOfferRenderDataFixture({
                ProductRows: manyRows.slice(0, 4),
            }),
        },
    },
    // длинное название на титульнике: не должно наезжать на «для кого» и «кто подготовил»
    {
        name: '22-variant-title-long-cover',
        settings: {},
        model: { variantTitle: LONG_VARIANT_TITLE },
    },
    // наполнение по комплектам: два комплекта, список с короткими описаниями
    {
        name: '23-complects-separate-two',
        settings: {},
        model: {
            data: createOfferRenderDataFixture(
                separateComplects([
                    [
                        'ГАРАНТ-Профессионал. Бухгалтерия',
                        'Интернет 3 ОД',
                        base.infoblocksByGroups.slice(0, 2),
                    ],
                    [
                        'ГАРАНТ-Профессионал. Юрист',
                        'Интернет 1 ОД',
                        base.infoblocksByGroups.slice(2),
                    ],
                ]),
            ),
        },
    },
    // два комплекта, описания «много»: длинные тексты, наполнение первого уходит на следующий лист
    {
        name: '24-complects-separate-two-list-big',
        settings: { descriptionMode: DocumentFieldDescriptionMode.BIG },
        model: {
            data: createOfferRenderDataFixture(
                separateComplects([
                    [
                        'ГАРАНТ-Профессионал. Бухгалтерия',
                        'Интернет 3 ОД',
                        withRegions(12),
                    ],
                    [
                        'ГАРАНТ-Профессионал. Юрист',
                        'Интернет 1 ОД',
                        base.infoblocksByGroups.slice(1),
                    ],
                ]),
            ),
        },
    },
    // три комплекта, длинное наполнение, таблица с разделами и описаниями «средне»:
    // заголовки комплектов приходятся на разные места листа
    {
        name: '25-complects-separate-three-table-groups-long',
        settings: {
            viewMode: DocumentFieldViewMode.TABLE_WITH_GROUP,
            descriptionMode: DocumentFieldDescriptionMode.MEDIUM,
        },
        model: {
            data: createOfferRenderDataFixture(
                separateComplects([
                    [
                        'ГАРАНТ-Профессионал. Бухгалтерия',
                        'Интернет 3 ОД',
                        withRegions(35),
                    ],
                    [
                        'ГАРАНТ-Профессионал. Юрист',
                        'Интернет 1 ОД',
                        base.infoblocksByGroups.slice(1),
                    ],
                    [
                        'ГАРАНТ-Профессионал. Кадры',
                        'Интернет 5 ОД',
                        withRegions(12),
                    ],
                ]),
            ),
        },
    },
    // три комплекта, список без описаний: у «Модерна» и «Искры» названия в две колонки
    {
        name: '26-complects-separate-three-list-names',
        settings: { descriptionMode: DocumentFieldDescriptionMode.NO },
        model: {
            data: createOfferRenderDataFixture(
                separateComplects([
                    [
                        'ГАРАНТ-Профессионал. Бухгалтерия',
                        'Интернет 3 ОД',
                        withRegions(35),
                    ],
                    [
                        'ГАРАНТ-Профессионал. Юрист',
                        'Интернет 1 ОД',
                        withRegions(12),
                    ],
                    [
                        'ГАРАНТ-Профессионал. Кадры',
                        'Интернет 5 ОД',
                        base.infoblocksByGroups,
                    ],
                ]),
            ),
        },
    },
    // два комплекта, таблица без разделов: первая строка каждого — огромное описание
    {
        name: '27-complects-separate-two-huge-table',
        settings: {
            viewMode: DocumentFieldViewMode.TABLE,
            descriptionMode: DocumentFieldDescriptionMode.BIG,
        },
        model: {
            data: createOfferRenderDataFixture(
                separateComplects([
                    [
                        'ГАРАНТ-Профессионал. Бухгалтерия',
                        'Интернет 3 ОД',
                        hugeBlocks(),
                    ],
                    [
                        'ГАРАНТ-Профессионал. Юрист',
                        'Интернет 1 ОД',
                        hugeBlocks(),
                    ],
                ]),
            ),
        },
    },
    // три комплекта, список, огромные описания первыми в каждом комплекте; у третьего нет подписи поставки
    {
        name: '28-complects-separate-three-huge-list',
        settings: { descriptionMode: DocumentFieldDescriptionMode.BIG },
        model: {
            data: createOfferRenderDataFixture(
                separateComplects([
                    [
                        'ГАРАНТ-Профессионал. Бухгалтерия',
                        'Интернет 3 ОД',
                        hugeBlocks(),
                    ],
                    [
                        'ГАРАНТ-Профессионал. Юрист',
                        'Интернет 1 ОД',
                        hugeBlocks(),
                    ],
                    ['ГАРАНТ-Профессионал. Кадры', '', hugeBlocks()],
                ]),
            ),
        },
    },
    // наполнение наборов для сравнения: два набора по одному комплекту, список
    // с короткими описаниями; в таблице цен те же два набора
    {
        name: '30-alternative-two-sets-one-complect',
        settings: {},
        model: {
            data: createOfferRenderDataFixture({
                ProductRows: twoSetsByTwoRows,
                TotalRow: undefined,
                ...alternativeSets([
                    [
                        [
                            'ГАРАНТ-Профессионал. Юрист',
                            'Интернет 5 ОД',
                            base.infoblocksByGroups.slice(2),
                        ],
                    ],
                    [
                        [
                            'ГАРАНТ-Профессионал. Бухгалтерия',
                            'Интернет 1 ОД',
                            base.infoblocksByGroups.slice(0, 2),
                        ],
                    ],
                ]),
            }),
        },
    },
    // три набора по два комплекта, описания «много»: длинные тексты, заголовки
    // наборов и комплектов приходятся на разные места листа
    {
        name: '31-alternative-three-sets-two-complects-big',
        settings: { descriptionMode: DocumentFieldDescriptionMode.BIG },
        model: {
            data: createOfferRenderDataFixture({
                ProductRows: threeSetsByTwoRows,
                TotalRow: undefined,
                ...threeSetsByTwoBigComplects,
            }),
        },
    },
    // те же три набора при «сначала цена»: таблица цен идёт перед наполнением
    {
        name: '32-alternative-three-sets-two-complects-big-price-first',
        settings: {
            descriptionMode: DocumentFieldDescriptionMode.BIG,
            isPriceFirst: true,
        },
        model: {
            data: createOfferRenderDataFixture({
                ProductRows: threeSetsByTwoRows,
                TotalRow: undefined,
                ...threeSetsByTwoBigComplects,
            }),
        },
    },
    // общий набор по комплектам, затем два набора для сравнения; таблица с
    // разделами и описаниями «средне»
    {
        name: '33-alternative-after-separate-complects-table-groups',
        settings: {
            viewMode: DocumentFieldViewMode.TABLE_WITH_GROUP,
            descriptionMode: DocumentFieldDescriptionMode.MEDIUM,
        },
        model: {
            data: createOfferRenderDataFixture({
                ...separateComplects([
                    [
                        'ГАРАНТ-Профессионал. Бухгалтерия',
                        'Интернет 3 ОД',
                        withRegions(12),
                    ],
                    [
                        'ГАРАНТ-Профессионал. Юрист',
                        'Интернет 1 ОД',
                        base.infoblocksByGroups.slice(1),
                    ],
                ]),
                ProductRows: twoSetsByTwoRows,
                TotalRow: undefined,
                ...alternativeSets([
                    [
                        [
                            'ГАРАНТ-Профессионал. Юрист',
                            'Интернет 5 ОД',
                            withRegions(12),
                        ],
                        [
                            'ГАРАНТ-Профессионал. Кадры',
                            'Интернет 1 ОД',
                            base.infoblocksByGroups,
                        ],
                    ],
                    [
                        [
                            'ГАРАНТ-Профессионал. Бухгалтерия',
                            'Интернет 1 ОД',
                            withRegions(35),
                        ],
                    ],
                ]),
            }),
        },
    },
    // три набора по одному комплекту, список без описаний: у «Модерна» и
    // «Искры» названия в две колонки
    {
        name: '34-alternative-three-sets-list-names',
        settings: { descriptionMode: DocumentFieldDescriptionMode.NO },
        model: {
            data: createOfferRenderDataFixture({
                ProductRows: threeSetsByTwoRows,
                TotalRow: undefined,
                ...alternativeSets([
                    [
                        [
                            'ГАРАНТ-Профессионал. Бухгалтерия',
                            'Интернет 3 ОД',
                            withRegions(35),
                        ],
                    ],
                    [
                        [
                            'ГАРАНТ-Профессионал. Юрист',
                            'Интернет 1 ОД',
                            base.infoblocksByGroups,
                        ],
                    ],
                    [['ГАРАНТ-Профессионал. Кадры', '', withRegions(12)]],
                ]),
            }),
        },
    },
    // короткая таблица цен с наборами после наполнения разной длины: «Стоимость»
    // с подписью не остаются внизу листа без таблицы (КП 27.11.2026)
    ...[2, 5, 8, 11].map(
        (regions): AuditScenario => ({
            name: `38-small-price-sets-after-regions-${regions}`,
            settings: {},
            model: smallPriceAfterRegions(regions, {
                ProductRows: oneGeneralTwoSetsByOne,
                TotalRow: undefined,
            }),
        }),
    ),
    // то же с итогом и фразой об акции: неделимый блок выше
    ...[3, 7, 10].map(
        (regions): AuditScenario => ({
            name: `39-small-price-totals-after-regions-${regions}`,
            settings: {
                salePhrase: 'Специальное предложение действует до конца месяца',
            },
            model: smallPriceAfterRegions(regions, {
                ProductRows: [
                    ...base.ProductRows,
                    setRow('Правовой консалтинг и Академия ГАРАНТ'),
                ],
            }),
        }),
    ),
    // печать, подпись руководителя и логотип поставщика (картинки из
    // provider_images): блок подписи под длинным письмом становится выше
    // (96 pt вместо 36), логотип стоит в шапке «Классики» и «Призмы»
    {
        name: '37-provider-images-stamps',
        settings: {},
        images: createAuditProviderImages,
        model: {
            letter: { appeal: 'Уважаемый Иван Петрович!', text: letterText(6) },
        },
    },
    // КП без сопроводительного письма (withLetter: false): письма и подписи
    // нет, хотя печать и подпись поставщика включены и картинки есть. «Сначала
    // цена» с большим наполнением: цена идёт своим листом, наполнение со
    // следующего; у «Модерна» страница письма не печатается вовсе
    {
        name: '40-no-letter-price-first-many-rows',
        settings: { withLetter: false, isPriceFirst: true },
        images: createAuditProviderImages,
        model: {
            data: createOfferRenderDataFixture({
                ProductRows: manyRows,
                infoblocksByGroups: withRegions(12),
            }),
        },
    },
    // то же при обычном порядке: 14 цен после наполнения открывают свой лист
    {
        name: '41-no-letter-many-prices-after-infoblocks',
        settings: { withLetter: false },
        model: {
            data: createOfferRenderDataFixture({
                ProductRows: fourteenRows,
                infoblocksByGroups: withRegions(12),
            }),
        },
    },
    // латиница в заголовке и у получателя после документов без неё: при
    // испорченном кэше глифов буквы выпадали (glyph-loss). Сценарий идёт
    // последним — кэш к нему уже наполнен предыдущими документами процесса.
    {
        name: '29-latin-title-after-cyrillic',
        settings: {},
        model: {
            data: createOfferRenderDataFixture({
                GeneralProductName: 'Гарант-Предприятие PRO',
                RecipientCompanyName: 'test',
            }),
        },
    },
];
