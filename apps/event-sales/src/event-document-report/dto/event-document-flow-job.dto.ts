import { SalesDocumentEventJobData } from '@lib/queue';

/**
 * Данные джоба потока документов: событие из конструктора и служебный
 * счётчик перекладываний (слот клиента был занят).
 */
export interface EventDocumentFlowJobData extends SalesDocumentEventJobData {
    /** Сколько раз джоб уже перекладывали в ожидании слота. */
    readonly slotRetries?: number;
}
