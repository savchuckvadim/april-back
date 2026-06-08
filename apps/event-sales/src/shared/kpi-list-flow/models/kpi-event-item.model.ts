import { IPBXList } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    KpiEventItemCodes,
    KpiEventPayload,
    KpiEventScalarValues,
} from '../type/kpi-event-payload.type';
import { IBXListItemFields } from '@/modules/bitrix/domain/list-item/interface/bx-list-item.interface';

/**
 * Data-only модель одного KPI/History элемента: по `IPBXList` (с
 * `bitrixfields`) и логическому payload собирает финальный набор `FIELDS`
 * для `lists.element.add`.
 *
 * Не дергает Bitrix и не зависит от него — только маппинг кодов в bitrixId.
 *
 * - Префикс полей вычисляется как `${list.group}_${list.type}` — KPI и History
 *   используют одну и ту же модель, но разный префикс.
 * - Для перечислений (`items`) ищется `bitrixId` в `field.items[code]`.
 * - Если на портале нет такого поля или item — оно тихо пропускается
 *   (исторический контракт PHP-аналога; иначе пришлось бы валидировать схемы
 *   двух конкретных списков на каждый портал).
 */
export class KpiEventItemModel {
    constructor(
        private readonly list: IPBXList,
        private readonly payload: KpiEventPayload,
    ) {}

    toFields(): IBXListItemFields {
        // Record<string, unknown> {
        const result: IBXListItemFields = { NAME: this.payload.name };

        this.appendScalars(result, this.payload.values);
        this.appendItems(result, this.payload.items);

        return result;
    }

    private appendScalars(
        target: Record<string, unknown>,
        values: KpiEventScalarValues,
    ): void {
        (Object.keys(values) as (keyof KpiEventScalarValues)[]).forEach(
            code => {
                const value = values[code];
                if (value === undefined || value === null) return;

                const bitrixId = this.getFieldBitrixId(code);
                if (!bitrixId) return;

                target[bitrixId] = value;
            },
        );
    }

    private appendItems(
        target: Record<string, unknown>,
        items: KpiEventItemCodes,
    ): void {
        (Object.keys(items) as (keyof KpiEventItemCodes)[]).forEach(code => {
            const itemCode = items[code];
            if (!itemCode) return;

            const bitrixId = this.getFieldBitrixId(code);
            if (!bitrixId) return;

            const itemBitrixId = this.getItemBitrixId(code, itemCode);
            if (itemBitrixId === undefined) return;

            target[bitrixId] = itemBitrixId;
        });
    }

    private getFieldBitrixId(code: string): string | undefined {
        const field = this.findListField(code);
        return field?.bitrixCamelId || undefined;
    }

    private getItemBitrixId(
        fieldCode: string,
        itemCode: string,
    ): number | string | undefined {
        const field = this.findListField(fieldCode);
        if (!field?.items) return undefined;
        return field.items.find(item => item.code === itemCode)?.bitrixId;
    }

    private findListField(code: string) {
        const fullCode = `${this.list.group}_${this.list.type}_${code}`;
        return this.list.bitrixfields?.find(field => field.code === fullCode);
    }
}
