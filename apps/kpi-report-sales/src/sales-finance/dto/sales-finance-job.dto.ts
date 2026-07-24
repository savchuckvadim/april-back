import { SalesHotThreshold } from '../constants/sales-finance.const';
import { ClosedSalesFiltersDto } from './closed-sales-request.dto';

/**
 * Payload'ы Bull-джобов модуля sales-finance (внутренний контракт
 * контроллер → процессор, валидаторы не нужны).
 */

export interface ClosedSalesJobData {
    domain: string;
    socketId?: string;
    forceRefresh: boolean;
    filters: ClosedSalesFiltersDto;
}

export interface HotClientsJobData {
    domain: string;
    socketId?: string;
    forceRefresh: boolean;
    threshold: SalesHotThreshold;
    assignedIds?: number[];
}
