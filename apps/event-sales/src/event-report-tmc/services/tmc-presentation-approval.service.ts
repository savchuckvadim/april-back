import { Injectable, Logger } from '@nestjs/common';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { AppCacheService } from '@lib/app-cache';
import { EventFlowJobData } from '../../event-report/dto/event-flow-job.dto';
import {
    EnumEventFlowStatus,
    EventFlowOperationDto,
} from '../../event-report/dto/response/event-flow-operation.dto';
import { EventFlowStatusService } from '../../event-report/services/status/event-flow-status.service';
import { TmcPresentationApprovedDto } from '../dto/tmc-presentation-approved.dto';
import {
    approvedPresentationOperationId,
    buildApprovedPresentationFlowDto,
    normalizeApprovedPresentation,
} from '../lib/approved-presentation-flow-dto.builder';
import {
    acceptedApprovalKey,
    TMC_APPROVAL_CACHE_APP,
    TMC_APPROVAL_MARKER_TTL_SECONDS,
    TmcApprovalAcceptedMarker,
    TmcApprovalSource,
} from '../constants/tmc-approval-cache.const';

/** Что известно об операции согласования до постановки. */
export interface TmcApprovalLookup {
    /** Живой статус операции (живёт час). */
    live: EventFlowOperationDto | null;
    /** Долгая метка «принято» (30 дней). */
    accepted: TmcApprovalAcceptedMarker | null;
    /**
     * Повторять не надо: живой статус есть и это не «упала», либо статус
     * истёк, но метка говорит, что согласование уже принимали.
     */
    alreadyAccepted: boolean;
}

export interface TmcApprovalEnqueueResult {
    operation: EventFlowOperationDto;
    /** Операция поставлена именно сейчас (false — уже принимали раньше). */
    isNew: boolean;
}

/**
 * Согласованная заявка ТМЦ → отчёт «запланирована презентация» от имени
 * менеджера ОП в ОБЫЧНУЮ очередь отчётов (EVENT_SALES_FLOW).
 *
 * Легаси-ручка `/initpres/success` выполняла этот отчёт синхронно внутри
 * запроса робота; здесь — та же очередь и тот же воркер, что у отчёта из
 * фрейма: статус операции, повтор без дублей (детерминированный id), лок
 * по клиенту. Робот получает статус операции сразу.
 *
 * Повтор узнаётся двумя слоями: живой статус операции (час) и долгая метка
 * «принято» в AppCache (30 дней) — её пишут и робот, и подстраховка по
 * крону, поэтому одно согласование не планируется дважды даже спустя сутки,
 * когда статус давно истёк. Упавшая операция («failed») повторяется.
 *
 * Инстанса bitrix у сервиса нет (CLAUDE.md): сюда инжектятся только
 * stateless-сервисы очереди, статусов и кэша.
 */
@Injectable()
export class TmcPresentationApprovalService {
    private readonly logger = new Logger(TmcPresentationApprovalService.name);

    constructor(
        private readonly queue: QueueDispatcherService,
        private readonly status: EventFlowStatusService,
        private readonly appCache: AppCacheService,
    ) {}

    /** Вызов робота бизнес-процесса: статус операции (принятой сейчас или раньше). */
    async accept(
        raw: TmcPresentationApprovedDto,
    ): Promise<EventFlowOperationDto> {
        return (await this.enqueue(raw, 'робот')).operation;
    }

    /**
     * Вызов подстраховки по крону: кроме статуса — поставлена ли операция
     * именно сейчас (`isNew: false` — такое согласование уже принимали, и
     * попытку крона считать не надо).
     */
    async acceptFromRescue(
        raw: TmcPresentationApprovedDto,
    ): Promise<TmcApprovalEnqueueResult> {
        return this.enqueue(raw, 'подстраховка');
    }

    /** Живой статус и долгая метка операции — без постановки в очередь. */
    async lookup(
        domain: string,
        operationId: string,
    ): Promise<TmcApprovalLookup> {
        const live = await this.status.get(domain, operationId);
        const accepted = await this.appCache.get<TmcApprovalAcceptedMarker>(
            this.acceptedRef(domain, operationId),
        );
        const alreadyAccepted = live
            ? live.status !== EnumEventFlowStatus.FAILED
            : accepted !== null;
        return { live, accepted, alreadyAccepted };
    }

