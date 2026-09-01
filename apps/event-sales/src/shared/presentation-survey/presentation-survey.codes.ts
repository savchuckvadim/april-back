import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';

/**
 * Максимальная длина ОДНОГО ответа анкеты. Значения длиннее не отклоняются,
 * а обрезаются: ни легаси-ручка, ни отчёт не имеют права упасть из-за
 * длинного ответа менеджера.
 *
 * Переделка 01.09.2026 подняла потолок: теперь в одном поле лежит целый блок
 * — пронумерованные вопросы плюс ответы между ними, — и прежних пяти тысяч
 * на четыре вопроса с развёрнутыми ответами может не хватить.
 */
export const PRESENTATION_SURVEY_VALUE_MAX_LENGTH = 10000;

/**
 * ЖЁСТКИЙ whitelist пяти блоков «5К». Ключи вне списка молча отбрасываются:
 * ни ручка, ни поток ФИЗИЧЕСКИ не могут записать по анкете чужое поле, что
 * бы ни прислал клиент.
 *
 * Было девять полей по одному вопросу, стало пять по теме — подвопросы
 * живут внутри значения текстом (`presentation-survey.templates.ts`).
 */
export const PRESENTATION_SURVEY_FIVE_K_CODES = [
    PBX_SALES_EVENT_FIELD_CODES.op_5k_client,
    PBX_SALES_EVENT_FIELD_CODES.op_5k_company,
    PBX_SALES_EVENT_FIELD_CODES.op_5k_colleagues,
    PBX_SALES_EVENT_FIELD_CODES.op_5k_competitor,
    PBX_SALES_EVENT_FIELD_CODES.op_5k_criteria,
] as const;

/**
 * Тот же жёсткий whitelist для пяти блоков «Хвоста».
 *
 * Заменил шесть полей `op_talk_*` (по одному вопросу в каждом) и три галочки
 * `op_xvost_is_*`: галочки стали частью связного текста «ЧТО ПРЕДЛОЖИЛИ», то
 * есть сменился и смысл, и тип. Дата звонка по решению сюда не входит — она
 * отдельное поле типа «дата», а не текст с вопросами.
 */
export const PRESENTATION_SURVEY_XVOST_CODES = [
    PBX_SALES_EVENT_FIELD_CODES.op_xvost_desire,
    PBX_SALES_EVENT_FIELD_CODES.op_xvost_offered,
    PBX_SALES_EVENT_FIELD_CODES.op_xvost_price_reaction,
    PBX_SALES_EVENT_FIELD_CODES.op_xvost_decision_process,
    PBX_SALES_EVENT_FIELD_CODES.op_xvost_decision_way,
] as const;

/** Сводные поля анкеты — единственные, что пишутся ещё и в компанию. */
export const PRESENTATION_SURVEY_SUMMARY_CODES = {
    xvost: PBX_SALES_EVENT_FIELD_CODES.op_presentation_xvost,
    fiveKSummary: PBX_SALES_EVENT_FIELD_CODES.op_presentation_5k,
} as const;

/**
 * ВЕСЬ состав анкеты одним списком: сводные, «Хвост», «5К».
 *
 * Единственный источник истины по кодам анкеты для ВСЕХ писателей —
 * легаси-ручки `/event-sales/presentation-survey` и основного потока
 * event-report (payload отчёта, перенос «лид → сделки»). Разъехавшиеся
 * копии этого списка и были тем классом ошибок, ради которого анкету
 * увели в payload отчёта: поле, забытое в одном из списков, молча
 * переставало доезжать до карточки.
 */
export const PRESENTATION_SURVEY_CODES = [
    PRESENTATION_SURVEY_SUMMARY_CODES.xvost,
    PRESENTATION_SURVEY_SUMMARY_CODES.fiveKSummary,
    ...PRESENTATION_SURVEY_XVOST_CODES,
    ...PRESENTATION_SURVEY_FIVE_K_CODES,
] as const;
