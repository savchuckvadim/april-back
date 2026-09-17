/**
 * Библиотека ИНН: единственный писатель `op_inn` / `op_inn_pool` и сборка
 * карточки ИНН сделки для фрейма.
 *
 * Постановка — `ai/tasks/2026-09-17-inn-strategy.md`. Всем остальным запись
 * в эти два поля запрещена: пул только пополняется, решение принимает
 * человек, автоматика имеет право поставить ИНН сама лишь когда кандидат
 * ровно один и он не «слабый».
 */
export * from './type/inn.type';
export * from './lib/inn-row.util';
export * from './lib/inn-fields';
export * from './lib/inn-observe.util';
export * from './lib/inn-candidate.util';
export * from './lib/inn-audit.codec';
export * from './lib/inn-version.util';
export * from './lib/inn-snapshot.composer';
export * from './lib/inn.errors';
export * from './services/inn-pool.service';
export * from './services/inn-requisite.reader';
export * from './services/inn-audit.reader';
export * from './services/inn-deal-state.reader';
export * from './services/inn-deal.service';
