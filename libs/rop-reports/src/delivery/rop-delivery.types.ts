import { ETimeZone } from '@lib/shared/lib/date';
import { RopPeriodKind } from '../period/rop-period';

/**
 * Контракт доставки отчётов РОПу: что доставляем (собранный отчёт
 * получателя), куда кладём файл, с какими параметрами ставим задачу и
 * где помним прошлые задачи. Каналы доставки — не `@Injectable`:
 * инстанс Битрикса приходит параметром на один прогон портала.
 */

/** Файл отчёта для Диска. */
export interface RopReportFile {
    readonly name: string;
    readonly content: Buffer;
}

/** Отчёт одного получателя, уже собранный: остаётся доставить. */
export interface RopRenderedReport {
    readonly title: string;
    /** Описание (BB-код) зависит от того, удалось ли приложить файл. */
    describe(fileAttached: boolean): string;
    /** Файл Excel; null — отчёт без вложения. */
    readonly file: RopReportFile | null;
}

/** Какой выпуск доставляем: портал, вид и ключ периода. */
export interface RopDeliveryScope {
    readonly domain: string;
    readonly kind: RopPeriodKind;
    readonly periodKey: string;
}

export interface RopDeliveryOptions {
    readonly scope: RopDeliveryScope;
    /** Срок задачи (уже по календарю портала). */
    readonly deadline: Date;
    readonly timezone: ETimeZone;
    /** Владелец вебхука: постановщик задач и хозяин Диска; null — неизвестен. */
    readonly ownerId: number | null;
}

/** Итог доставки одному получателю. */
export interface RopChannelOutcome {
    /** Задача этого периода (новая или поставленная раньше); null — не создана. */
    readonly taskId: number | null;
    /** Задача за этот период уже была (повтор прогона) — вторую не ставили. */
    readonly alreadyDone: boolean;
    /** Прошлая задача-отчёт того же вида закрыта. */
    readonly closedPrevious: boolean;
}

/** Канал доставки отчёта получателю. */
export interface RopDeliveryChannel {
    deliver(
        userId: number,
        report: RopRenderedReport,
        options: RopDeliveryOptions,
        warnings: string[],
    ): Promise<RopChannelOutcome>;
    /**
     * Закрыть прошлые отчёты тех, кому отчёта в этот раз нет.
     * @returns сколько закрыто.
     */
    closeStale(
        currentUserIds: readonly number[],
        options: RopDeliveryOptions,
        warnings: string[],
    ): Promise<number>;
}

/** Куда класть файлы отчёта на Диске портала. */
export const ROP_DISK_TARGET_KIND = {
    /** Папка по имени в личном Диске владельца вебхука (найти или создать). */
    ownerFolder: 'owner_folder',
    /** Готовая папка Диска по id (недельный отчёт по звонкам). */
    folder: 'folder',
} as const;

export type RopDiskTarget =
    | {
          readonly kind: typeof ROP_DISK_TARGET_KIND.ownerFolder;
          readonly name: string;
      }
    | {
          readonly kind: typeof ROP_DISK_TARGET_KIND.folder;
          readonly folderId: number;
      };

/** Папка отчётов РОПу по умолчанию — в личном Диске владельца вебхука. */
export const ROP_REPORTS_FOLDER = 'Отчёты РОПу';

/** Последняя задача-отчёт получателя: за какой период и какая. */
export interface RopTaskMemo {
    readonly periodKey: string;
    readonly taskId: number;
}

/** Где помнятся задачи-отчёты (Redis); ключи — от `RopReportKeys`. */
export interface RopTaskMemoryPort {
    previous(taskKey: string): Promise<RopTaskMemo | null>;
    remember(
        taskKey: string,
        recipientsKey: string,
        userId: number,
        memo: RopTaskMemo,
        ttlSec: number,
    ): Promise<void>;
    /** Все, кому задача-отчёт уходила и ещё помнится. */
    recipients(recipientsKey: string): Promise<number[]>;
    forget(
        taskKey: string,
        recipientsKey: string,
        userId: number,
    ): Promise<void>;
}
