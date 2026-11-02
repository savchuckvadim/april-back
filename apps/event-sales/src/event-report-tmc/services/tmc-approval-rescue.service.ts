import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { PBXService } from '@/modules/pbx/pbx.service';
import { BitrixService, IBxRpaItem, IBxRpaStage } from '@/modules/bitrix';
import { AppCacheService } from '@lib/app-cache';
import { BitrixDateTime, ETimeZone } from '@lib/shared/lib/date';
import { TmcPresentationApprovalService } from './tmc-presentation-approval.service';
import { TmcApprovalProcessedChecker } from './tmc-approval-processed.checker';
import {
    ApprovedRpaMapping,
    ApprovedRpaRequest,
    mapApprovedRpaItem,
    RpaFieldResolver,
    RpaItemRow,
} from '../lib/rpa-approved-request.mapper';
import { RPA_PRESENTATION_CODE } from '../lib/rpa-presentation-fields.const';
import {
    approvedPresentationOperationId,
    normalizeApprovedPresentation,
} from '../lib/approved-presentation-flow-dto.builder';
import {
    decideTmcApprovalRescue,
    TMC_APPROVAL_BACKOFF_MINUTES,
    TMC_APPROVAL_MAX_ATTEMPTS,
    TmcApprovalAttemptMarker,
    TmcApprovalRescueReason,
    TmcApprovalRescueThresholds,
} from '../lib/tmc-approval-rescue.decision';
import {
    attemptMarkerKey,
    invalidMarkerKey,
    TMC_APPROVAL_CACHE_APP,
    TMC_APPROVAL_MARKER_TTL_SECONDS,
} from '../constants/tmc-approval-cache.const';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Настройки прогона (из админки, на домен). */
export interface TmcApprovalRescueOptions {
    /** Кандидатов находим и пишем в лог, но презентации не планируем. */
    dryRun: boolean;
    /** Коды стадий РПА, в которых заявка считается согласованной. */
    stageCodes: string[];
    /** Насколько давно утверждённые заявки ещё рассматриваем. */
    lookbackHours: number;
    /** Сколько минут после утверждения робот дозванивается сам. */
    graceMinutes: number;
    /** Максимум заявок за тик — защита от лавины после простоя. */
    maxPerRun: number;
}

export type TmcApprovalSkipReason =
    | Exclude<TmcApprovalRescueReason, 'dispatch'>
    /** Заявка без обязательных полей — провести нельзя. */
    | 'invalid'
    /** Операция с таким id уже принята (роботом или прошлым тиком). */
    | 'already-accepted'
    /** Сделки компании не прочитаны — проверим на следующем тике. */
    | 'check-failed'
    /** Заявка упала с ошибкой — остальные кандидаты от этого не страдают. */
    | 'item-failed';

/** Что стало с одной заявкой за тик. */
type ItemOutcome = 'dispatched' | 'dry-run' | TmcApprovalSkipReason;

export interface TmcApprovalRescueRunResult {
    /** Утверждённых заявок в окне просмотра. */
    candidates: number;
    /** Поставлено согласований в очередь. */
    dispatched: number;
    /** Найдено в режиме холостого хода. */
    dryRun: number;
    /** Пропущено с разбивкой по причине — чтобы лог объяснял сам себя. */
    skipped: Partial<Record<TmcApprovalSkipReason, number>>;
    warnings: string[];
}

interface RunContext {
    domain: string;
    tz: ETimeZone;
    options: TmcApprovalRescueOptions;
    now: Date;
    thresholds: TmcApprovalRescueThresholds;
    resolveField: RpaFieldResolver;
    checker: TmcApprovalProcessedChecker;
    result: TmcApprovalRescueRunResult;
}

const emptyResult = (): TmcApprovalRescueRunResult => ({
    candidates: 0,
    dispatched: 0,
    dryRun: 0,
    skipped: {},
    warnings: [],
});

const bump = (
    skipped: TmcApprovalRescueRunResult['skipped'],
    reason: TmcApprovalSkipReason,
): void => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
};

