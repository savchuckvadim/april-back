/**
 * Поток «качество за период» (план §4.3): агрегат по корзинам и разделам
 * рубрики, усадка Normal-Normal к норме полосы, деление признаков на форму
 * и содержание, надёжность оценок (σ_llm, ICC, группы менеджеров без
 * рейтинга и поправка величины эффекта — `reliability` реэкспортирует
 * `reliability-correction`), а с добора волны 1 — потолки оценивания и
 * стоп-фразы правил `ai_analytics_scoring` и таблица применимости «тип
 * звонка × раздел рубрики».
 *
 * Собственный barrel потока — наружу подключается из libs/.../src/index.ts
 * интеграционным шагом (поток 19).
 */
export * from './quality-period';
export * from './section-shrink';
export * from './form-content.const';
export * from './reliability';
export * from './scoring-caps';
export * from './applicability';
