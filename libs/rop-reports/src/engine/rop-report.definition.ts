import { RopPeriodKind, RopPeriodWindow } from '../period/rop-period';
import { RopDuePolicy } from '../period/rop-schedule';
import { RopCalendarPort } from '../ports/rop-calendar.port';
import { RopReportKeys } from '../state/rop-keys';

/**
 * Определение отчёта РОПу для движка: что у отчёта своё (настройки,
 * политики выпуска, сам прогон портала), а что общее (тик по порталам,
 * замки, метки выпуска, повторы, итог в Telegram) — делает движок
 * (`RopReportTicker`, `RopPeriodRunner`).
 *
 * Определение живёт в приложении как `@Injectable` без Битрикса в полях:
 * инстанс Битрикса берётся внутри `run` через `PBXService.init(domain)`.
 */

/** Общая часть настроек отчёта на портале. */
export interface RopCommonOptions {
    /** «Только считать»: снимок и итог в Telegram, без задач. */
    readonly countOnly: boolean;
    /** Политики выпуска включённых видов периодов (неделя, месяц…). */
    readonly policies: readonly RopDuePolicy[];
}

/** Режим прогона периода. */
export interface RopRunMode {
    /** Только посчитать: задачи не ставятся. */
    readonly countOnly: boolean;
    /** Проба: весь отчёт одной задачей этому сотруднику; null — обычный прогон. */
    readonly previewUserId: number | null;
    /** Ручной запуск: день и час не проверяются, метки ставит не всякий прогон. */
    readonly force: boolean;
}

export interface RopRunContext<TOptions extends RopCommonOptions> {
    readonly domain: string;
    readonly period: RopPeriodWindow;
    readonly options: TOptions;
    readonly mode: RopRunMode;
    readonly now: Date;
    /** Продлить замки прогона: вызывать между долгими шагами (модель, рассылка). */
    heartbeat(): Promise<void>;
}

/** Итог прогона периода на портале — для меток, Telegram и админки. */
export interface RopRunResult {
    readonly domain: string;
    readonly kind: RopPeriodKind;
    readonly periodKey: string;
    readonly countOnly: boolean;
    /** Получателей, которым положена задача. */
    readonly recipients: number;
    readonly tasksCreated: number;
    /** Задача за этот период у получателя уже была (повтор прогона). */
    readonly tasksAlreadyDone: number;
    readonly tasksClosed: number;
    /** Строки итога для людей: что посчитано (без кодов). */
    readonly summary: readonly string[];
    readonly warnings: readonly string[];
}

export interface RopReportDefinition<TOptions extends RopCommonOptions> {
    /** Имя отчёта в журнале. */
    readonly code: string;
    /** Заголовок итога в Telegram: «Итоги периода по менеджерам». */
    readonly title: string;
    readonly keys: RopReportKeys;
    /** Попыток на период; после последней период закрывается без отчёта. */
    readonly maxAttempts: number;
    /** Календарь портала: таймзона и рабочие дни для «пора ли». */
    readonly calendar: RopCalendarPort;
    /** Порталы, где отчёт включён; ошибка чтения — тик пропускается. */
    enabledDomains(): Promise<string[]>;
    /** Настройки портала; `countOnly` перебивает настройку (ручной запуск). */
    resolveOptions(
        domain: string,
        overrides: { readonly countOnly?: boolean },
    ): Promise<TOptions>;
    /** Прогон периода на портале: собрать, посчитать, доставить по режиму. */
    run(
        context: RopRunContext<TOptions>,
        warnings: string[],
    ): Promise<RopRunResult>;
}

/**
 * Отчёт дошёл: «только считать», получателей нет или у каждого получателя
 * есть задача за этот период (новая или поставленная прошлой попыткой).
 * Иначе период остаётся открытым и прогон повторится.
 */
export const isRopDelivered = (result: RopRunResult): boolean =>
    result.countOnly ||
    result.recipients === 0 ||
    result.tasksCreated + result.tasksAlreadyDone >= result.recipients;
