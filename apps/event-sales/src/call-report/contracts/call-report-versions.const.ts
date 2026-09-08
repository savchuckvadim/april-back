import { createHash } from 'crypto';
import { AnalysisVersions } from '@lib/sales-ai-analytics';

/**
 * Версии разбора звонка — пререквизит трендов AI-аналитики ОП
 * (ai/tasks/ai-sales-analytics-plan.md §5.4).
 *
 * Ряд оценок сравним только внутри одной версии промпта, рубрики, реестра
 * типов, атрибуции менеджера и классификатора: любая содержательная правка
 * — разрыв ряда. Поэтому каждый новый разбор несёт все пять версий в
 * user_result (agent-analysis.versions), а витрина считает comparableFrom
 * как максимум дат разрывов.
 *
 * Поднимать при правках по существу (не при косметике):
 * - PROMPT — текст фокус-вызовов/синтеза, схема ответа;
 * - RUBRIC — состав разделов, шкала, формула взвешенной оценки;
 * - ATTRIBUTION — правило «чей звонок» (transcriptions.user_id);
 * - CLASSIFIER — приор CRM, пороги уверенности, уточнение синтезом.
 *
 * Тип AnalysisVersions — из @lib/sales-ai-analytics (там же comparableFrom).
 */

/**
 * Промпт фокус-разбора (три фокус-вызова + синтез).
 *
 * v2.2 — 08.09.2026, две правки по существу (разрыв ряда обязателен):
 * 1) НАШИ СОБСТВЕННЫЕ НАЗВАНИЯ: список организаций портала уходит в
 *    паспорт звонка, в промпты разбора и в проверку по регламенту явной
 *    формулировкой «это МЫ» — раньше партнёрское имя («Альфа-центр»)
 *    читалось как чужой бренд и СНИЖАЛО оценку звонка;
 * 2) ПРИЧИНА ОТКАЗА СЛОВАМИ КЛИЕНТА: новое поле refusalReason в схеме
 *    фокуса «движение сделки» и цельного разбора — основа сверки с полем
 *    причины отказа в карточке.
 * Обе правки меняют оценки, поэтому ряды до и после несравнимы.
 */
export const CALL_REPORT_PROMPT_VERSION = 'focus-v2.2-2026-09-08';
/** Рубрика: 7 разделов × relevance/score, взвешенная оценка 0–100. */
export const CALL_REPORT_RUBRIC_VERSION = 'sections-7-v1';
/** Атрибуция менеджера звонка — правило от 24.08.2026. */
export const CALL_REPORT_ATTRIBUTION_VERSION = '2026-08-24';
/** Классификатор типов: приор CRM + уточнение синтезом — 05.09.2026. */
export const CALL_REPORT_CLASSIFIER_VERSION = '2026-09-05';
/** Версия реестра, когда реестр типов домена недоступен. */
export const CALL_REPORT_REGISTRY_BUILTIN = 'builtin';

/** Длина короткого sha1 реестра (как короткий git-хэш). */
const REGISTRY_HASH_LENGTH = 12;

/**
 * Короткий sha1 от отсортированных кодов реестра типов домена: один и тот
 * же набор типов даёт одну версию независимо от порядка определения.
 */
export function buildRegistryHash(codes: readonly string[]): string {
    const sorted = [...codes].sort();
    return createHash('sha1')
        .update(sorted.join(','))
        .digest('hex')
        .slice(0, REGISTRY_HASH_LENGTH);
}

/** Пять версий текущего разбора; registryHash — от buildRegistryHash. */
export function buildAnalysisVersions(registryHash: string): AnalysisVersions {
    return {
        prompt: CALL_REPORT_PROMPT_VERSION,
        rubric: CALL_REPORT_RUBRIC_VERSION,
        registry: registryHash,
        attribution: CALL_REPORT_ATTRIBUTION_VERSION,
        classifier: CALL_REPORT_CLASSIFIER_VERSION,
    };
}
