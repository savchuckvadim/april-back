import { IBXRequisitePreset } from '@/modules/bitrix';
import type { RqPresetTemplate } from '@/apps/rq/install';

/** По какому правилу пресет сматчился с Bitrix (для логов/диагностики). */
export type RqPresetMatchRule = 'db-id' | 'xml-id' | 'name';

export interface RqPresetMatch {
    preset: IBXRequisitePreset;
    rule: RqPresetMatchRule;
}

/**
 * Единый матчер эталонного пресета с пресетами Bitrix — используется и в
 * install-синхронизации, и в мониторинге, чтобы они никогда не расходились.
 *
 * Порядок:
 * 1. Сохранённый в `bx_rqs` bitrix_id (ручная/прежняя привязка авторитетна).
 * 2. XML_ID — Bitrix не всегда сохраняет кастомный XML_ID у пресетов
 *    реквизитов, поэтому этого правила недостаточно.
 * 3. Имя (+ ENTITY_TYPE_ID/COUNTRY_ID): подхватываем уже существующие в
 *    портале пресеты («Организация»/«ИП»/«Физ. лицо») вместо создания дублей;
 *    при нескольких тёзках предпочитаем `defaultBitrixId`, иначе минимальный ID.
 *
 * Всюду `Number()` — Bitrix возвращает числа строками.
 */
export function matchBitrixPreset(
    presets: IBXRequisitePreset[],
    tpl: Pick<
        RqPresetTemplate,
        'xmlId' | 'name' | 'entityTypeId' | 'countryId' | 'defaultBitrixId'
    >,
    dbBitrixId: number | null,
): RqPresetMatch | null {
    if (dbBitrixId != null) {
        const byDbId = presets.find(p => Number(p.ID) === dbBitrixId);
        if (byDbId) {
            return { preset: byDbId, rule: 'db-id' };
        }
    }

    const byXmlId = presets.find(p => p.XML_ID === tpl.xmlId);
    if (byXmlId) {
        return { preset: byXmlId, rule: 'xml-id' };
    }

    const sameName = presets.filter(
        p =>
            Number(p.ENTITY_TYPE_ID) === tpl.entityTypeId &&
            Number(p.COUNTRY_ID) === tpl.countryId &&
            String(p.NAME ?? '').trim() === tpl.name.trim(),
    );
    if (sameName.length > 0) {
        const byName =
            sameName.find(p => Number(p.ID) === tpl.defaultBitrixId) ??
            sameName.reduce((min, p) =>
                Number(p.ID) < Number(min.ID) ? p : min,
            );
        return { preset: byName, rule: 'name' };
    }

    return null;
}
