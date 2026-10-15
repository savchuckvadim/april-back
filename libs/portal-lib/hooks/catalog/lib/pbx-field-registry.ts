import { PBX_SALES_EVENT_FIELDS } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import { PBX_SALES_KONSTRUCTOR_FIELDS } from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';

/** Сводное описание PBX-поля для каталога: имя и тип из реестров. */
export interface PbxFieldInfo {
    code: string;
    name: string;
    type: string;
}

/**
 * Поля, на которые могут ссылаться хуки: реестр событий продаж
 * (`PBX_SALES_EVENT_FIELDS`) плюс реестр конструктора
 * (`PBX_SALES_KONSTRUCTOR_FIELDS` — там живут `op_inn`, `op_inn_pool`).
 * Первое вхождение кода выигрывает — реестры не пересекаются по смыслу.
 */
export const PBX_FIELD_REGISTRY: ReadonlyMap<string, PbxFieldInfo> = (() => {
    const map = new Map<string, PbxFieldInfo>();
    const sources: ReadonlyArray<
        ReadonlyArray<{ code: string; name: string; type: string }>
    > = [PBX_SALES_EVENT_FIELDS, PBX_SALES_KONSTRUCTOR_FIELDS];
    for (const source of sources) {
        for (const field of source) {
            if (!map.has(field.code)) {
                map.set(field.code, {
                    code: field.code,
                    name: field.name,
                    type: field.type,
                });
            }
        }
    }
    return map;
})();

export function findPbxField(code: string): PbxFieldInfo | null {
    return PBX_FIELD_REGISTRY.get(code) ?? null;
}

/** Человеческое название PBX-поля из реестров; нет в реестрах — код. */
export function pbxFieldName(code: string): string {
    return PBX_FIELD_REGISTRY.get(code)?.name ?? code;
}

export function pbxFieldType(code: string): string {
    return PBX_FIELD_REGISTRY.get(code)?.type ?? '';
}
