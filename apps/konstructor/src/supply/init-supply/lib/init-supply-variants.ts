import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { INFOBLOCK_GROUP_TYPE } from '@app/konstructor/document-generate/dto/complect/complect.type';
import {
    ContractSpecificationCodeEnum,
    ContractSpecificationDto,
    ContractSpecificationItemDto,
} from '@app/konstructor/document-generate/dto/specification/specification.dto';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { COMPLECT_VARIANT_SMART_TYPE } from '@lib/portal-lib/pbx/pbx-complect-variant-smart';
import { InitSupplyDto } from '../dto/init-supply.dto';
import { variantLtRows } from './variant-lt-rows';

/** Код поля заявки RPA со ссылками на элементы вариантов (множественное crm). */
export const RPA_COMPLECT_VARIANTS_FIELD = 'complect_variants';

/**
 * Заявка «глазами одного участника»: всё про сделку — из запроса, всё про
 * комплект — из варианта. Так сервисы комментария таймлайна печатают
 * страницу участника тем же кодом, что и одиночную заявку.
 */
export const initSupplyForVariant = (
    dto: InitSupplyDto,
    variant: DocumentVariantDto,
): InitSupplyDto => ({
    ...dto,
    contract: variant.contract,
    contractType: variant.contractType,
    supply: variant.supply,
    total: [variant.total],
    contractSpecificationState:
        variant.contractSpecificationState ??
        specificationFromComplect(variant, dto.contractSpecificationState),
});

/** Группы наполнения → код спецификации, который читают блоки таймлайна. */
const SPECIFICATION_CODE_BY_GROUP: Partial<
    Record<INFOBLOCK_GROUP_TYPE, ContractSpecificationCodeEnum>
> = {
    [INFOBLOCK_GROUP_TYPE.NPA]: ContractSpecificationCodeEnum.IBLOCKS,
    [INFOBLOCK_GROUP_TYPE.LA]: ContractSpecificationCodeEnum.IBLOCKS,
    [INFOBLOCK_GROUP_TYPE.CONS]: ContractSpecificationCodeEnum.IBLOCKS,
    [INFOBLOCK_GROUP_TYPE.SP]: ContractSpecificationCodeEnum.IBLOCKS,
    [INFOBLOCK_GROUP_TYPE.ER]: ContractSpecificationCodeEnum.IERS,
    [INFOBLOCK_GROUP_TYPE.PER]: ContractSpecificationCodeEnum.IERS_PACKETS,
    [INFOBLOCK_GROUP_TYPE.FREE]: ContractSpecificationCodeEnum.IFREE,
    [INFOBLOCK_GROUP_TYPE.CONSULTING]: ContractSpecificationCodeEnum.SERVICES,
};

/**
 * Спецификация участника из его наполнения.
 *
 * Спецификацию договора фронт получает от Laravel при инициализации формы —
 * по одному состоянию, для открытого набора. У остальных участников её нет,
 * а страница в таймлайне читает инфоблоки именно из неё. Поэтому поля про
 * инфоблоки и имя комплекта пересобираются из `complect` варианта, а всё
 * остальное (ОД, дистрибутив, комментарии) остаётся от заявки.
 *
 * Legal Tech собирается отдельно (см. variantLtRows): группа LT в `complect`
 * не делит сервисы на бесплатные и платные и не знает названий пакетов.
 */
export const specificationFromComplect = (
    variant: DocumentVariantDto,
    base: ContractSpecificationDto,
): ContractSpecificationDto => {
    const values = new Map<ContractSpecificationCodeEnum, string[]>();
    for (const group of variant.complect ?? []) {
        const code = SPECIFICATION_CODE_BY_GROUP[group.type];
        if (!code) {
            continue;
        }
        const names = group.value
            .filter(item => item.checked)
            .map(item => item.name);
        values.set(code, [...(values.get(code) ?? []), ...names]);
    }

    const overridden = new Set<string>([
        ...values.keys(),
        ContractSpecificationCodeEnum.COMPLECT_NAME,
    ]);
    const lt = variantLtRows(variant, base);
    const kept = (base?.items ?? []).filter(
        item =>
            !overridden.has(String(item.code)) &&
            !lt.replaces(String(item.code)),
    );
    // Синтезированные пункты несут только код и значение — ровно то, что
    // читают блоки таймлайна; остальные поля формы здесь не нужны.
    const synthesized = [
        {
            code: ContractSpecificationCodeEnum.COMPLECT_NAME,
            value: variant.title,
        },
        ...[...values.entries()].map(([code, names]) => ({
            code,
            value: names.join('\n'),
        })),
        ...lt.rows,
    ].map(
        item => ({ ...item, name: item.code }) as ContractSpecificationItemDto,
    );

    return { ...base, items: [...kept, ...synthesized] };
};

/**
 * Значение множественного crm-поля со ссылками на варианты:
 * `T{hex(entityTypeId)}_{id}` — так Битрикс адресует элементы динамических
 * типов; префикс уже лежит в `smarts.crm`. Поля на портале нет или смарт не
 * установлен — пусто, заявка создаётся без ссылок.
 */
export const buildVariantLinksField = (
    dto: InitSupplyDto,
    portalModel: PortalModel,
): Record<string, string[]> => {
    const ids = (dto.variants ?? [])
        .map(variant => variant.variantSmartId)
        .filter((id): id is number => typeof id === 'number' && id > 0);
    if (!ids.length) {
        return {};
    }

    const fieldId = portalModel.getRpaFieldBitrixIdByCode(
        'supply',
        RPA_COMPLECT_VARIANTS_FIELD,
    );
    const smart = portalModel.getSmartByType(COMPLECT_VARIANT_SMART_TYPE);
    if (!fieldId || !smart?.crm) {
        return {};
    }

    return { [fieldId]: ids.map(id => `${smart.crm}${id}`) };
};

/**
 * Id участников заявки — варианты, которые менеджер продаёт. Берём
 * положительные целые из `variantSmartId`, без повторов, в порядке запроса.
 * Пустой список означает запрос без вариантов (старый фронт или сделка без
 * вариантов).
 */
export const participantVariantIds = (dto: InitSupplyDto): number[] => {
    const unique = new Set<number>();
    for (const variant of dto.variants ?? []) {
        const id = Number(variant.variantSmartId);
        if (Number.isInteger(id) && id > 0) {
            unique.add(id);
        }
    }
    return [...unique];
};

/**
 * Варианты сделки, которые остаются вне поставки: строки слепков с элементом
 * смарта, чьего id нет среди участников заявки. Без участников список пуст:
 * запрос без вариантов ничего не закрывает.
 */
export const selectLeftoutVariantIds = (
    dealVariants: readonly { smartId: number | null }[],
    participantIds: readonly number[],
): number[] => {
    if (!participantIds.length) {
        return [];
    }
    const participants = new Set(participantIds);
    const leftout = new Set<number>();
    for (const row of dealVariants) {
        if (row.smartId && !participants.has(row.smartId)) {
            leftout.add(row.smartId);
        }
    }
    return [...leftout];
};
