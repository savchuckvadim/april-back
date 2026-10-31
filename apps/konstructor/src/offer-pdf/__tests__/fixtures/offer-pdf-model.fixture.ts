import { IOfferWordRenderData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-data.service';
import {
    IInfblockGroupsRenderData,
    IInfblockRenderData,
} from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { OfferPdfDocumentModel } from '../../model/offer-pdf-document.model';
import { OFFER_PDF_DEFAULT_SETTINGS } from '../../model/offer-pdf-settings';
import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';

const infoblock = (
    name: string,
    small: string,
    medium = `${small} Подробнее: материалы обновляются еженедельно.`,
    big = `${medium} В комплект входят документы федерального и регионального уровня, аналитика экспертов и связанные судебные решения, что позволяет быстро находить ответ на практический вопрос.`,
): IInfblockRenderData => ({
    name,
    infoblock: name,
    smallDescription: small,
    mediumDescription: medium,
    bigDescription: big,
});

const groups: IInfblockGroupsRenderData[] = [
    {
        groupsName: 'Нормативно-правовые акты',
        infoblocks: [
            infoblock(
                'Законодательство России',
                'Федеральные законы, указы, постановления и ведомственные акты.',
            ),
            infoblock(
                'Законодательство Воронежской области',
                'Нормативные акты органов власти региона.',
            ),
            infoblock(
                'Международные договоры',
                'Соглашения и конвенции с участием России.',
            ),
            infoblock(
                'Проекты законов',
                'Законопроекты и пояснительные записки.',
            ),
            infoblock(
                'Таможенное законодательство',
                'Акты ЕАЭС и ФТС по таможенному регулированию.',
            ),
            infoblock(
                'Технические нормы',
                'ГОСТы, СНиПы, СанПиНы и иные стандарты.',
            ),
        ],
    },
    {
        groupsName: 'Комментарии и разъяснения',
        infoblocks: [
            infoblock(
                'Энциклопедия решений. Налоги и взносы',
                'Практические ответы по исчислению и уплате налогов.',
            ),
            infoblock(
                'Энциклопедия решений. Хозяйственные ситуации',
                'Разбор типовых ситуаций бизнеса с проводками и документами.',
            ),
            infoblock(
                'Комментарии к кодексам',
                'Постатейные комментарии ведущих специалистов.',
            ),
            infoblock(
                'Разъяснения ведомств',
                'Письма Минфина, ФНС, Минтруда и других органов.',
            ),
            infoblock(
                'Книги и статьи',
                'Профессиональная периодика и монографии.',
            ),
        ],
    },
    {
        groupsName: 'Судебная практика',
        infoblocks: [
            infoblock(
                'Практика высших судов',
                'Акты Конституционного и Верховного судов.',
            ),
            infoblock(
                'Практика арбитражных судов',
                'Решения арбитражных судов всех инстанций.',
            ),
            infoblock(
                'Практика судов общей юрисдикции',
                'Решения по гражданским, административным и уголовным делам.',
            ),
            infoblock(
                'Аналитика судебной практики',
                'Обзоры и правовые позиции по спорным вопросам.',
            ),
        ],
    },
    {
        groupsName: 'Справочная информация',
        infoblocks: [
            infoblock(
                'Формы документов',
                'Типовые формы с примерами заполнения.',
            ),
            infoblock('Календарь бухгалтера', 'Сроки отчётности и платежей.'),
            infoblock('Бизнес-справки', 'Ставки, курсы, МРОТ, коды и индексы.'),
            infoblock('Словари и термины', 'Толкование юридических понятий.'),
        ],
    },
    {
        groupsName: 'Сервисы и обучение',
        infoblocks: [
            infoblock('Правовой консалтинг', 'Письменные ответы экспертов.'),
            infoblock(
                'Экспресс-проверка контрагента',
                'Отчёт о надёжности партнёра.',
            ),
            infoblock(
                'Академия ГАРАНТ',
                'Онлайн-семинары и курсы с сертификатами.',
            ),
        ],
    },
];

const productRow = (
    number: string,
    name: string,
    quantity: string,
    price: string,
    sum: string,
    discountPercent: string,
) => ({
    ProductNumber: number,
    ProductName: name,
    ProductQuantity: quantity,
    ProductMeasure: 'мес.',
    ProductPrice: price,
    ProductSum: sum,
    ProductSumString: `${sum} рублей 00 копеек`,
    ProductDiscountSum: '0,00',
    ProductDiscountSumString: 'ноль рублей',
    ProductMonthSum: price,
    ProductMonthSumString: `${price} рублей`,
    ProductPriceDefault: discountPercent === '0' ? price : '12 500,00',
    ProductDiscountPercent: discountPercent,
    ProductTaxSum: '0,00',
    ProductTaxSumString: 'ноль рублей',
    QuantityString: 'на 3 одновременных пользователя',
    ProductContractName: 'Услуги по информационному обслуживанию',
    SupplyNameMarketing: 'Интернет-версия на 3 одновременных пользователя',
    SupplyNameString: 'Интернет 3 ОД',
    ProductByContractName: `Услуги по информационному обслуживанию ${name}`,
    MonthQuantityString: 'месяцев',
    ContractFullName: 'Интернет, длительность 12 мес.',
});

/** Данные КП как их отдаёт OfferRenderDataService — без БД. */
export const createOfferRenderDataFixture = (
    overrides: Partial<IOfferWordRenderData> = {},
): IOfferWordRenderData => ({
    infoblocksByGroups: groups,
    simpleInfoblocks: groups.flatMap(group => group.infoblocks),
    simpleInfoblocksByColumns: [{ columnOne: [], columnTwo: [] }],
    NPA: groups[0].infoblocks,
    Comments: groups[1].infoblocks,
    CaseLaw: groups[2].infoblocks,
    Free: [],
    Special: groups[3].infoblocks,
    STAR: [],
    Academy: [groups[4].infoblocks[2]],
    Consalting: [groups[4].infoblocks[0]],
    PacketsEr: [],
    Ers: [],
    FreeBlocks: [],
    LegalTech: [],

    ProductRows: [
        productRow(
            '1',
            'ГАРАНТ-Профессионал. Бухгалтерия',
            '12',
            '10 625,00',
            '127 500,00',
            '15',
        ),
        productRow(
            '2',
            'Правовой консалтинг',
            '12',
            '1 500,00',
            '18 000,00',
            '0',
        ),
    ],
    TotalRow: [
        {
            TotalProductName: 'ГАРАНТ-Профессионал. Бухгалтерия',
            TotalMonthSum: '12 125,00',
            TotalMonthSumString: 'двенадцать тысяч сто двадцать пять рублей',
            TotalMeasure: 'мес.',
            TotalPrepaymentQuantity: 12,
            TotalPrepaymentQuantityString: 'двенадцать',
            TotalPrepaymentSum: '145 500,00',
            TotalPrepaymentSumString:
                'сто сорок пять тысяч пятьсот рублей 00 копеек',
            TotalSum: '145 500,00',
            TotalSumString: 'сто сорок пять тысяч пятьсот рублей 00 копеек',
            TotalQuantity: 12,
            TotalQuantityString: 'двенадцать',
            TotalProductQuantity: 12,
            TotalProductQuantityString: 'двенадцать',
            TotalMonthQuantity: 12,
            TotalMonthQuantityString: 'двенадцать',
            TaxSum: '0,00',
            TaxSumString: 'ноль рублей',
            TotalSumWithoutTax: '145 500,00',
            TotalSumWithoutTaxString:
                'сто сорок пять тысяч пятьсот рублей 00 копеек',
            TotalFullString: 'Итого: 145 500,00 руб.',
            TotalDiscountSum: '22 500,00',
            TotalDiscountSumString: 'двадцать две тысячи пятьсот рублей',
            TotalDiscountSumMonth: '1 875,00',
            TotalDiscountSumMonthString:
                'одна тысяча восемьсот семьдесят пять рублей',
            TotalTaxInvoiceInfo: 'НДС не облагается (УСН)',
        },
    ],

    MyCompanyName: 'ООО «Гарант-Сервис Воронеж»',
    MyCompanyFullName:
        'Общество с ограниченной ответственностью «Гарант-Сервис Воронеж»',
    MyCompanyINN: '3666012345',
    MyCompanyKPP: '366601001',
    MyCompanyAddress: '394018, г. Воронеж, ул. Плехановская, д. 22',
    MyCompanyPrimaryAddress: '394018, г. Воронеж, ул. Плехановская, д. 22',
    MyCompanyPhone: '+7 (473) 200-00-00',
    MyCompanyEmail: 'sales@garant-vrn.ru',
    MyCompanyBank: 'ПАО Сбербанк',
    MyCompanyBankAddress: 'г. Воронеж',
    MyCompanyBik: '042007681',
    MyCompanyRs: '40702810013000012345',
    MyCompanyKs: '30101810600000000681',
    MyCompanyOgrn: '1023601234567',
    MyCompanyInvoiceRq:
        'ООО «Гарант-Сервис Воронеж», ИНН: 3666012345, КПП: 366601001',

    RecipientName: 'Иван Петрович',
    RecipientPosition: 'Генеральный директор',
    RecipientNameCase: 'Иванову Ивану Петровичу',
    RecipientPositionCase: 'Генеральному директору',
    RecipientCompanyName: 'ООО «Ромашка»',
    RecipientInn: '3664098765',
    RecipientInvoiceRq: 'ООО «Ромашка», ИНН: 3664098765',

    ManagerName: 'Мария Сидорова',
    ManagerPosition: 'Менеджер по работе с клиентами',
    ManagerEmail: 'm.sidorova@garant-vrn.ru',
    ManagerPhone: '+7 (900) 123-45-67',

    GeneralProductName: 'ГАРАНТ-Профессионал. Бухгалтерия',
    GeneralProductContractName: 'Услуги по информационному обслуживанию',
    GeneralSupplyUsersCount: '3',
    GeneralSupplyNameMarketing:
        'Интернет-версия на 3 одновременных пользователя',
    GeneralSupplyNameString: 'Интернет 3 ОД',
    GeneralProductByContractName:
        'Услуги по информационному обслуживанию ГАРАНТ-Профессионал. Бухгалтерия',
    GeneralProductQuantity: 12,
    GeneralProductMonthQuantity: 12,
    GeneralProductSum: '127 500,00',
    GeneralProductMonthSum: '10 625,00',
    GeneralProductYearSum: '127 500,00',

    ...overrides,
});

export const createOfferPdfModelFixture = (
    overrides: Partial<OfferPdfDocumentModel> = {},
): OfferPdfDocumentModel => ({
    templateCode: OfferPdfTemplateCode.CLASSIC,
    settings: { ...OFFER_PDF_DEFAULT_SETTINGS },
    data: createOfferRenderDataFixture(),
    letter: { appeal: null, text: null },
    signer: { position: 'Генеральный директор', name: 'А. В. Кузнецов' },
    images: {},
    meta: { date: '31 октября 2026 г.', documentNumber: null },
    ...overrides,
});
