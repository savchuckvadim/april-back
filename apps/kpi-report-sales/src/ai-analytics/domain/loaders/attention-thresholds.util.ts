/**
 * Пороги сигналов «Внимания» из настроек портала переехали в
 * @lib/sales-ai-analytics (settings/attention-thresholds.ts, 17.11.2026):
 * те же пороги нужны итогам периода по менеджерам в event-sales.
 * Реэкспорт — чтобы импорты обзора не менялись.
 */
export {
    attentionThresholdsOf,
    defaultAttentionThresholds,
} from '@lib/sales-ai-analytics';