/** Предупреждение о заявке без обязательных полей — не чаще раза в сутки. */
const INVALID_TTL_SECONDS = 24 * 60 * 60;
/** Страниц `rpa.item.list` на стадию — за трое суток заявок единицы. */
const PAGE_LIMIT = 10;
const HOUR_MS = 60 * 60 * 1000;

const labelOf = (request: ApprovedRpaRequest): string =>
    `заявка РПА ${request.rpaItemId}: ТМЦ-сделка ${request.tmcDealId}, ` +
    `менеджер ${request.managerId}, презентация ${request.dto.deadline ?? '-'}`;

/**
 * Подстраховка согласования заявок ТМЦ на презентацию.
 *
 * Зачем: робот бизнес-процесса РПА зовёт ручку
 * `tmc/presentation-approved` после утверждения заявки; если вызов не
 * дошёл (сеть, рестарт, ошибка портала), утверждённая заявка так и висит —
 * без задачи у менеджера, без pres-сделки, без KPI. Крон читает
 * утверждённые элементы РПА и ставит то же согласование сам — через тот же
 * сервис и ту же очередь, что робот.
 *
 * Порядок проверок на заявку — от дешёвой к дорогой: свежесть и попытки
 * ({@link decideTmcApprovalRescue}), долгая метка «принято» и живой статус
 * операции (`TmcPresentationApprovalService.lookup`), и только потом след
 * по сделкам компании ({@link TmcApprovalProcessedChecker}) — для заявок,
 * принятых легаси до выкладки. Одна упавшая заявка не мешает остальным.
 *
 * @Injectable, но инстанс Битрикса в поля НЕ кладём — только PBXService
 * (CLAUDE.md: иначе race condition между порталами).
 */
@Injectable()
export class TmcApprovalRescueService {
    private readonly logger = new Logger(TmcApprovalRescueService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly approval: TmcPresentationApprovalService,
        private readonly appCache: AppCacheService,
    ) {}

    async runForDomain(
        domain: string,
        options: TmcApprovalRescueOptions,
        now: Date = new Date(),
    ): Promise<TmcApprovalRescueRunResult> {
        const result = emptyResult();
        const { bitrix, PortalModel: portal } = await this.pbx.init(domain);

        const rpa = portal.getRpaByCode(RPA_PRESENTATION_CODE);
        if (!rpa) {
            result.warnings.push(
                'РПА «Заявка на презентацию» на портале не установлена — подстраховке нечего читать',
            );
            return result;
        }
        const typeId = Number(rpa.bitrixId);
        const stageIds = await this.resolveStageIds(
            bitrix,
            typeId,
            options.stageCodes,
            result,
        );
        if (!stageIds.length) return result;

        const tz = portal.getTimezone();
        const since = new Date(now.getTime() - options.lookbackHours * HOUR_MS);
        const items = await this.listApproved(
            bitrix,
            typeId,
            stageIds,
            since,
            tz,
        );
        result.candidates = items.length;
        if (!items.length) return result;

        const ctx: RunContext = {
            domain,
            tz,
            options,
            now,
            thresholds: {
                now,
                graceMinutes: options.graceMinutes,
                maxAttempts: TMC_APPROVAL_MAX_ATTEMPTS,
                backoffMinutes: TMC_APPROVAL_BACKOFF_MINUTES,
            },
            resolveField: code =>
                portal.getRpaFieldBitrixIdByCode(RPA_PRESENTATION_CODE, code),
            checker: new TmcApprovalProcessedChecker(bitrix, portal),
            result,
        };
        // Бюджет считает и холостой ход: лог «кого бы догнал» должен
        // показывать ровно то, что крон сделал бы по-настоящему.
        let budget = Math.max(1, options.maxPerRun);

        for (const item of items) {
            if (budget <= 0) {
                result.warnings.push(
                    `лимит ${options.maxPerRun} заявок за прогон исчерпан — остальные подождут следующего тика`,
                );
                break;
            }
            const outcome = await this.processItem(
                ctx,
                item as RpaItemRow,
            ).catch((error: unknown): ItemOutcome => {
                result.warnings.push(
                    `заявка РПА ${String(item.id)} не обработана: ${(error as Error).message}`,
                );
                return 'item-failed';
            });
            if (outcome === 'dispatched') {
                result.dispatched += 1;
                budget -= 1;
            } else if (outcome === 'dry-run') {
                result.dryRun += 1;
                budget -= 1;
            } else {
                bump(result.skipped, outcome);
            }
        }
        return result;
    }

