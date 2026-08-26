import { EventSalesFlowDto } from './event-sale-flow/event-sales-flow.dto';

/** Данные job'а отправки отчёта: сам flow-DTO + адрес доставки результата. */
export interface EventFlowJobData {
    operationId: string;
    domain: string;
    /** Куда пушить готовый результат; пусто — клиент дойдёт поллингом. */
    socketId?: string;
    dto: EventSalesFlowDto;
    /**
     * Сколько раз джоб перекладывали из-за занятого слота (тот же клиент
     * обрабатывается прямо сейчас либо домен выбрал свой лимит). Счётчик —
     * защита от вечной перекладки: см. EventFlowProcessor.
     */
    slotRetries?: number;
}
