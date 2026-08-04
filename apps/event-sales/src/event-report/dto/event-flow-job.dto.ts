import { EventSalesFlowDto } from './event-sale-flow/event-sales-flow.dto';

/** Данные job'а отправки отчёта: сам flow-DTO + адрес доставки результата. */
export interface EventFlowJobData {
    operationId: string;
    domain: string;
    /** Куда пушить готовый результат; пусто — клиент дойдёт поллингом. */
    socketId?: string;
    dto: EventSalesFlowDto;
}
