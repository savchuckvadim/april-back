/**
 * Барель трендов рядов менеджера (план Фазы 3, поток П1): типы и
 * дефолты, нормализация ряда, EWMA и дрейф, CUSUM и сдвиг уровня,
 * циркулярная блочная калибровка порогов и сборка сигналов ряда.
 * Наружу подключается из `src/index.ts` именованными экспортами.
 */
export * from './trend.types';
export * from './trend-defaults';
export * from './trend-series';
export * from './ewma';
export * from './cusum';
export * from './block-permutation';
export * from './trend-signals';
export * from './same-period';
