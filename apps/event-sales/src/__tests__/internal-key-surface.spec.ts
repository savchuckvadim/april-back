import 'reflect-metadata';
import { isInternalKeyProtected } from '@lib/core/internal-key';
import { TranscriptionController } from '@lib/call-lib/transcription/transcription.controller';
import { BitrixTranscriptionController } from '@lib/call-lib/call-analysis/controllers/bitrix-transcription.controller';
import { CallAnalysisController } from '@lib/call-lib/call-analysis/controllers/call-analysis.controller';
import { CallReportAnalyticsController } from '@lib/call-lib/call-report-analytics/controllers/call-report-analytics.controller';
import { AiRagController } from '@lib/ai-rag/controllers/ai-rag.controller';
import { AiRagKnowledgeController } from '@lib/ai-rag/controllers/ai-rag-knowledge.controller';
import { BxDepartmentCacheController } from '@lib/bx-department/controllers/bx-department-cache.controller';
import { DealAuditController } from '../deal-audit/controllers/deal-audit.controller';
import { DuplicateReportController } from '../duplicate-report/controllers/duplicate-report.controller';

type ControllerClass = abstract new (...args: never[]) => object;

/**
 * Поверхность event-sales (api.event-sales.april-app.ru): ручки, которые
 * запускают платное распознавание, разбор моделью, массовые прогоны по
 * порталу или удаление, — под служебным ключом (`x-april-internal-key`):
 * в режиме APRIL_INTERNAL_GUARD_MODE=enforce без ключа 403, в report —
 * пропуск с записью в журнал.
 * Ручки CallReportController — в call-report/__tests__ (там и HTTP).
 *
 * Открытыми намеренно остаются события и роботы Битрикса: они ключ не
 * передают, закрыть их — сломать порталы.
 */
const CLOSED: readonly [ControllerClass, string][] = [
    // POST /transcription, GET /transcription/:taskId — Яндекс (платно)
    [TranscriptionController, 'startTranscription'],
    [TranscriptionController, 'getTranscriptionResult'],
    // POST/GET /transcription-bitrix — VibeCode
    [BitrixTranscriptionController, 'start'],
    [BitrixTranscriptionController, 'getResult'],
    // POST /call-analysis/deal|activity — распознавание + модель + задачи
    [CallAnalysisController, 'analyzeDeal'],
    [CallAnalysisController, 'analyzeActivity'],
    // POST /call-report/analytics/* — разборы портала и сброс кэша
    [CallReportAnalyticsController, 'summary'],
    [CallReportAnalyticsController, 'speech'],
    [CallReportAnalyticsController, 'objections'],
    [CallReportAnalyticsController, 'managers'],
    [CallReportAnalyticsController, 'resetCache'],
    // POST /ai-rag/resume|recomendation — модель
    [AiRagController, 'resume'],
    [AiRagController, 'recomendation'],
    // /ai-rag/knowledge — загрузка попадает в подсказки модели
    [AiRagKnowledgeController, 'listKinds'],
    [AiRagKnowledgeController, 'listDocuments'],
    [AiRagKnowledgeController, 'upload'],
    // POST /bx/department/cache/reset — без домена сносит кэш всех порталов
    [BxDepartmentCacheController, 'reset'],
    // POST /deal-audit/run|run-now — разметка сделок портала и сводки
    [DealAuditController, 'run'],
    [DealAuditController, 'runNow'],
    // POST /duplicate-report/run-now — задачи руководителям по порталу
    [DuplicateReportController, 'runNow'],
];

/** Вызываются Битриксом (событие задачи) — ключ не передаётся. */
const BITRIX_EVENTS: readonly [ControllerClass, string][] = [
    [CallAnalysisController, 'onTaskComplete'],
];

describe('event-sales: служебные ручки под служебным ключом', () => {
    it.each(
        CLOSED.map(
            ([controller, handler]) =>
                [controller.name, handler, controller] as const,
        ),
    )('%s.%s — под служебным ключом', (_name, handler, controller) => {
        expect(isInternalKeyProtected(controller, handler)).toBe(true);
    });

    it.each(
        BITRIX_EVENTS.map(
            ([controller, handler]) =>
                [controller.name, handler, controller] as const,
        ),
    )('%s.%s — событие Битрикса, без ключа', (_name, handler, controller) => {
        expect(isInternalKeyProtected(controller, handler)).toBe(false);
    });
});
