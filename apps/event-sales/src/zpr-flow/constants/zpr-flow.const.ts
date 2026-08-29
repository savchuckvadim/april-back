/**
 * WS-события сайд-очереди ЗПР.
 *
 * Доставка — ТОЧЕЧНО в socketId клиента, поставившего отчёт (тот же
 * механизм, что EVENT_FLOW_WS_EVENTS): никаких комнат/broadcast по userId —
 * id юзера уникален только в рамках портала, и общий канал утёк бы между
 * порталами.
 */
export const ZPR_FLOW_WS_EVENTS = {
    DONE: 'zpr-flow:done',
} as const;

export const ZPR_FLOW_ACTIONS = [
    'created',
    'closed',
    'moved',
    'spontaneous',
    'skipped',
] as const;

export type ZprFlowAction = (typeof ZPR_FLOW_ACTIONS)[number];

export interface ZprFlowResult {
    action: ZprFlowAction;
    elementId: number | null;
}

/** Payload события DONE — фронту хватает, чтобы инвалидировать слайс ЗПР. */
export interface ZprFlowDonePayload extends ZprFlowResult {
    domain: string;
    operationId?: string;
    kind: 'plan' | 'report';
}
