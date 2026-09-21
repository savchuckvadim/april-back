/**
 * Общие пороги и наборы кодов записи смарта «AI-анализ звонков» — вынесены
 * из writer'а: их делят сборка полей, деградация и таймлайн выброшенного.
 */

/** Байтовый порог «длинного» поля: длиннее — платит 768-байт префикс. */
export const CALL_REPORT_SMART_LONG_FIELD_BYTES = 700;

/**
 * Сколько байт строки элемента отдаём под ВСЕ тексты разом.
 * InnoDB даёт ~8126 байт на строку; часть съедают числа, enum'ы,
 * связи и служебные колонки — под тексты остаётся ~6.5к с запасом.
 */
export const CALL_REPORT_SMART_ROW_TEXT_BUDGET_BYTES = 6500;

/**
 * Коды текстовых полей, которые важнее всего оставить В ПОЛЯХ элемента
 * (для фильтров/списков); остальные длинные тексты при деградации
 * уезжают полным текстом в таймлайн.
 */
export const CALL_REPORT_SMART_PRIORITY_TEXT_CODES = [
    'SUMMARY',
    'SCORE_EXPLANATION',
    'RECOMMENDATIONS',
    'EMPLOYEE_RECOMMENDATIONS',
    'NEEDS',
    'PRODUCTS_OFFERED',
    'OBJECTIONS',
    'NEXT_STEP',
] as const;

/** Слоты полей TRANSCRIPT_N, по которым раскладывается транскрипт. */
export const CALL_REPORT_SMART_TRANSCRIPT_SLOTS = [1, 2, 3, 4] as const;

/** Размер части коммента таймлайна для длинных текстов (лимиты таймлайна). */
export const CALL_REPORT_SMART_COMMENT_PART_SIZE = 8000;

/**
 * Порядок выброшенных полей в таймлайне (порядок владельца 10.08.2026:
 * резюме GigaChat → рекомендации → остальное).
 */
export const CALL_REPORT_SMART_OVERFLOW_ORDER_CODES = [
    'RESUME_GIGACHAT',
    'RECOMENDATION_GIGACHAT',
    'SUMMARY',
    'SCORE_EXPLANATION',
    'RECOMMENDATIONS',
    'EMPLOYEE_RECOMMENDATIONS',
    'SPEECH_ANALYSIS',
] as const;
