/**
 * Части многослойного разбора звонка, которые могут не собраться: четыре
 * фокус-прохода, синтез итоговой картины и проход методики. Список
 * несобравшихся частей едет в разборе полем `incompleteParts` — по нему
 * догон (call-analysis-repair) находит неполные разборы и переделывает их,
 * когда поставщик модели снова отвечает (требование владельца 10.11.2026:
 * «если упало, потом должно восстановиться»).
 *
 * С focus-v3.3 (17.11.2026) проход «движение сделки» разделён на два:
 * `movement` — «возражения и цена», `closing` — «закрытие и следующий шаг».
 */
export const CALL_ANALYSIS_PARTS = [
    'form',
    'content',
    'movement',
    'closing',
    'synthesis',
    'methodology',
] as const;

export type CallAnalysisPart = (typeof CALL_ANALYSIS_PARTS)[number];

/** Четыре фокус-прохода: их не было, когда записан цельный разбор-страховка. */
export const CALL_ANALYSIS_FOCUS_PARTS: readonly CallAnalysisPart[] = [
    'form',
    'content',
    'movement',
    'closing',
];

/** Русские названия частей — для журнала и тревог. */
export const CALL_ANALYSIS_PART_TITLES: Record<CallAnalysisPart, string> = {
    form: 'форма разговора',
    content: 'содержание продажи',
    movement: 'возражения и цена',
    closing: 'закрытие и следующий шаг',
    synthesis: 'итоговая оценка',
    methodology: 'методика',
};
