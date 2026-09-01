import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';

/**
 * Максимальная длина ОДНОГО ответа анкеты. Значения длиннее не отклоняются,
 * а обрезаются: ни легаси-ручка, ни отчёт не имеют права упасть из-за
 * длинного ответа менеджера.
 */
export const PRESENTATION_SURVEY_VALUE_MAX_LENGTH = 5000;

/**
 * ЖЁСТКИЙ whitelist девяти детальных ответов «5К». Ключи вне списка молча
 * отбрасываются: ни ручка, ни поток ФИЗИЧЕСКИ не могут записать по анкете
 * чужое поле, что бы ни прислал клиент.
 */
export const PRESENTATION_SURVEY_FIVE_K_CODES = [
    PBX_SALES_EVENT_FIELD_CODES.op_5k_client_what,
    PBX_SALES_EVENT_FIELD_CODES.op_5k_client_ready,
    PBX_SALES_EVENT_FIELD_CODES.op_5k_client_price,
    PBX_SALES_EVENT_FIELD_CODES.op_5k_company_who,
    PBX_SALES_EVENT_FIELD_CODES.op_5k_company_how,
    PBX_SALES_EVENT_FIELD_CODES.op_5k_company_right,
    PBX_SALES_EVENT_FIELD_CODES.op_5k_command,
    PBX_SALES_EVENT_FIELD_CODES.op_5k_concurent,
    PBX_SALES_EVENT_FIELD_CODES.op_5k_criteri,
] as const;

/**
 * Тот же жёсткий whitelist для шести вопросов «Разговора» (op_talk_*).
 * Без них ответы «Разговора» жили только строкой в комментарии: фрейм слал
 * их кодами опросника (xo_*), которых нет ни в одном реестре.
 */
export const PRESENTATION_SURVEY_TALK_CODES = [
    PBX_SALES_EVENT_FIELD_CODES.op_talk_impression,
    PBX_SALES_EVENT_FIELD_CODES.op_talk_remembered,
    PBX_SALES_EVENT_FIELD_CODES.op_talk_desire,
    PBX_SALES_EVENT_FIELD_CODES.op_talk_decision_process,
    PBX_SALES_EVENT_FIELD_CODES.op_talk_price_opinion,
    PBX_SALES_EVENT_FIELD_CODES.op_talk_boss_readiness,
] as const;

/** Сводные поля анкеты — единственные, что пишутся ещё и в компанию. */
export const PRESENTATION_SURVEY_SUMMARY_CODES = {
    xvost: PBX_SALES_EVENT_FIELD_CODES.op_presentation_xvost,
    fiveKSummary: PBX_SALES_EVENT_FIELD_CODES.op_presentation_5k,
} as const;

/**
 * ВЕСЬ состав анкеты одним списком: сводные, «Разговор», детальные «5К».
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
    ...PRESENTATION_SURVEY_TALK_CODES,
    ...PRESENTATION_SURVEY_FIVE_K_CODES,
] as const;
