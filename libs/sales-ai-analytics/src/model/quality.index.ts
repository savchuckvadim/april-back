/**
 * Поток «качество за период» (план §4.3): агрегат по корзинам и разделам
 * рубрики, усадка Normal-Normal к норме полосы, деление признаков на форму
 * и содержание, надёжность оценок и группы менеджеров без рейтинга.
 *
 * Собственный barrel потока — наружу подключается из libs/.../src/index.ts
 * интеграционным шагом.
 */
export * from './quality-period';
export * from './section-shrink';
export * from './form-content.const';
export * from './reliability';
