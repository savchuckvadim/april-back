import type {
    DealMovementCall,
    DealMovementRunStatus,
    DealMovementThresholds,
} from '@lib/sales-ai-analytics';
import type { PbxDealSalesBaseStageCode } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';

/** Настройки портала → параметры счёта (реестр «Настроек приложений»). */
export interface DealMovementOptions {
    readonly thresholds: DealMovementThresholds;
    /** Разборы звонков за столько дней назад. */
    readonly callsLookbackDays: number;
    /** Потолок оцениваемых сделок за ночь. */
    readonly maxDeals: number;
}

/**
 * Открытая сделка «ОП Основная» в объёме правил и итога. Всё, что знает
 * формат Битрикса, заканчивается в ридере: здесь уже числа, коды и ISO.
 */
export interface DealMovementDealRow {
    readonly dealId: number;
    readonly title: string;
    readonly stageCode: PbxDealSalesBaseStageCode | null;
    /** Порядок стадии в лестнице; null — стадия вне лестницы. */
    readonly stageOrder: number | null;
    readonly assignedById: number | null;
    readonly amount: number | null;
    readonly companyId: number | null;
    /** Основной контакт сделки (`CONTACT_ID`). */
    readonly contactId: number | null;
    readonly leadId: number | null;
    /** Вход в текущую стадию (`MOVED_TIME`), ISO. */
    readonly movedAt: string | null;
    /** Последняя активность (`LAST_ACTIVITY_TIME`), ISO. */
    readonly lastActivityAt: string | null;
    readonly createdAt: string | null;
}

/** Точка истории стадий: сделка оказалась на ступени в момент. */
export interface DealMovementHistoryPoint {
    readonly id: number;
    readonly dealId: number;
    readonly order: number;
    readonly at: string;
}

/**
 * Разобранный звонок из нашей БД со связями, по которым его можно
 * сцепить со сделкой: сущность-владелец звонка в CRM и догадка разбора об
 * основной сделке.
 */
export interface DealMovementCallRef {
    readonly transcriptionId: string;
    /** На чём звонок записан в CRM: deal / lead / company / contact. */
    readonly entityType: string | null;
    readonly entityId: number | null;
    /** Основная сделка по разбору (`relatedDeals.mainDealId`); null — нет. */
    readonly mainDealId: number | null;
    readonly call: DealMovementCall;
}

/** Что вернул прогон портала: шёл ли он и его итог. */
export type DealMovementRunOutcome =
    | { readonly kind: 'ran'; readonly status: DealMovementRunStatus }
    | { readonly kind: 'busy'; readonly domain: string }
    | {
          readonly kind: 'failed';
          readonly domain: string;
          readonly error: string;
      };