    private async processItem(
        ctx: RunContext,
        item: RpaItemRow,
    ): Promise<ItemOutcome> {
        const mapped = mapApprovedRpaItem(
            item,
            ctx.domain,
            ctx.resolveField,
            ctx.tz,
        );
        if (!mapped.ok) {
            await this.noteInvalid(ctx.domain, mapped);
            return 'invalid';
        }
        const { request } = mapped;
        const markerRef = this.ref(
            ctx.domain,
            attemptMarkerKey(request.rpaItemId),
        );
        const marker =
            await this.appCache.get<TmcApprovalAttemptMarker>(markerRef);
        const decision = decideTmcApprovalRescue(
            {
                movedAt: request.movedAt?.toDayjs().toDate() ?? null,
                processed: false,
                marker,
            },
            ctx.thresholds,
        );
        if (decision.reason !== 'dispatch') return decision.reason;

        const label = labelOf(request);
        const operationId = approvedPresentationOperationId(
            normalizeApprovedPresentation(request.dto),
        );
        const known = await this.approval.lookup(ctx.domain, operationId);
        if (known.alreadyAccepted) {
            this.logger.log(
                `${ctx.domain}: ${label} — операция ${operationId} уже принята ` +
                    `(${known.live?.status ?? `метка ${known.accepted?.acceptedAt ?? ''}`})`,
            );
            return 'already-accepted';
        }

        let processed: boolean;
        try {
            processed = await ctx.checker.isProcessed({
                tmcDealId: request.tmcDealId,
                companyId: request.dto.companyId ?? 0,
                managerId: request.managerId,
                deadline: request.deadline,
                approvedAt: request.movedAt,
            });
        } catch (error) {
            ctx.result.warnings.push(
                `${label}: сделки компании не прочитаны (${(error as Error).message}) — проверим на следующем тике`,
            );
            return 'check-failed';
        }
        if (processed) return 'processed';

        if (ctx.options.dryRun) {
            this.logger.log(
                `${ctx.domain}: [холостой ход] ${label} — робот не дозвонился, крон запланировал бы презентацию`,
            );
            return 'dry-run';
        }

        const { operation, isNew } = await this.approval.acceptFromRescue(
            request.dto,
        );
        if (!isNew) {
            this.logger.log(
                `${ctx.domain}: ${label} — операция ${operation.operationId} уже принята (${operation.status})`,
            );
            return 'already-accepted';
        }
        const attempts = (marker?.attempts ?? 0) + 1;
        try {
            await this.appCache.set({
                ...markerRef,
                group: 'attempt',
                data: {
                    attempts,
                    lastAt: ctx.now.toISOString(),
                    operationId: operation.operationId,
                } satisfies TmcApprovalAttemptMarker,
                ttlSeconds: TMC_APPROVAL_MARKER_TTL_SECONDS,
            });
        } catch (error) {
            // Согласование уже в очереди; потеряна только метка — попытка
            // не посчитана, повтор защитит долгая метка «принято».
            ctx.result.warnings.push(
                `${label}: согласование поставлено (операция ${operation.operationId}), ` +
                    `но метка попытки не записана (${(error as Error).message}) — попытка не посчитана`,
            );
        }
        this.logger.log(
            `${ctx.domain}: ${label} — согласование поставлено в очередь, операция ${operation.operationId}, попытка ${attempts} из ${TMC_APPROVAL_MAX_ATTEMPTS}`,
        );
        if (attempts >= TMC_APPROVAL_MAX_ATTEMPTS) {
            this.logger.warn(
                `${ctx.domain}: ${label} — последняя попытка подстраховки; если презентация снова не появится, заявку нужно провести вручную`,
                { telegram: true, domain: ctx.domain },
            );
        }
        return 'dispatched';
    }

