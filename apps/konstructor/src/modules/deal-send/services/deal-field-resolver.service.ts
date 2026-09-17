import { IBXDeal, IBXProductRowRow } from '@lib/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
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
                skipped.push({ code: field.code, reason: 'inn_protected' });
                continue;
            }
            const lookup = this.resolveFieldId(field);
            if ('reason' in lookup) {
                skipped.push({ code: field.code, reason: lookup.reason });
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

/** Коды канона, которым соответствует больше одного поля сделки. */
export const AMBIGUOUS_DEAL_FIELD_CODES: PbxSalesKonstructorFieldCode[] =
    PBX_SALES_KONSTRUCTOR_FIELDS.map(entry => entry.code).filter(
        (code, index, all) => all.indexOf(code) !== index,
    );
