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
