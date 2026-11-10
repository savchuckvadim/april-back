import { IBXDeal, IBXProductRowRow } from '@lib/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import type {
    IField,
    IPSmart,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    PBX_SALES_KONSTRUCTOR_FIELDS,
    PbxSalesKonstructorFieldCode,
} from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
import {
    DealFieldSkipReason,
    INN_PROTECTED_CODES,
    DealSendFieldDto,
    DealSendProductRowDto,
} from '../dto/deal-send.dto';

export interface SkippedDealField {
    code: string;
    reason: DealFieldSkipReason;
    /** Название поля для человека: схема портала, иначе канон, иначе код */
    title: string;
}

/**
 * Результат поиска поля. Размеченный union, а не `string | reason`: причины —
 * тоже строки, и их легко записать в сделку вместо имени поля.
 */
type DealFieldLookup = { bitrixId: string } | { reason: DealFieldSkipReason };

/** Что получилось из семантических кодов после сверки со схемой портала. */
export interface ResolvedDealFields {
    /** `UF_CRM_*` → значение, готовое для crm.deal.update. */
    fields: Partial<IBXDeal>;
    /** Коды, значения по которым записаны не были. */
    skipped: SkippedDealField[];
}

/**
 * Переводит коды konstructor-полей в идентификаторы полей сделки этого портала.
 *
 * Раньше эту карту таскал фронт (Google-таблица → `state.bitrix.*`), из-за чего
 * id полей жили вне кода и расходились между порталами. Теперь источник один —
 * pbx-схема портала, а при неоднозначности код сверяется с каноном.
 */
export class DealFieldResolverService {
    constructor(private readonly portalModel: PortalModel) {}

    /**
     * Поля элемента смарта: ключи — camelCase (`ufCrm…`), как их принимает
     * crm.item.update; поле ищется по коду в `bitrixfields` смарта. Неоднозначный
     * код (consalting) разбирается по appType через канон, как у сделки.
     */
    resolveSmartFields(
        fields: DealSendFieldDto[],
        smart: IPSmart,
    ): {
        fields: Record<string, DealSendFieldDto['value']>;
        skipped: SkippedDealField[];
    } {
        const resolved: Record<string, DealSendFieldDto['value']> = {};
        const skipped: SkippedDealField[] = [];
        for (const field of fields) {
            const candidates = smart.bitrixfields.filter(
                item => item.code === field.code,
            );
            let portalField: IField | undefined = candidates[0];
            if (candidates.length > 1) {
                const canon = PBX_SALES_KONSTRUCTOR_FIELDS.find(
                    entry =>
                        entry.code === field.code &&
                        entry.appType === field.appType,
                );
                portalField = canon
                    ? (candidates.find(
                          item => String(item.bitrixId) === String(canon.smart),
                      ) ?? candidates[0])
                    : undefined;
                if (!portalField) {
                    skipped.push({
                        code: field.code,
                        reason: 'ambiguous_code',
                        title: canonTitle(field),
                    });
                    continue;
                }
            }
            if (!portalField?.bitrixCamelId) {
                skipped.push({
                    code: field.code,
                    reason: 'not_on_portal',
                    title: canonTitle(field),
                });
                continue;
            }
            if (!hasKnownListItem(portalField, field.value)) {
                skipped.push({
                    code: field.code,
                    reason: 'unknown_item',
                    title: portalField.title || canonTitle(field),
                });
                continue;
            }
            resolved[portalField.bitrixCamelId] = field.value;
        }
        return { fields: resolved, skipped };
    }

    resolve(fields: DealSendFieldDto[]): ResolvedDealFields {
        const resolved: Partial<IBXDeal> = {};
        const skipped: SkippedDealField[] = [];

        for (const field of fields) {
            /*
             * Вторая линия обороны. Валидация DTO такие коды уже не пропускает,
             * но резолвер зовут и из других мест, а цена ошибки — стёртый пул
             * ИНН, который собирался из лида, компании и реквизитов.
             */
            if (INN_PROTECTED_CODES.includes(field.code)) {
                skipped.push({
                    code: field.code,
                    reason: 'inn_protected',
                    title: canonTitle(field),
                });
                continue;
            }
            const lookup = this.resolveFieldId(field);
            if ('reason' in lookup) {
                skipped.push({
                    code: field.code,
                    reason: lookup.reason,
                    title: canonTitle(field),
                });
                continue;
            }
            // пункт списка, которого нет на портале, Bitrix молча запишет как «не выбрано»
            const portalField = this.findDealField(lookup.bitrixId);
            if (portalField && !hasKnownListItem(portalField, field.value)) {
                skipped.push({
                    code: field.code,
                    reason: 'unknown_item',
                    title: portalField.title || canonTitle(field),
                });
                continue;
            }
            resolved[lookup.bitrixId] = field.value;
        }

        return { fields: resolved, skipped };
    }

