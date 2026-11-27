import { paidLtPacketsOf } from '@app/konstructor/contract/specification-form/lib/contract-form.util';
import { INFOBLOCK_GROUP_TYPE } from '@app/konstructor/document-generate/dto/complect/complect.type';
import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { ProductTypeEnum } from '@app/konstructor/document-generate/dto/product/product.dto';
import {
    ContractSpecificationCodeEnum,
    ContractSpecificationDto,
} from '@app/konstructor/document-generate/dto/specification/specification.dto';
import {
    buildLtSpecificationRows,
    isLtPaidSpecificationCode,
    isLtSpecificationCode,
    LtPaidPacketRow,
    LtSpecificationRow,
} from '@app/konstructor/document-generate/lib/specification-lt.util';

/** Legal Tech участника: его строки спецификации и какие LT-строки заявки они заменяют. */
export interface VariantLtRows {
    rows: LtSpecificationRow[];
    replaces: (code: string) => boolean;
}

const textOf = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : '';

const linesOf = (value: unknown): string[] =>
    textOf(value)
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

/**
 * Названия платных пакетов участника. Платный пакет LT — товарная строка
 * основного набора (`lt` и `lt_other`), её `name` — название пакета из
 * каталога. Свёрнутый набор печатается одной итоговой строкой, поэтому
 * строки по типам читаются из `sets.general`, а список `rows` — запасной путь.
 */
const paidPacketNames = (variant: DocumentVariantDto): string[] => {
    const setRows = variant.sets?.general?.[0]?.rows;
    const fromSet = [...(setRows?.lt ?? []), ...(setRows?.lt_other ?? [])];
    const rows = fromSet.length
        ? fromSet
        : (variant.rows ?? []).filter(
              row =>
                  row.type === 'general' &&
                  (row.productType === ProductTypeEnum.lt ||
                      row.productType === ProductTypeEnum.lt_other),
          );
    return rows
        .map(row => textOf(row.name) || textOf(row.shortName))
        .filter(Boolean);
};

/** Сервисы LT из наполнения участника: бесплатная часть и платные пакеты вместе. */
const ltGroupServices = (variant: DocumentVariantDto): string[] => [
    ...new Set(
        (variant.complect ?? [])
            .filter(group => group.type === INFOBLOCK_GROUP_TYPE.LT)
            .flatMap(group =>
                group.value
                    .filter(item => item.checked)
                    .map(item => textOf(item.name))
                    .filter(Boolean),
            ),
    ),
];

/**
 * Платные пакеты участника без поля `lt`. Название — по товару-пакету.
 * Состав пакета известен, когда пакет один: сервисы наполнения без тех, что
 * перечислены в бесплатной части заявки. Пакетов несколько — наполнение не
 * делится между ними, и печатаются одни названия.
 */
const paidPacketsFromRows = (
    variant: DocumentVariantDto,
    base: ContractSpecificationDto,
): LtPaidPacketRow[] => {
    const names = paidPacketNames(variant);
    if (names.length !== 1) {
        return names.map(name => ({ name, services: [] }));
    }
    const freeServicesCode: string =
        ContractSpecificationCodeEnum.LT_FREE_SERVICES;
    const free = new Set(
        linesOf(
            base?.items?.find(item => item.code === freeServicesCode)?.value,
        ),
    );
    return [
        {
            name: names[0],
            services: ltGroupServices(variant).filter(
                service => !free.has(service),
            ),
        },
    ];
};

/**
 * Строки Legal Tech страницы участника. Фронт прислал `lt` варианта — по
 * нему целиком заменяются бесплатный и платные пакеты заявки. Иначе
 * бесплатная часть остаётся из спецификации заявки, а платные пакеты
 * собираются по строкам варианта. Раньше сюда шли названия сервисов
 * наполнения как название платного пакета: платный LT выходил составом без
 * названия пакета, а бесплатный состав повторялся в нём же.
 */
export const variantLtRows = (
    variant: DocumentVariantDto,
    base: ContractSpecificationDto,
): VariantLtRows => {
    if (variant.lt) {
        return {
            rows: buildLtSpecificationRows({
                freePacket: textOf(variant.lt.freePacket),
                freeServices: (variant.lt.freeServices ?? []).map(textOf),
                paidPackets: paidLtPacketsOf(variant.lt),
            }),
            replaces: isLtSpecificationCode,
        };
    }
    return {
        rows: buildLtSpecificationRows({
            freePacket: '',
            freeServices: [],
            paidPackets: paidPacketsFromRows(variant, base),
        }),
        replaces: isLtPaidSpecificationCode,
    };
};