    private async enqueue(
        raw: TmcPresentationApprovedDto,
        source: TmcApprovalSource,
    ): Promise<TmcApprovalEnqueueResult> {
        const input = normalizeApprovedPresentation(raw);
        const operationId = approvedPresentationOperationId(input);
        const prefix = `tmc/presentation-approved (${source})`;

        const known = await this.lookup(input.domain, operationId);
        if (known.live && known.alreadyAccepted) {
            this.logger.log(
                `${prefix}: операция ${operationId} уже принята ` +
                    `(${known.live.status}) — повторно не выполняем`,
            );
            return { operation: known.live, isNew: false };
        }
        if (!known.live && known.accepted) {
            this.logger.log(
                `${prefix}: операция ${operationId} уже принималась ` +
                    `${known.accepted.acceptedAt} (${known.accepted.source}), статус истёк — повторно не выполняем`,
            );
            return {
                operation: this.expiredOperation(operationId, known.accepted),
                isNew: false,
            };
        }
        if (known.live) {
            this.logger.warn(
                `${prefix}: операция ${operationId} раньше упала (${known.live.error ?? 'без причины'}) — повторяем`,
            );
        }

        const dto = buildApprovedPresentationFlowDto(input, operationId);
        this.logger.log(
            `${prefix}: domain=${input.domain}, ` +
                `tmcDeal=${input.tmcDealId}, company=${input.companyId}, ` +
                `manager=${input.managerId}, owner=${input.ownerId}, ` +
                `tmc=${input.tmcId || '-'}, deadline=${input.deadline}`,
        );

        const queuedAt = new Date().toISOString();
        const operation = await this.status.setQueued(
            input.domain,
            operationId,
            queuedAt,
        );
        const jobData: EventFlowJobData = {
            operationId,
            domain: input.domain,
            dto,
        };
        // jobId = operationId: повторный запуск робота не породит второй прогон.
        await this.queue.dispatch(
            QueueNames.EVENT_SALES_FLOW,
            JobNames.EVENT_SALES_FLOW,
            jobData,
            operationId,
            { removeOnComplete: true, removeOnFail: true },
        );
        await this.markAccepted(input.domain, operationId, {
            acceptedAt: queuedAt,
            source,
        });
        return { operation, isNew: true };
    }

    /**
     * Долгая метка пишется ПОСЛЕ постановки: не поставили — метки нет, и
     * подстраховка сможет повторить. Сама метка не стоит отказа роботу:
     * согласование уже в очереди, о потере метки — предупреждение.
     */
    private async markAccepted(
        domain: string,
        operationId: string,
        marker: TmcApprovalAcceptedMarker,
    ): Promise<void> {
        try {
            await this.appCache.set({
                ...this.acceptedRef(domain, operationId),
                group: 'accepted',
                data: marker,
                ttlSeconds: TMC_APPROVAL_MARKER_TTL_SECONDS,
            });
        } catch (error) {
            this.logger.warn(
                `tmc/presentation-approved: метка «принято» для ${operationId} не записана — ` +
                    `подстраховка опознает согласование только по сделкам (${(error as Error).message})`,
            );
        }
    }

    /**
     * Статус истёк, а метка есть: операция прошла час назад и дольше.
     * «Упала» прожила бы в статусе тот же час, поэтому истёкшая считается
     * выполненной.
     */
    private expiredOperation(
        operationId: string,
        accepted: TmcApprovalAcceptedMarker,
    ): EventFlowOperationDto {
        return {
            operationId,
            status: EnumEventFlowStatus.DONE,
            queuedAt: accepted.acceptedAt,
            startedAt: null,
            finishedAt: null,
            result: null,
            error: null,
        };
    }

    private acceptedRef(domain: string, operationId: string) {
        return {
            app: TMC_APPROVAL_CACHE_APP,
            domain,
            key: acceptedApprovalKey(operationId),
        };
    }
}
