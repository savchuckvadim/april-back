import {
    ZPR_SMART_SURVEY_MIRROR,
    ZprSmartFieldCode,
} from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';

/**
 * Снимок анкеты ЗПР: код поля смарта → готовое к записи значение.
 *
 * Зеркало {@link PresentationSurveySnapshot} — та же форма и та же
 * механика применения (`applySurvey` → `setUf` по `ufKeyByCode`), чтобы
 * два потока оставались близнецами и правились одинаково.
 *
 * Состав снимка назвал владелец (31.08): пока это ОДНО поле — «Плановая
 * дата покупки» (`op_sale_date_prognoz` сделки/компании →
 * `ZPR_SALE_DATE_PROGNOZ`), карта — {@link ZPR_SMART_SURVEY_MIRROR}.
 * Ответы ПОРТАЛЬНОЙ анкеты в элемент ЗПР при этом едут отдельным полем
 * `answers` — у него другой ключ (UF-имя произвольного поля портала) и
 * другое происхождение.
 */
export type ZprSurveySnapshot = Partial<Record<ZprSmartFieldCode, string>>;

export interface ZprSurveyInput {
    portal: PortalModel;
    /** Сырая строка БАЗОВОЙ сделки контекста (значение-истина точнее). */
    baseDeal: Record<string, unknown> | null;
    /** Сырая строка компании — фолбэк, когда на сделке пусто/сделки нет. */
    company: Record<string, unknown> | null;
}

/**
 * Снимок клиента для элемента ЗПР по карте {@link ZPR_SMART_SURVEY_MIRROR}.
 *
 * Читаем УЖЕ ЗАГРУЖЕННЫЕ сущности контекста — ни одного лишнего вызова
 * Bitrix (зеркало buildPresentationSurveySnapshot). Порядок записей карты
 * на один target — порядок фолбэка: первое непустое значение побеждает.
 * Пустые значения не переносятся; поле не установлено на портале — молча
 * пропускается (мягкая деградация, как во всём event-report).
 */
export function buildZprSurveySnapshot(
    input: ZprSurveyInput,
): ZprSurveySnapshot {
    const snapshot: ZprSurveySnapshot = {};
    const rows: Record<
        'deal' | 'company' | 'lead',
        Record<string, unknown> | null
    > = {
        deal: input.baseDeal,
        company: input.company,
        lead: null,
    };

    for (const entry of ZPR_SMART_SURVEY_MIRROR) {
        if (snapshot[entry.target]) continue;
        const row = rows[entry.from];
        if (!row) continue;
        const field = input.portal.getEntityFieldByCode(
            entry.from,
            entry.source,
        );
        if (!field) continue;
        const raw = row[input.portal.getFieldBitrixId(field)];
        const value = typeof raw === 'string' ? raw.trim() : '';
        if (!value) continue;
        snapshot[entry.target] = value;
    }

    return snapshot;
}
