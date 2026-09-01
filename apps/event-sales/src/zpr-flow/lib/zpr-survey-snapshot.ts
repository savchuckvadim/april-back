import {
    ZPR_SMART_SURVEY_MIRROR,
    ZprSmartFieldCode,
} from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    PresentationSurveyValues,
    presentationSurveyAnswersByCode,
} from '../../shared/presentation-survey';

/**
 * Снимок анкеты ЗПР: код поля смарта → готовое к записи значение.
 *
 * Зеркало {@link PresentationSurveySnapshot} — та же форма и та же
 * механика применения (`applySurvey` → `setUf` по `ufKeyByCode`), чтобы
 * два потока оставались близнецами и правились одинаково.
 *
 * Состав снимка назвал владелец: «Плановая дата покупки»
 * (`op_sale_date_prognoz` сделки/компании → `ZPR_SALE_DATE_PROGNOZ`,
 * 31.08) плюс СВОДКИ анкеты — «Хвост» и «Пять К» (01.09). Запланировали
 * ЗПР и в том же отчёте отчитались по презентации — собранный отчёт
 * обязан приехать в элемент ЗПР. Детализации по блокам здесь НЕТ
 * намеренно: она живёт в элементе презентации, а звонку по решению нужен
 * итог одной строкой. Карта — {@link ZPR_SMART_SURVEY_MIRROR}.
 *
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
    /** Сырая строка лида — фолбэк для сводок анкеты (у них компании нет). */
    lead?: Record<string, unknown> | null;
    /**
     * Ответы анкеты из payload ЭТОГО отчёта.
     *
     * Приоритетнее сущностей, и это не тонкость, а суть требования: снимок
     * собирается из строк, ПРОЧИТАННЫХ ДО записи батча, поэтому у клиента,
     * заполнившего анкету прямо сейчас, в сделке лежит ещё прошлая сводка.
     * Без payload элемент ЗПР унёс бы позапрошлый отчёт.
     */
    survey?: PresentationSurveyValues | null;
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
        lead: input.lead ?? null,
    };
    const fromPayload = input.survey
        ? presentationSurveyAnswersByCode(input.survey)
        : null;

    for (const entry of ZPR_SMART_SURVEY_MIRROR) {
        if (snapshot[entry.target]) continue;

        // Payload идёт ПЕРЕД сущностями: ответ этого отчёта точнее строки,
        // прочитанной до записи батча.
        const payloadValue = fromPayload?.get(entry.source)?.trim();
        if (payloadValue) {
            snapshot[entry.target] = payloadValue;
            continue;
        }

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
