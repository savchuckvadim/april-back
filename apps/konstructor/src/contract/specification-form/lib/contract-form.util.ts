import {
    FormFieldDto,
    FormFieldTypeEnum,
} from '@app/konstructor/document-generate/dto/form-field/form-field.dto';
import {
    ContractSpecificationCodeEnum,
    ContractSpecificationItemDto,
} from '@app/konstructor/document-generate/dto/specification/specification.dto';
import {
    CONTRACT_RQ_GROUP,
    RQ_TYPE,
    SupplyTypeEnum,
} from '@app/konstructor/document-generate/type/bx-rq.type';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import type { SupplyTexts } from '@lib/garant';
import { ContractIBlocks } from './contract-iblocks.util';

/**
 * Общая форма договора и спецификация — порт Laravel
 * `ContractController::getContractGeneralForm` (1963-2145) и
 * `getSpecification` (2145-3100). Чистые функции: данные приходят уже
 * нормализованными (см. SpecificationInput), поэтому один код обслуживает и
 * новую ручку `contract/specification-form`, и легаси `init-form`.
 */

/** Денежная часть строки: месяц, сумма, количество (RowPriceDto). */
export interface RowMoney {
    month: number;
    sum: number;
    quantity: number;
}

/** Тексты поставки под тип договора (услуги / лицензия / абонемент). */
export interface SupplyContractTexts {
    /** Вид размещения («Многопользовательская Интернет-версия 5 ОД») */
    name: string;
    /** Примечание к виду размещения */
    comment: string;
    /** Примечание про email / носитель */
    email: string;
    /** Количество логинов и паролей */
    loginsQuantity: string;
    /** Носители (proxima) */
    distributive: string;
    /** Способ доставки носителей (proxima) */
    deliveryWay: string;
    /** Подпись поставки для КП («Интернет версия на 5 одновременных доступов») */
    quantityForKp: string;
}

export interface SpecificationLt {
    freePacket: string;
    freeServices: string[];
    paidPacket: string;
    paidServices: string[];
}

export interface SpecificationConsalting {
    /** Название ПК/ГЛ: «Горячая Линия», «Советы экспертов…» */
    name: string;
    /** Текст для договора (легаси contractConsaltingProp) */
    prop: string;
    /** Комментарий (легаси contractConsaltingComment) */
    comment: string;
}

export interface SpecificationInput {
    contractType: CONTRACT_LTYPE;
    supplyType: SupplyTypeEnum;
    supply: SupplyContractTexts;
    /** Множитель длительности договора: 1 / 6 / 12 / 24 */
    contractCoefficient: number;
    /** Названия товаров-комплектов (строки garant) */
    productNames: string[];
    rows: RowMoney[];
    consalting: SpecificationConsalting;
    lt: SpecificationLt;
    iblocks: ContractIBlocks;
}

const ALL_CLIENTS: RQ_TYPE[] = [
    RQ_TYPE.ORGANIZATION,
    RQ_TYPE.BUDGET,
    RQ_TYPE.IP,
    RQ_TYPE.ADVOKAT,
    RQ_TYPE.FIZ,
];
/** Бюджетники предоплату не вносят — у «предоплатных» полей их нет. */
const PREPAY_CLIENTS: RQ_TYPE[] = [
    RQ_TYPE.ORGANIZATION,
    RQ_TYPE.IP,
    RQ_TYPE.ADVOKAT,
    RQ_TYPE.FIZ,
];
const ALL_SUPPLIES: SupplyTypeEnum[] = [
    SupplyTypeEnum.INTERNET,
    SupplyTypeEnum.PROXIMA,
];
const ALL_CONTRACTS: CONTRACT_LTYPE[] = [
    CONTRACT_LTYPE.SERVICE,
    CONTRACT_LTYPE.LIC,
    CONTRACT_LTYPE.ABON,
    CONTRACT_LTYPE.KEY,
];

export interface ContractMoney {
    monthSum: number;
    prepaymentSum: number;
    contractSum: number;
    /** Количество главного товара (легаси generalProductQuantity, по умолчанию 1) */
    generalQuantity: number;
}

/** Суммы по строкам — одинаково для общей формы и спецификации. */
export const sumContractMoney = (rows: RowMoney[]): ContractMoney => {
    let monthSum = 0;
    let prepaymentSum = 0;
    let generalQuantity = 1;
    for (const row of rows) {
        monthSum += Number(row.month) || 0;
        prepaymentSum += Number(row.sum) || 0;
        generalQuantity = Math.trunc(Number(row.quantity)) || generalQuantity;
    }
    return {
        monthSum,
        prepaymentSum,
        contractSum: monthSum * 12,
        generalQuantity,
    };
};

