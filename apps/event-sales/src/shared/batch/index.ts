/**
 * ЕДИНСТВЕННАЯ точка связи новых модулей с batch-буфером cold-hook.
 *
 * TODO(cold-refactor): когда буфер переедет из cold-hook в shared при
 * рефакторинге cold — заменить источник в этой строке, потребители не правятся.
 *
 * ВНИМАНИЕ: этот файл НЕ реэкспортируется из бочки `../index.ts` — бочка
 * импортируется из cold-hook (prepare-batch-results в pre-cold-entities),
 * и реэкспорт создал бы цикл shared → cold-hook → shared. Импортировать
 * только глубоким путём `@/…/shared/batch`.
 */
export { ColdHookBatchGroupBuffer as SalesBatchGroupBuffer } from '../../cold-hook/services/batch/cold-hook-batch-group-buffer';
export * from './batch-group-buffer.interface';
