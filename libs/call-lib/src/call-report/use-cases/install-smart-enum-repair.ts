import {
    EUserFieldType,
    IUserFieldConfig,
    IUserFieldConfigEnumerationItem,
} from '@/modules/bitrix';
import { CallReportSmartFieldDef } from '../config/call-report-smart.config';

/**
 * Долив значений перечисления у УЖЕ установленного enum-поля смарта
 * «AI-анализ звонков» — чистые функции для установщика.
 *
 * Установка идемпотентна по полям: существующее поле пропускается. Но
 * справочники растут (19.10.2026 — риск-флаг `door_closed`), и без долива
 * новое значение на старом портале не появлялось бы никогда: writer
 * пропускал бы код с предупреждением, а карточка молча теряла сигнал.
 *
 * Полезная нагрузка update ВСЕГДА несёт все существующие значения (с их
 * id) плюс недостающие: так она безопасна и при семантике «частичный
 * патч» (как у legacy `crm.*.userfield.update` с LIST), и при семантике
 * «полная замена списка». По документации userfieldconfig.update, чтобы
 * изменения enum применились, в field.userTypeId передаётся enumeration.
 */

/** Коды (xmlId) значений конфига, которых нет у поля на портале. */
export function missingEnumCodes(
    def: CallReportSmartFieldDef,
    field: IUserFieldConfig,
): string[] {
    if (def.type !== 'enumeration' || !def.items?.length) return [];
    const existing = new Set(
        (field.enum ?? []).map(item => item.xmlId).filter(Boolean),
    );
    return def.items.map(item => item.CODE).filter(code => !existing.has(code));
}

/**
 * Поле для userfieldconfig.update: существующие значения как есть (по id)
 * + недостающие из конфига. null — доливать нечего.
 */
export function buildEnumRepairField(
    def: CallReportSmartFieldDef,
    field: IUserFieldConfig,
): Partial<IUserFieldConfig> | null {
    const missing = missingEnumCodes(def, field);
    if (!missing.length) return null;
    const added: IUserFieldConfigEnumerationItem[] = (def.items ?? [])
        .filter(item => missing.includes(item.CODE))
        .map(item => ({
            value: item.VALUE,
            def: 'N' as const,
            sort: item.SORT,
            xmlId: item.CODE,
        }));
    return {
        userTypeId: EUserFieldType.ENUMERATION,
        enum: [...(field.enum ?? []), ...added],
    };
}