type FieldSeed = Pick<
    FormFieldDto,
    | 'type'
    | 'name'
    | 'value'
    | 'isRequired'
    | 'isActive'
    | 'isDisable'
    | 'order'
> & {
    code: string;
    includes?: RQ_TYPE[];
    supplies?: SupplyTypeEnum[];
    contractType?: CONTRACT_LTYPE[];
    isHidden?: boolean;
};

const field = (
    group: CONTRACT_RQ_GROUP,
    seed: FieldSeed,
): FormFieldDto & { code: string } => ({
    type: seed.type,
    name: seed.name,
    value: seed.value,
    isRequired: seed.isRequired,
    code: seed.code,
    group,
    isActive: seed.isActive,
    isDisable: seed.isDisable,
    order: seed.order,
    includes: seed.includes ?? ALL_CLIENTS,
    supplies: seed.supplies,
    contractType: seed.contractType,
    isHidden: seed.isHidden,
});

/** Общая форма договора: даты и суммы (группа `contract`). */
export const buildContractGeneralForm = (
    rows: RowMoney[],
    contractCoefficient: number,
): FormFieldDto[] => {
    void contractCoefficient; // легаси считал prepaymentQuantity, но не отдавал его
    const money = sumContractMoney(rows);
    const date = (
        name: string,
        code: string,
        order: number,
        options: {
            isRequired: boolean;
            isActive: boolean;
            includes?: RQ_TYPE[];
        },
    ) =>
        field(CONTRACT_RQ_GROUP.CONTRACT, {
            type: FormFieldTypeEnum.DATE,
            name,
            value: '',
            code,
            order,
            isDisable: false,
            ...options,
        });
    const sum = (
        name: string,
        code: string,
        order: number,
        value: number,
        includes?: RQ_TYPE[],
        extra?: Partial<FieldSeed>,
    ) =>
        field(CONTRACT_RQ_GROUP.CONTRACT, {
            type: FormFieldTypeEnum.STRING,
            name,
            value: String(value),
            code,
            order,
            isRequired: true,
            isActive: true,
            isDisable: true,
            includes,
            ...extra,
        });

    return [
        date('Договор от', 'contract_create_date', 0, {
            isRequired: true,
            isActive: true,
        }),
        date('Действие договора с', 'contract_start', 1, {
            isRequired: true,
            isActive: true,
        }),
        date('Действие договора по', 'contract_finish', 2, {
            isRequired: true,
            isActive: true,
        }),
        date('Предоплата с', 'prepayment_start', 5, {
            isRequired: false,
            isActive: false,
            includes: PREPAY_CLIENTS,
        }),
        date('Предоплата по', 'prepayment_finish', 6, {
            isRequired: false,
            isActive: false,
            includes: PREPAY_CLIENTS,
        }),
        date('Внести предоплату не позднее', 'contract_pay_date', 7, {
            isRequired: true,
            isActive: false,
            includes: PREPAY_CLIENTS,
        }),
        date('Период в подарок с', 'present_start', 8, {
            isRequired: false,
            isActive: false,
        }),
        date('Период в подарок по', 'present_finish', 9, {
            isRequired: false,
            isActive: false,
        }),
        sum('Сумма по договору', 'period_sum', 10, money.contractSum),
        sum(
            'Сумма предоплаты',
            'prepayment_sum',
            5,
            money.prepaymentSum,
            PREPAY_CLIENTS,
        ),
        sum('Сумма в месяц', 'month_sum', 6, money.monthSum, undefined, {
            supplies: ALL_SUPPLIES,
            contractType: [CONTRACT_LTYPE.SERVICE],
        }),
    ];
};

/**
 * Тексты поставки под тип договора: услуги — contract*, лицензия — lcontract*
 * (с откатом на contract*), абонемент и ключ — acontract*. «ОД» к названию
 * интернет-поставки дописывал Laravel — оставлено.
 */
