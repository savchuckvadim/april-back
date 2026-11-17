import type {
    DealMovementCall,
    DealMovementRunStatus,
    DealMovementStatus,
    DealMovementThresholds,
} from '@lib/sales-ai-analytics';
import type { PbxDealSalesBaseStageCode } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import type {
    DealMovementDigestMode,
    DealMovementNoteKind,
} from '@lib/portal-lib/store/app-settings';

/** Запись в ленту сделок: включена ли, каким видом и лимиты ночи. */
export interface DealMovementNotesOptions {
    readonly write: boolean;
    readonly kind: DealMovementNoteKind;
    /** Записей в ленты сделок за ночь на портал. */
    readonly maxNotes: number;
    /** Вызовов модели «что сделать» за ночь на портал. */
    readonly maxTexts: number;
}

/** Сводка руководителям: включена ли, когда слать и сколько «под риском». */
export interface DealMovementDigestOptions {
    readonly enabled: boolean;
    readonly mode: DealMovementDigestMode;
    /** Сделок под риском в сводке — самые крупные по сумме. */
    readonly top: number;
}

/** Настройки портала → параметры счёта (реестр «Настроек приложений»). */
export interface DealMovementOptions {
    readonly thresholds: DealMovementThresholds;
    /** Разборы звонков за столько дней назад. */
    readonly callsLookbackDays: number;
    /** Потолок оцениваемых сделок за ночь. */
    readonly maxDeals: number;
    readonly notes: DealMovementNotesOptions;
    readonly digest: DealMovementDigestOptions;
}

/** Сделка в сводке руководителям: всё, что нужно строке сводки. */
export interface DealMovementDigestDeal {
    readonly dealId: string;
    readonly title: string;
    readonly assignedById: number | null;
    readonly amount: number | null;
    readonly status: DealMovementStatus;
    /**
     * Статус до смены этой ночью, если сделка СТАЛА тревожной («новые за
     * ночь»); null — не новая.
     */
    readonly newFrom: DealMovementStatus | null;
    /** Причины статуса словами, одной строкой. */
    readonly reasons: string;
    readonly daysInStage: number;
    /**
     * Свежая находка аудита сделок словами («ещё и по аудиту: …»); null —
     * находки нет или она старая. Статус она не меняет.
     */
    readonly audit: string | null;
}

/** Расшифровки, по которым «что сделать» перечитывает разборы. */
export interface DealMovementCallPointers {
    /** Последний разобранный звонок: расшифровка и момент; null — звонков нет. */
    readonly lastCall: { readonly id: string; readonly at: string } | null;
    /**
     * Последний звонок с договорённостью: расшифровка и дата шага
     * 'YYYY-MM-DD'; null — договорённостей нет.
     */
    readonly lastAgreement: {
        readonly id: string;
        readonly date: string | null;
    } | null;
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
