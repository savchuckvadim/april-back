/**
 * Публичный барьер норм (план §4.2): экспозиция менеджер-месяца, сила
 * усадки κ, иерархия leave-one-out, апостериоры рёбер/темпов с тестом
 * разрыва, сверхдисперсия φ квази-Пуассона и усадка темпа активности с
 * забыванием по разрывам (волна 1, добор). Подключается в src/index.ts
 * интеграционным шагом (поток 19).
 */
export * from './exposure';
export * from './kappa';
export * from './norms-hierarchy';
export * from './edge-rate';
export * from './overdispersion';
export * from './activity-rate';