export const supplyTextsForContract = (
    // значения unknown: SupplyDto хранит contractPropSuppliesQuantity числом или строкой
    texts: Partial<Record<keyof SupplyTexts, unknown>>,
    contractType: CONTRACT_LTYPE,
    supplyType: SupplyTypeEnum,
): SupplyContractTexts => {
    const text = (value: unknown): string =>
        typeof value === 'string' ? value : '';
    const pick = (...values: unknown[]): string =>
        values.map(text).find(Boolean) ?? '';
    let name = text(texts.contractName);
    let comment = text(texts.contractPropComment);
    let email = text(texts.contractPropEmail);
    let deliveryWay = text(texts.contractProp2);
    if (contractType === CONTRACT_LTYPE.LIC) {
        name = pick(texts.lcontractName, texts.contractName);
        comment = pick(texts.lcontractPropComment, texts.contractPropComment);
        email = pick(texts.lcontractPropEmail, texts.contractPropEmail);
        deliveryWay = pick(texts.lcontractProp2, texts.contractProp2);
    } else if (
        contractType === CONTRACT_LTYPE.ABON ||
        contractType === CONTRACT_LTYPE.KEY
    ) {
        name = pick(texts.acontractName, texts.contractName);
        comment = pick(texts.acontractPropComment, texts.contractPropComment);
    }
    if (name && supplyType === SupplyTypeEnum.INTERNET && !/ОД$/.test(name)) {
        name = `${name} ОД`;
    }
    return {
        name,
        comment,
        email,
        loginsQuantity: text(texts.contractPropLoginsQuantity),
        distributive: text(texts.contractProp1),
        deliveryWay,
        quantityForKp: text(texts.quantityForKp),
    };
};

