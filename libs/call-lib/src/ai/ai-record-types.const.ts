/**
 * Типы ais-записей контура AI-аналитики звонков — ЕДИНЫЙ источник правды
 * (раньше константы дублировались в pipeline, agent-gate и отчётах).
 *
 * По transcription_id одного звонка в ais копятся:
 * - CALL_CLASSIFY_TYPE — дешёвая классификация типа звонка (tier-1);
 * - CALL_RESUME_TYPE / CALL_RECOMENDATION_TYPE — первичный RAG-анализ;
 * - AGENT_ANALYSIS_TYPE — глубокий анализ ночного агента (tier-3).
 */
export const CALL_CLASSIFY_TYPE = 'call-classify';
export const CALL_RESUME_TYPE = 'call-resume';
export const CALL_RECOMENDATION_TYPE = 'call-recomendation';
export const AGENT_ANALYSIS_TYPE = 'agent-analysis';
/** Повторный разбор того же звонка для test-retest оценщика (Фаза 3, П7); в смарт не пишется. */
export const AGENT_ANALYSIS_RETEST_TYPE = 'agent-analysis-retest';
/**
 * Проверка звонка по документам компании (Фаза 3 плана
 * ai/tasks/rag-driven-analysis-plan.md). Запись служит и результатом,
 * и маркером идемпотентности: есть запись — проверка уже выполнена.
 */
export const CALL_COMPLIANCE_REVIEW_TYPE = 'call-compliance-review';
/**
 * Сверка ПРИЧИНЫ ОТКАЗА: закрытие сделки финалом отказа против полей
 * причины отказа в карточке и записях отчётности (решение владельца
 * 08.09.2026). Запись служит и вердиктом, и маркером идемпотентности.
 */
export const CALL_REFUSAL_AUDIT_TYPE = 'call-refusal-audit';
