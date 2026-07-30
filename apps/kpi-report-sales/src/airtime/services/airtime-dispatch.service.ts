import { Injectable, Logger } from '@nestjs/common';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import type { IsoDate } from '../../shared/lib/month-segments.util';
import {
    AIRTIME_JOB_ATTEMPTS,
    AIRTIME_JOB_BACKOFF_DELAY_MS,
    AIRTIME_MAX_JOBS_PER_DISPATCH,
    AIRTIME_PRIORITY_INTERACTIVE,
} from '../constants/airtime-queue.const';
import type { AirtimeReadiness } from './airtime-assembly.service';
import {
    buildAirtimeDaySpanJobId,
    buildAirtimeMonthJobId,
} from '../queue/airtime-job-id.util';
import type {
    AirtimeDaySpanJobData,
    AirtimeMonthJobData,
} from '../queue/airtime-job.dto';

/** Контекст исходного запроса, попадающий в job-данные. */
export interface AirtimeDispatchContext {
    socketId?: string;
    requestKey: string;
    dateFrom: IsoDate;
    dateTo: IsoDate;
    forceRefresh: boolean;
}

/**
 * Постановка job'ов на НЕДОСТАЮЩИЕ партиции периода.
 *
 * Дедупликация: jobId детерминирован от (домен, партиция) — повторный клик,
 * второй пользователь или другой состав отдела с тем же периодом НЕ создают
 * второй прогон (Bull игнорирует add с занятым jobId; removeOnComplete/Fail
 * освобождают id после завершения).
 *
 * Юниты со статусом 'error' НЕ переставляются, пока жив error-маркер
 * (защита от crash-loop); ретрай — forceRefresh (readiness тогда отдаёт
 * их как queued) или протухание маркера.
 *
 * Приоритет — интерактивный; ночной cron-прогрев (будущая ветка) пойдёт
 * с AIRTIME_PRIORITY_WARMUP, чтобы не задерживать живые запросы.
 *
 * Порционность: за один вызов ставится не больше AIRTIME_MAX_JOBS_PER_DISPATCH
 * job'ов (хронологически первых). Продолжение доставляет поллинг фронта —
 * заброшенный запрос затухает сам, не молотя весь период (защита прода
 * и Битрикса от «выбрали 10 лет и закрыли вкладку»).
 */
@Injectable()
export class AirtimeDispatchService {
    private readonly logger = new Logger(AirtimeDispatchService.name);

    constructor(private readonly queue: QueueDispatcherService) {}

    /**
     * Ставит job'ы на юниты со статусом queued (хронологически, порцией);
     * возвращает число поставленных.
     */
    async dispatchMissing(
        domain: string,
        readiness: AirtimeReadiness,
        ctx: AirtimeDispatchContext,
    ): Promise<number> {
        let dispatched = 0;

        for (const { unit, status } of readiness.units) {
            if (status !== 'queued') continue;
            if (dispatched >= AIRTIME_MAX_JOBS_PER_DISPATCH) break;

            if (unit.kind === 'month') {
                const data: AirtimeMonthJobData = {
                    domain,
                    month: unit.month,
                    requestKey: ctx.requestKey,
                    socketId: ctx.socketId,
                    dateFrom: ctx.dateFrom,
                    dateTo: ctx.dateTo,
                };
                await this.queue.dispatch(
                    QueueNames.SALES_KPI_REPORT,
                    JobNames.AIRTIME_MONTH_PARTITION,
                    data,
                    buildAirtimeMonthJobId(domain, unit.month),
                    this.jobOpts(),
                );
            } else {
                const data: AirtimeDaySpanJobData = {
                    domain,
                    month: unit.month,
                    from: unit.from,
                    to: unit.to,
                    forceRefresh: ctx.forceRefresh,
                    requestKey: ctx.requestKey,
                    socketId: ctx.socketId,
                    dateFrom: ctx.dateFrom,
                    dateTo: ctx.dateTo,
                };
                await this.queue.dispatch(
                    QueueNames.SALES_KPI_REPORT,
                    JobNames.AIRTIME_DAY_SPAN,
                    data,
                    buildAirtimeDaySpanJobId(domain, unit.from, unit.to),
                    this.jobOpts(),
                );
            }
            dispatched += 1;
        }

        if (dispatched) {
            this.logger.log(
                `[${domain}] поставлено job'ов партиций airtime: ${dispatched}`,
            );
        }
        return dispatched;
    }

    private jobOpts() {
        return {
            attempts: AIRTIME_JOB_ATTEMPTS,
            backoff: {
                type: 'exponential' as const,
                delay: AIRTIME_JOB_BACKOFF_DELAY_MS,
            },
            priority: AIRTIME_PRIORITY_INTERACTIVE,
            removeOnComplete: true,
            removeOnFail: true,
        };
    }
}
