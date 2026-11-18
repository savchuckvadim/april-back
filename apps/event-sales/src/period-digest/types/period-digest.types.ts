import type { RopCommonOptions, RopRecipientSettings } from '@lib/rop-reports';
import type {
    AttentionThresholds,
    DigestAnalyticsSettings,
    DigestPeriodKind,
    MinDurationSecByType,
    WorkCalendar,
} from '@lib/sales-ai-analytics';

/** Настройки итогов периода портала (event-sales) для каркаса и расчёта. */
export interface PeriodDigestOptions extends RopCommonOptions {
    /**
     * Задачи разрешены: «только считать» снято (или ручной запуск просил
     * задачи). Пока доставки нет, прогон всё равно только считает, а в
     * итоге — строка «доставка ещё не подключена».
     */
    readonly deliveryRequested: boolean;
    /** Отмеченные виды периодов; по ним же — политики выпуска. */
    readonly kinds: readonly DigestPeriodKind[];
    /** Получатели задач (Э7); в подсчёте не используются. */
    readonly recipients: RopRecipientSettings;
    /** По кому итоги не считаются. */
    readonly excludeUserIds: ReadonlySet<number>;
    /** Срок задачи в рабочих днях по виду периода (Э7). */
    readonly deadlineDays: Readonly<Record<DigestPeriodKind, number>>;
    /** Минимум звонков для новых рекомендаций и пороги сдвига. */
    readonly analytics: DigestAnalyticsSettings;
}

/** Настройки AI-аналитики портала (kpiSales), нужные карточке. */
export interface PeriodDigestPortalAnalytics {
    /** Календарь AI-аналитики: пояс, рабочие дни, праздники. */
    readonly calendar: WorkCalendar;
    /** Пороги «Внимания» портала. */
    readonly thresholds: AttentionThresholds;
    /** Пороги длительности по типам: короче — вне слоя качества. */
    readonly minDurationByType: MinDurationSecByType;
}

/** Что посчитано за прогон периода — для итога в Telegram и админке. */
export interface PeriodDigestRunReport {
    readonly managers: number;
    readonly readiness: Readonly<Record<'ok' | 'fewData' | 'noCalls', number>>;
    readonly recommendations: Readonly<
        Record<'active' | 'fresh' | 'fixed' | 'escalated' | 'dropped', number>
    >;
    readonly saved: Readonly<
        Record<'created' | 'updated' | 'unchanged', number>
    >;
}
