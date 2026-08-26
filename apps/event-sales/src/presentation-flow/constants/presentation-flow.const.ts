/**
 * WS-события сайд-очереди презентаций.
 *
 * Доставка — ТОЧЕЧНО в socketId клиента, поставившего отчёт (тот же
 * механизм, что EVENT_FLOW_WS_EVENTS и ZPR_FLOW_WS_EVENTS): никаких комнат
 * и никакой адресации по userId — id юзера уникален только в рамках
 * портала, и общий канал утёк бы между порталами.
 */
export const PRESENTATION_FLOW_WS_EVENTS = {
    DONE: 'presentation-flow:done',
} as const;

/**
 * Что сделал джоб:
 *  - `created` — создан элемент под план;
 *  - `closed` — открытый элемент закрыт исходом (проведена/не состоялась/отказ);
 *  - `moved` — открытый элемент уехал в «Перенос» и остался живым;
 *  - `spontaneous` — плана не было, факт зафиксирован сразу закрытым;
 *  - `skipped` — смарт не установлен (self-gate).
 */
export type PresentationFlowAction =
    | 'created'
    | 'closed'
    | 'moved'
    | 'spontaneous'
    | 'skipped';

export interface PresentationFlowResult {
    action: PresentationFlowAction;
    elementId: number | null;
}

/** Payload события DONE — фронту хватает, чтобы перечитать презентации. */
export interface PresentationFlowDonePayload extends PresentationFlowResult {
    domain: string;
    operationId?: string;
    kind: 'plan' | 'report';
}
