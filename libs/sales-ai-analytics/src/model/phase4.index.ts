/**
 * Публичный API математики Фазы 4 (план ai-sales-analytics-phase4-plan.md):
 * прогноз отдела, пул порталов, эффект советов и связь качества с
 * результатом. Реэкспортируется из барреля библиотеки одной строкой.
 */
// Фаза 4, поток П16 «прогноз»: вилка NegBin, деньги по логнормальному чеку,
// усадка таблицы лага, сезонный индекс и rolling-origin бэктест (гейт L4).
export * from './negbin';
export * from './forecast-interval';
export * from './lognormal-check';
export * from './lag-cdf-shrink';
export * from './season-index';
export * from './forecast-backtest.types';
export * from './forecast-backtest';

// Фаза 4, поток П17 «пул порталов»: β пула (Q Кокрана, I², τ²), нормы μ₀/κ̄,
// общая таблица лага, чек и сезон — только по датированному согласию.
export * from './pool.types';
export * from './pool-beta';
export * from './pool-norms';
export * from './pool-lag';
export * from './pool';

// Фаза 4, поток П18 «эффект советов»: ключ совета, доля выполненных и
// до/после по рёбрам с интервалами (гейт L5).
export * from './lever-key.util';
export * from './recommendation-effect.types';
export * from './recommendation-effect';

// Фаза 4, поток П15 «связь качества с результатом»: ближний исход звонка-
// триггера, выборка, пенализованный логит (Мундлак + pooled), калибровка,
// плацебо, гейт с гистерезисом и кривая p̂(S) для режима «по данным».
export * from './near-outcome';
export * from './beta-sample';
export * from './beta-irls';
export * from './beta-fit';
export * from './beta-calibration';
export * from './beta-gate';
export * from './beta-curve';