    /**
     * Имя поля сделки либо причина, почему его нет.
     *
     * Один код может означать два разных поля: на порталах `consalting` — это и
     * инфоблочное описание («Consalting»), и продуктовое поле («Правовой
     * Консалтинг»). Портальная схема их не различает, канон — различает по
     * appType, поэтому при неоднозначности идём через него.
     */
    private resolveFieldId(field: DealSendFieldDto): DealFieldLookup {
        const canonEntries = PBX_SALES_KONSTRUCTOR_FIELDS.filter(
            entry => entry.code === field.code,
        );

        if (canonEntries.length > 1) {
            if (!field.appType) {
                return { reason: 'ambiguous_code' };
            }
            const exact = canonEntries.find(
                entry => entry.appType === field.appType,
            );
            if (!exact) {
                return { reason: 'ambiguous_code' };
            }
            return this.findPortalFieldIdByCanonDealId(exact.deal);
        }

        const bitrixId = this.portalModel.getDealFieldBitrixIdByCode(
            field.code,
        );
        return bitrixId ? { bitrixId } : { reason: 'not_on_portal' };
    }

    /** Поле сделки портала по уже найденному идентификатору UF_CRM_*. */
    private findDealField(bitrixId: string): IField | undefined {
        return this.portalModel
            .getDealFields()
            .find(item => this.portalModel.getFieldBitrixId(item) === bitrixId);
    }

    /** Поле портала, чей bitrixId совпал с каноническим id сделки. */
    private findPortalFieldIdByCanonDealId(
        canonDealId: string | number,
    ): DealFieldLookup {
        const target = String(canonDealId);
        const portalField = this.portalModel
            .getDealFields()
            .find(item => String(item.bitrixId) === target);

        if (!portalField) {
            return { reason: 'not_on_portal' };
        }
        return { bitrixId: this.portalModel.getFieldBitrixId(portalField) };
    }

    /**
     * Товарные строки в форме crm.item.productrow.set — поле в поле как у
     * легаси, включая `customized: 'Y'` и дублирование кода единицы в
     * `measureId` (в этом виде Битрикс их и принимает сегодня).
     *
     * `measureCode` — код единицы в Битриксе, он же `portal_measure.bitrixId`.
     * Если фронт прислал вместо него семантический код (`measures.code`),
     * достаём `bitrixId` из портальной схемы.
     */
    resolveProductRows(rows: DealSendProductRowDto[]): IBXProductRowRow[] {
        return rows.map((row, index) => {
            const measureCode = this.resolveMeasureCode(row);

            return {
                id: row.productId,
                productName: row.productName,
                price: row.price,
                quantity: row.quantity,
                priceNetto: row.priceNetto ?? row.price,
                discountSum: row.discountSum ?? 0,
                discountTypeId: 1,
                customized: 'Y',
                supply: row.supply,
                measureCode,
                measureId: row.measureId ?? measureCode,
                sort: row.sort ?? index,
            };
        });
    }

    /** Код единицы для Битрикса: явный из запроса либо из портальной схемы. */
    private resolveMeasureCode(row: DealSendProductRowDto): string | undefined {
        if (row.measureCode !== undefined && row.measureCode !== null) {
            return String(row.measureCode);
        }
        if (!row.measureSemanticCode) {
            return undefined;
        }
        const portalMeasure = this.portalModel.getMeasureByCode(
            row.measureSemanticCode,
        );
        return portalMeasure?.bitrixId;
    }
}

/** Название поля из канона: при неоднозначном коде — по appType. */
const canonTitle = (field: DealSendFieldDto): string => {
    const entries = PBX_SALES_KONSTRUCTOR_FIELDS.filter(
        entry => entry.code === field.code,
    );
    const entry =
        entries.find(item => item.appType === field.appType) ?? entries[0];
    return entry?.name ?? field.code;
};

const isItemId = (value: unknown): boolean =>
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && /^\d+$/.test(value));

/**
 * Значение списочного поля — ID пункта, который есть у поля на портале.
 * Названия (строки не из цифр) и не списочные поля не проверяются. Пустой
 * список пунктов у списочного поля — тоже расхождение: портал не знает
 * ни одного пункта, Bitrix покажет «не выбрано».
 */
export const hasKnownListItem = (
    field: Pick<IField, 'type' | 'items' | 'bitrixfielditems'>,
    value: DealSendFieldDto['value'],
): boolean => {
    const items = field.items?.length
        ? field.items
        : (field.bitrixfielditems ?? []);
    const isList = field.type === 'enumeration' || items.length > 0;
    if (!isList) return true;
    const values: unknown[] = Array.isArray(value) ? value : [value];
    if (!values.every(isItemId)) return true;
    return values.every(id =>
        items.some(item => Number(item.bitrixId) === Number(id)),
    );
};

/** Коды канона, которым соответствует больше одного поля сделки. */
export const AMBIGUOUS_DEAL_FIELD_CODES: PbxSalesKonstructorFieldCode[] =
    PBX_SALES_KONSTRUCTOR_FIELDS.map(entry => entry.code).filter(
        (code, index, all) => all.indexOf(code) !== index,
    );
