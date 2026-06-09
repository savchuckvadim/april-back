import { IPBXList } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { EnumOrkFieldCode } from '@lib/portal-lib/pbx/pbx-ork-history-bx-list';

/**
 * Резолвер полей списка ОРК-история. Сопоставляет коды полей (EnumOrkFieldCode)
 * с реальными `bitrixCamelId` (PROPERTY_*) и коды элементов перечислений — с их
 * `bitrixId`. Никаких магических строк: всё через коды enum'а.
 *
 * Коды полей в `EnumOrkFieldCode` уже полные (`service_ork_history_*` и т.п.),
 * поэтому ищем напрямую по `field.code`, не полагаясь на сборку `group_type_code`.
 */
export class OrkFieldResolver {
    constructor(private readonly list: IPBXList) {}

    /** `bitrixCamelId` (PROPERTY_<id>) поля по коду. */
    camelId(code: EnumOrkFieldCode): string | undefined {
        return this.field(code)?.bitrixCamelId;
    }

    /** `bitrixId` элемента перечисления по коду поля и коду элемента. */
    itemBitrixId(
        fieldCode: EnumOrkFieldCode,
        itemCode: string,
    ): number | string | undefined {
        const item = this.field(fieldCode)?.items?.find(
            i => i.code === itemCode,
        );
        return item?.bitrixId;
    }

    private field(code: EnumOrkFieldCode) {
        return this.list.bitrixfields?.find(f => f.code === (code as string));
    }
}
