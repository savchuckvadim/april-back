/**
 * Части многослойного разбора звонка, которые могут не собраться: три
 * фокус-прохода, синтез итоговой картины и проход методики. Список
 * несобравшихся частей едет в разборе полем `incompleteParts` — по нему
 * догон (call-analysis-repair) находит неполные разборы и переделывает их,
 * когда поставщик модели снова отвечает (требование владельца 10.11.2026:
 * «если упало, потом должно восстановиться»).
 */
export const CALL_ANALYSIS_PARTS = [
    'form',
    'content',
    'movement',
    'synthesis',
    'methodology',
] as const;

export type CallAnalysisPart = (typeof CALL_ANALYSIS_PARTS)[number];

/** Три фокус-прохода: их не было, когда записан цельный разбор-страховка. */
export const CALL_ANALYSIS_FOCUS_PARTS: readonly CallAnalysisPart[] = [
    'form',
    'content',
    'movement',
];

/** Русские названия частей — для журнала и тревог. */
export const CALL_ANALYSIS_PART_TITLES: Record<CallAnalysisPart, string> = {
    form: 'форма разговора',
    content: 'содержание продажи',
    movement: 'движение сделки',
    synthesis: 'итоговая оценка',
    methodology: 'методика',
};