/** Спецификация договора (Приложение): полный легаси-состав, без фильтра. */
export const buildSpecificationItems = (
    input: SpecificationInput,
): ContractSpecificationItemDto[] => {
    const money = sumContractMoney(input.rows);
    const { supply, lt, consalting, iblocks } = input;
    const quantityMonths = money.generalQuantity * input.contractCoefficient;
    const spec = (
        code: ContractSpecificationCodeEnum,
        seed: Omit<FieldSeed, 'code'> &
            Partial<Pick<FieldSeed, 'supplies' | 'contractType'>>,
    ): ContractSpecificationItemDto => ({
        ...field(CONTRACT_RQ_GROUP.SPECIFICATION, {
            supplies: ALL_SUPPLIES,
            contractType: ALL_CONTRACTS,
            ...seed,
            code,
        }),
        code,
    });
    const T = FormFieldTypeEnum;

    return [
        spec(ContractSpecificationCodeEnum.COMPLECT_NAME, {
            type: T.TEXT,
            name: 'Наименование',
            value: input.productNames.map(name => `${name} \n`).join(''),
            isRequired: false,
            isActive: true,
            isDisable: false,
            order: 0,
        }),
        spec(ContractSpecificationCodeEnum.PRODUCTS_NAMES_COMMENT, {
            type: T.STRING,
            name: 'Вид поставки',
            value: supply.quantityForKp,
            isRequired: false,
            isActive: true,
            isDisable: true,
            order: 1,
        }),
        spec(ContractSpecificationCodeEnum.SUPPLY, {
            type: T.TEXT,
            name: 'Вид Размещения',
            value: supply.name,
            isRequired: false,
            isActive: true,
            isDisable: true,
            order: 1.5,
        }),
        spec(ContractSpecificationCodeEnum.PK, {
            type: T.STRING,
            name: 'ПК/ГЛ',
            value: consalting.name,
            isRequired: false,
            isActive: true,
            isDisable: true,
            order: 2,
            isHidden: true,
        }),
        spec(ContractSpecificationCodeEnum.PK_COMMENT1, {
            type: T.STRING,
            name: 'ПК/ГЛ договор',
            value: consalting.prop,
            isRequired: false,
            isActive: true,
            isDisable: true,
            order: 2,
            isHidden: true,
        }),
        spec(ContractSpecificationCodeEnum.PK_COMMENT, {
            type: T.TEXT,
            name: 'Комментарий к ПК/ГЛ',
            value: consalting.comment,
            isRequired: false,
            isActive: true,
            isDisable: true,
            order: 3,
            isHidden: true,
        }),
        spec(ContractSpecificationCodeEnum.IBLOCKS, {
            type: T.TEXT,
            name: 'Информационные блоки',
            value: iblocks.allIBlocks,
            isRequired: false,
            isActive: true,
            isDisable: true,
            order: 4,
            isHidden: true,
        }),
        spec(ContractSpecificationCodeEnum.ISMALL, {
            type: T.TEXT,
            name: 'Малые информационные блоки',
            value: iblocks.smallIBlocks,
            isRequired: false,
            isActive: false,
            isDisable: false,
            order: 5,
        }),
        spec(ContractSpecificationCodeEnum.IBIG, {
            type: T.TEXT,
            name: 'Большие информационные блоки',
            value: iblocks.bigIBlocks,
            isRequired: false,
            isActive: false,
            isDisable: false,
            order: 5,
        }),
        spec(ContractSpecificationCodeEnum.IERS, {
            type: T.TEXT,
            name: 'Энциклопедии Решений',
            value: iblocks.ers,
            isRequired: false,
            isActive: true,
            isDisable: false,
            order: 5,
            isHidden: true,
        }),
        spec(ContractSpecificationCodeEnum.IERS_PACKETS, {
            type: T.TEXT,
            name: 'Пакеты Энциклопедий Решений',
            value: iblocks.erPackets,
            isRequired: false,
            isActive: true,
            isDisable: false,
            order: 5,
            isHidden: true,
        }),
        spec(ContractSpecificationCodeEnum.IERS_IN_PACKETS, {
            type: T.TEXT,
            name: 'Состав Пакетов Энциклопедий Решений',
            value: iblocks.ersInPacket,
            isRequired: false,
            isActive: true,
            isDisable: false,
            order: 5,
            isHidden: true,
        }),
        spec(ContractSpecificationCodeEnum.IFREE, {
            type: T.TEXT,
            name: 'Бесплатные информационные блоки',
            value: iblocks.freeIBlocks,
            isRequired: false,
            isActive: true,
            isDisable: false,
            order: 6,
            isHidden: true,
        }),
        spec(ContractSpecificationCodeEnum.LT_FREE, {
            type: T.STRING,
            name: 'Legal Tech в комплекте (бесплатно)',
            value: lt.freePacket,
            isRequired: false,
            isActive: Boolean(lt.freePacket),
            isDisable: true,
            order: 7,
            isHidden: true,
        }),
        spec(ContractSpecificationCodeEnum.LT_FREE_SERVICES, {
            type: T.TEXT,
            name: 'Состав Бесплатных Legal Tech',
            value: lt.freeServices.map(name => ` ${name}\n`).join(''),
            isRequired: false,
            isActive: lt.freeServices.length > 0,
            isDisable: true,
            order: 8,
            isHidden: true,
        }),
        spec(ContractSpecificationCodeEnum.LT_PACKET, {
            type: T.STRING,
            name: 'Платный Пакет Legal Tech',
            value: lt.paidPacket,
            isRequired: false,
            isActive: Boolean(lt.paidPacket),
            isDisable: true,
            order: 9,
            isHidden: true,
        }),
        spec(ContractSpecificationCodeEnum.LT_SERVICES, {
            type: T.TEXT,
            name: 'Состав Платного Legal Tech',
            value: lt.paidServices.map(name => `${name}\n`).join(''),
            isRequired: false,
            isActive: lt.paidServices.length > 0,
            isDisable: true,
            order: 10,
            isHidden: true,
        }),
        spec(ContractSpecificationCodeEnum.SERVICES, {
            type: T.TEXT,
            name: 'Другие сервисы',
            value: iblocks.starLtBlocks,
            isRequired: false,
            isActive: Boolean(iblocks.starLtBlocks),
            isDisable: true,
            order: 11,
            isHidden: true,
        }),
        spec(ContractSpecificationCodeEnum.SUPPLY_COMMENT, {
            type: T.TEXT,
            name: 'Примечание Вид Размещения',
            value: supply.comment,
            isRequired: false,
            isActive: false,
            isDisable: false,
            order: 13,
        }),
        spec(ContractSpecificationCodeEnum.DISTRIBUTIVE, {
            type: T.TEXT,
            name: 'Носители, используемые при предоставлении услуг',
            value: supply.distributive,
            isRequired: true,
            isActive: true,
            isDisable: false,
            order: 14,
            isHidden: true,
            supplies: [SupplyTypeEnum.PROXIMA],
            contractType: [
                CONTRACT_LTYPE.SERVICE,
                CONTRACT_LTYPE.LIC,
                CONTRACT_LTYPE.KEY,
            ],
        }),
        spec(ContractSpecificationCodeEnum.DISTRIBUTIVE_COMMENT, {
            type: T.TEXT,
            name: 'Примечание Носители',
            value: supply.email,
            isRequired: true,
            isActive: false,
            isDisable: false,
            order: 15,
            isHidden: true,
            supplies: [SupplyTypeEnum.PROXIMA],
            contractType: [
                CONTRACT_LTYPE.SERVICE,
                CONTRACT_LTYPE.LIC,
                CONTRACT_LTYPE.KEY,
            ],
        }),
        spec(ContractSpecificationCodeEnum.DWAY, {
            type: T.TEXT,
            name: 'Носители дистрибутивов предоставляются следующим способом',
            value: supply.deliveryWay,
            isRequired: true,
            isActive: true,
            isDisable: false,
            order: 16,
            isHidden: true,
            supplies: [SupplyTypeEnum.PROXIMA],
            contractType: [
                CONTRACT_LTYPE.SERVICE,
                CONTRACT_LTYPE.LIC,
                CONTRACT_LTYPE.KEY,
            ],
        }),
        spec(ContractSpecificationCodeEnum.DWAY_COMMENT, {
            type: T.TEXT,
            name: 'Примечание к способу',
            value: '',
            isRequired: true,
            isActive: false,
            isDisable: false,
            order: 17,
            isHidden: true,
            supplies: [SupplyTypeEnum.PROXIMA],
            contractType: [
                CONTRACT_LTYPE.SERVICE,
                CONTRACT_LTYPE.LIC,
                CONTRACT_LTYPE.KEY,
            ],
        }),
        spec(ContractSpecificationCodeEnum.SERVICE_PERIOD, {
            type: T.STRING,
            name: 'Периодичность предоставления услуг',
            value: '1 неделя',
            isRequired: true,
            isActive: true,
            isDisable: false,
            order: 18,
            supplies: [SupplyTypeEnum.PROXIMA],
            contractType: [CONTRACT_LTYPE.SERVICE, CONTRACT_LTYPE.LIC],
        }),
        spec(ContractSpecificationCodeEnum.SUPPLY_QUANTITY, {
            type: T.TEXT,
            name: 'Количество логинов и паролей',
            value: supply.loginsQuantity,
            isRequired: false,
            isActive: true,
            isDisable: true,
            order: 19,
            supplies: [SupplyTypeEnum.INTERNET],
        }),
        spec(ContractSpecificationCodeEnum.KEY_PERIOD, {
            type: T.STRING,
            name: 'Длительность работы ключа',
            value: `${quantityMonths} мес.`,
            isRequired: false,
            isActive: true,
            isDisable: true,
            order: 20,
            contractType: [CONTRACT_LTYPE.KEY],
        }),
        spec(ContractSpecificationCodeEnum.EMAIL_COMMENT, {
            type: T.TEXT,
            name: 'Email примечание',
            value: supply.email,
            isRequired: true,
            isActive: false,
            isDisable: false,
            order: 22,
            isHidden: true,
            supplies: [SupplyTypeEnum.INTERNET],
        }),
        spec(ContractSpecificationCodeEnum.ABON_LONG, {
            type: T.STRING,
            name: 'Срок действия абонемента',
            value: String(quantityMonths),
            isRequired: false,
            isActive: true,
            isDisable: true,
            order: 23,
            contractType: [CONTRACT_LTYPE.ABON],
            supplies: [SupplyTypeEnum.INTERNET],
        }),
        spec(ContractSpecificationCodeEnum.LIC_LONG, {
            type: T.TEXT,
            name: 'Срок действия лицензии, количество лицензий',
            value:
                `Количество лицензий: ${Math.min(money.generalQuantity, input.contractCoefficient)}\n` +
                `Срок действия лицензии: ${Math.max(money.generalQuantity, input.contractCoefficient)} (месяц) `,
            isRequired: false,
            isActive: true,
            isDisable: true,
            order: 23,
            contractType: [CONTRACT_LTYPE.LIC],
        }),
    ];
};

export interface SpecificationScope {
    supplyType: SupplyTypeEnum;
    contractType: CONTRACT_LTYPE;
    clientType: RQ_TYPE;
}

/** Только строки, применимые к поставке, типу договора и типу клиента (легаси getContract). */
export const filterSpecificationItems = <T extends FormFieldDto>(
    items: T[],
    scope: SpecificationScope,
): T[] =>
    items.filter(item => {
        const bySupply =
            !item.supplies || item.supplies.includes(scope.supplyType);
        const byContract =
            !item.contractType ||
            item.contractType.includes(scope.contractType);
        const byClient =
            !item.includes?.length || item.includes.includes(scope.clientType);
        return bySupply && byContract && byClient;
    });
