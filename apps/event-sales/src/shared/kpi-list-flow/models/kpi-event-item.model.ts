import { Logger } from '@nestjs/common';
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
    private readonly logger = new Logger(KpiEventItemModel.name);

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
            if (!itemCode) {
                /*
                 * null — явная очистка (контракт KpiEventItemCodes): при
                 * upsert финала без неё стейл-значение (например, «недозвон»
                 * у результативного события) жило бы в записи вечно.
                 * undefined/'' — поле просто не трогаем.
                 */
                if (itemCode === null) {
                    const bitrixId = this.getFieldBitrixId(code);
                    if (bitrixId) target[bitrixId] = '';
                }
                return;
            }

            const bitrixId = this.getFieldBitrixId(code);
            if (!bitrixId) return;

            const itemBitrixId = this.getItemBitrixId(code, itemCode);
            if (itemBitrixId === undefined) {
                /*
                 * Поле на портале ЕСТЬ, а вариант — нет: значит items поля
                 * отстали от кода (например, ev_success/act_noresult_fail до
                 * install). Раньше значение молча выбрасывалось; теперь
                 * мягкая деградация видима — запись пишется без этого поля,
                 * а warning говорит, что нужен install items.
                 */
                this.logger.warn(
                    `item «${itemCode}» не найден в поле ${String(code)} ` +
                        `списка ${this.list.type} — значение пропущено ` +
                        `(нужен install items KPI-списка)`,
                );
                return;
            }

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
