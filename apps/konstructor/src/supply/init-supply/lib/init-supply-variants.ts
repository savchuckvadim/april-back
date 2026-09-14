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
    [INFOBLOCK_GROUP_TYPE.LT]: ContractSpecificationCodeEnum.LT_PACKET,
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
    const kept = (base?.items ?? []).filter(
        item => !overridden.has(String(item.code)),
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
