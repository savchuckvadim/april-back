/**
 * Факты качества по звонкам менеджера переехали в @lib/sales-ai-analytics
 * (model/quality-facts.assembler.ts, 17.11.2026): те же факты нужны итогам
 * периода по менеджерам в event-sales. Реэкспорт — чтобы импорты обзора не
 * менялись.
 */
export {
    assembleQualityFacts,
    emptyQualityFacts,
    sectionMeansOf,
} from '@lib/sales-ai-analytics';
