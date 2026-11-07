import type { OwnerReportText } from '@lib/sales-ai-analytics';

/**
 * Порт модели для текста отчёта собственнику (луковая архитектура:
 * use-case знает порт, не провайдера). Реализация — адаптер над шлюзом
 * `StructuredLlmGateway`; подменяется в тестах.
 */

export interface OwnerReportNarrativeResult {
    /** Ответ модели по схеме OWNER_REPORT_NARRATIVE_SCHEMA; форму проверяет applyNarrative. */
    payload: unknown;
    provider: string | null;
    model: string | null;
    tokens: number | null;
}

export interface OwnerReportNarrativePort {
    complete(
        domain: string,
        text: OwnerReportText,
    ): Promise<OwnerReportNarrativeResult>;
}

/** DI-токен порта: провайдер регистрируется по нему в модуле среза. */
export const AI_OWNER_REPORT_NARRATIVE_PORT =
    'AI_OWNER_REPORT_NARRATIVE_PORT' as const;