    /** Коды стадий из настройки → id стадий РПА на портале (по `code` из `rpa.stage.listForType`). */
    private async resolveStageIds(
        bitrix: BitrixService,
        typeId: number,
        codes: string[],
        result: TmcApprovalRescueRunResult,
    ): Promise<number[]> {
        const stages = await this.listStages(bitrix, typeId);
        const wanted = new Set(codes);
        const ids = stages
            .filter(stage => wanted.has(String(stage.code)))
            .map(stage => Number(stage.id))
            .filter(id => id > 0);
        if (!ids.length) {
            const known =
                stages
                    .map(stage => `${String(stage.code)} «${stage.name}»`)
                    .join(', ') || 'ни одной';
            result.warnings.push(
                `стадии ${codes.join(', ')} в РПА «Заявка на презентацию» не найдены (на портале: ${known})`,
            );
        }
        return ids;
    }

    private async listStages(
        bitrix: BitrixService,
        typeId: number,
    ): Promise<IBxRpaStage[]> {
        const response = (await bitrix.rpaStage.listForType(typeId)) as
            | { result?: { stages?: IBxRpaStage[] } }
            | null
            | undefined;
        return response?.result?.stages ?? [];
    }

    /**
     * Утверждённые заявки окна просмотра, свежие первыми: лимит за прогон
     * должен уходить на то, что утвердили только что. Стадии опрашиваются
     * по одной — массив в фильтре `stageId` у устаревшего `rpa.item.list`
     * не обещан.
     */
    private async listApproved(
        bitrix: BitrixService,
        typeId: number,
        stageIds: number[],
        since: Date,
        tz: ETimeZone,
    ): Promise<IBxRpaItem[]> {
        const sinceFilter = dayjs(since).tz(tz).format('YYYY-MM-DDTHH:mm:ssZ');
        const rows: IBxRpaItem[] = [];
        for (const stageId of stageIds) {
            let start: number | undefined;
            for (let page = 0; page < PAGE_LIMIT; page++) {
                const response = await bitrix.rpaItem.list({
                    typeId,
                    filter: { stageId, '>=movedTime': sinceFilter },
                    order: { movedTime: 'DESC' },
                    ...(start !== undefined ? { start } : {}),
                });
                const items = response?.result?.items ?? [];
                rows.push(...items);
                if (!items.length || !response?.next) break;
                start = Number(response.next);
            }
        }
        const movedMs = (row: IBxRpaItem): number =>
            BitrixDateTime.fromBitrixField(row.movedTime, tz)
                ?.toDayjs()
                .valueOf() ?? 0;
        return rows.sort((a, b) => movedMs(b) - movedMs(a));
    }

    /**
     * Заявка без обязательных полей: провести нельзя, робот с ней тоже не
     * справился бы. Предупреждаем раз в сутки на заявку — не каждые
     * полчаса.
     */
    private async noteInvalid(
        domain: string,
        mapped: Extract<ApprovedRpaMapping, { ok: false }>,
    ): Promise<void> {
        const ref = this.ref(domain, invalidMarkerKey(mapped.rpaItemId));
        if (await this.appCache.get<{ reason: string }>(ref)) return;
        this.logger.warn(
            `${domain}: заявка РПА ${mapped.rpaItemId} утверждена, но ${mapped.reason} — подстраховка её не проведёт`,
            { telegram: true, domain },
        );
        await this.appCache.set({
            ...ref,
            group: 'invalid',
            data: { reason: mapped.reason },
            ttlSeconds: INVALID_TTL_SECONDS,
        });
    }

    private ref(domain: string, key: string) {
        return { app: TMC_APPROVAL_CACHE_APP, domain, key };
    }
}
