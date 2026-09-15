import { PbxDealSalesBaseStageCode } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    DealAuditFlagCode,
    DealAuditStatusCode,
} from '../constants/deal-audit.const';

/** Открытая задача сделки — ровно то, что нужно правилам. */
export interface DealAuditTask {
    readonly id: number;
    /** Дедлайн как абсолютный момент (ms); null — задача без срока. */
    readonly deadlineAt: number | null;
}

/**
 * Слепок сделки для правил: всё уже разобрано в числа и коды.
 *
 * Правила НЕ знают ни про Битрикс, ни про формат его дат — это условие
 * их тестируемости и причина, по которой разбор живёт в ридерах.
 */
export interface DealAuditSnapshot {
    readonly dealId: number;
    readonly title: string;
    readonly stageCode: PbxDealSalesBaseStageCode | null;
    readonly stageName: string;
    readonly assignedById: number | null;
    readonly companyId: number | null;
    /** Последняя активность карточки (`LAST_ACTIVITY_TIME`), ms. */
    readonly lastActivityAt: number | null;
    /** Момент последнего перехода по воронке (`MOVED_TIME`), ms. */
    readonly stageMovedAt: number | null;
    /** «ОП Дата следующего звонка» (`call_next_date`), ms. */
    readonly nextCallAt: number | null;
    readonly openTasks: readonly DealAuditTask[];
    /**
     * Статус прошлого прогона (код элемента справочника) — чтобы не
     * переписывать карточку тем же значением: тысяча лишних
     * `crm.deal.update` в сутки создаёт шум в истории и ест лимиты.
     */
    readonly previousStatus: string | null;
}

/** Пороги из настроек портала (админка → Settings → event-sales). */
export interface DealAuditThresholds {
    readonly idleDays: number;
    readonly overdueHours: number;
    readonly stageStuckDays: number;
    readonly forgotCloseDays: number;
}

/** Что крон посчитал по одной сделке. */
export interface DealAuditVerdict {
    readonly dealId: number;
    readonly title: string;
    readonly assignedById: number | null;
    readonly status: DealAuditStatusCode;
    readonly flags: readonly DealAuditFlagCode[];
    /** Дней без активности; null — активность неизвестна. */
    readonly idleDays: number | null;
    /** Дней просрочки самой старой открытой задачи; 0 — просрочки нет. */
    readonly overdueDays: number;
    /** Дней в текущей стадии; null — дата перехода неизвестна. */
    readonly stageDays: number | null;
    readonly openTasks: number;
    /** Человекочитаемая расшифровка — уходит в поле и в дайджест. */
    readonly comment: string;
}

/** Итог прогона по одному порталу. */
export interface DealAuditRunResult {
    readonly domain: string;
    /** Сколько сделок прочитали из воронки. */
    readonly scanned: number;
    /** Сколько разметили (у скольких статус изменился либо запись первая). */
    readonly written: number;
    /** Сколько признано забытыми (статус ≠ «Норма»). */
    readonly flagged: number;
    /** Разбивка «статус → сколько сделок» для лога и ответа ручки. */
    readonly byStatus: Readonly<Record<string, number>>;
    /** Вердикты забытых сделок (для ответа ручки и дайджеста). */
    readonly verdicts: readonly DealAuditVerdict[];
    readonly dryRun: boolean;
    readonly warnings: readonly string[];
}
