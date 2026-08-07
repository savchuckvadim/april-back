import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IBatchGroupBuffer } from '../../../shared/batch/batch-group-buffer.interface';
import { EnumSalesHookCode } from '../constants/sales-hook-code.enum';
import { EnumSalesHookSource } from './sales-hook-job.type';

/**
 * Контекст выполнения одной операции хука. Инстансы bitrix/portal создаёт
 * runner через PBXService.init(domain) — use-case их НЕ хранит в полях
 * (правило CLAUDE.md про race condition), только использует в рамках вызова.
 */
export interface SalesHookExecutionContext {
    domain: string;
    hook: EnumSalesHookCode;
    source: EnumSalesHookSource;
    operationId: string;
    initiatorUserId?: number;
    bitrix: BitrixService;
    portal: PortalModel;
    /**
     * Групповой batch-буфер: use-case только queue-ит команды группами и
     * зовёт endGroup(); финальный flush() делает runner.
     */
    buffer: IBatchGroupBuffer;
}

/**
 * Контракт доменного use-case хука.
 *
 * ОБЯЗАТЕЛЬНОЕ ТРЕБОВАНИЕ — доменная идемпотентность: кэш-слои каркаса
 * (operationId, fingerprint, lock) могут потерять состояние, поэтому
 * use-case перед записью сам перечитывает состояние в Битриксе и при
 * совпадении возвращает результат с пометкой «пропущено», а не пишет второй раз.
 */
export interface ISalesHookUseCase<TItem = unknown, TResult = unknown> {
    readonly hook: EnumSalesHookCode;
    /** Одна пачка: кнопка = 1 элемент, робот = N после окна тишины. */
    execute(ctx: SalesHookExecutionContext, items: TItem[]): Promise<TResult>;
}
