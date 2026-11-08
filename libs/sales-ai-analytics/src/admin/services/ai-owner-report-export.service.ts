/**
 * Выгрузка PDF отчёта собственнику из админки: проверка периода, отметка
 * «в очереди», джоба `SALES_AI_ANALYTICS_OWNER_REPORT_EXPORT` в общую
 * очередь `SALES_KPI_REPORT` (воркер — kpi-report-sales), чтение
 * состояния и файла из Redis. Битрикс портала админке не нужен.
 *
 * `QueueDispatcherService` опционален: без очереди (спеки, сборки без
 * Redis) запуск честно отвечает ошибкой, а не молчит.
 */
import {
    BadRequestException,
    Injectable,
    Optional,
    ServiceUnavailableException,
} from '@nestjs/common';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import {
    OWNER_REPORT_EXPORT_JOB_OPTIONS,
    ownerReportExportJobId,
    type OwnerReportExportJobData,
    type OwnerReportExportState,
} from '../../contracts/owner-report-export.types';
import { ownerReportPeriodBounds } from '../../model/owner-report/owner-report.period';
import type { OwnerReportPeriodKind } from '../../model/owner-report/owner-report.types';
import { toPortalDate } from '../../model/workdays.util';
import {
    OwnerReportExportStore,
    type OwnerReportExportTarget,
} from '../../owner-report-export/owner-report-export.store';

export const OWNER_REPORT_EXPORT_ERRORS = {
    periodKey:
        'Ключ периода не соответствует его виду: месяц — ГГГГ-ММ, квартал — ГГГГ-Q1…Q4, полугодие — ГГГГ-H1/H2, год — ГГГГ',
    periodOpen: 'Период ещё не закончился: отчёт строится по закрытым периодам',
    noQueue: 'Очередь не подключена в этой сборке — выгрузка невозможна',
} as const;

/** Пояс дат для проверки «период закрыт» (точный пояс — у воркера). */
const EXPORT_CHECK_TIME_ZONE = 'Europe/Moscow';

export interface OwnerReportExportStartInput extends OwnerReportExportTarget {
    forceRefresh: boolean;
    requestedBy?: string;
}

@Injectable()
export class AiOwnerReportExportService {
    constructor(
        private readonly store: OwnerReportExportStore,
        @Optional() private readonly dispatcher?: QueueDispatcherService,
    ) {}

    /** Поставить выгрузку; идущая выгрузка того же периода не дублируется. */
    async start(
        input: OwnerReportExportStartInput,
        now = new Date(),
    ): Promise<OwnerReportExportState> {
        this.assertClosedPeriod(input.kind, input.periodKey, now);
        if (!this.dispatcher) {
            throw new ServiceUnavailableException(
                OWNER_REPORT_EXPORT_ERRORS.noQueue,
            );
        }
        const current = await this.store.readState(input);
        if (
            current &&
            (current.status === 'queued' || current.status === 'processing')
        ) {
            return current;
        }
        const payload: OwnerReportExportJobData = {
            domain: input.domain,
            kind: input.kind,
            periodKey: input.periodKey,
            forceRefresh: input.forceRefresh,
            ...(input.requestedBy ? { requestedBy: input.requestedBy } : {}),
        };
        const state = await this.store.writeState(
            input,
            { status: 'queued' },
            now,
        );
        await this.dispatcher.dispatch<OwnerReportExportJobData>(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_AI_ANALYTICS_OWNER_REPORT_EXPORT,
            payload,
            ownerReportExportJobId(payload),
            OWNER_REPORT_EXPORT_JOB_OPTIONS,
        );
        return state;
    }

    /** Состояние выгрузки периода; не запускали или срок вышел — null. */
    state(
        target: OwnerReportExportTarget,
    ): Promise<OwnerReportExportState | null> {
        return this.store.readState(target);
    }

    /** Готовый файл и его имя; не готов — null. */
    async file(
        target: OwnerReportExportTarget,
    ): Promise<{ buffer: Buffer; filename: string } | null> {
        const state = await this.store.readState(target);
        if (!state || state.status !== 'ready') return null;
        const buffer = await this.store.readPdf(target);
        if (!buffer) return null;
        // Домен в имени: из админки качают отчёты разных порталов подряд.
        const base =
            state.filename ??
            `sales-report-${target.kind}-${target.periodKey}.pdf`;
        const portal = target.domain.replace(/[^a-z0-9.-]/gi, '_');
        return { buffer, filename: `${portal}-${base}` };
    }

    private assertClosedPeriod(
        kind: OwnerReportPeriodKind,
        periodKey: string,
        now: Date,
    ): void {
        const bounds = ownerReportPeriodBounds(kind, periodKey);
        if (!bounds) {
            throw new BadRequestException(OWNER_REPORT_EXPORT_ERRORS.periodKey);
        }
        if (bounds.to >= toPortalDate(now, EXPORT_CHECK_TIME_ZONE)) {
            throw new BadRequestException(
                OWNER_REPORT_EXPORT_ERRORS.periodOpen,
            );
        }
    }
}
