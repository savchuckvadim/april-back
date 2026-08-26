import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { PBXService } from '@/modules/pbx';
import { IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { ColdHookSilinceEndpointService } from '../../cold-hook/services/silence/cold-hook-silince-endpoint.service';
import {
    EnumColdCallEntityType,
    EnumColdCallIsTmc,
} from '../../cold-hook/dto/cold.dto';
import { composeStageId } from '../../event-report/services/deal/deal-target-stage.calculator';
import { RejectReviveResponsibleResolver } from './reject-revive-responsible.resolver';
import {
    RejectReviveOptions,
    RejectReviveRunResult,
} from './dto/reject-revive.types';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const CRM_DATETIME_FORMAT = 'DD.MM.YYYY HH:mm:ss';
const CRM_DATE_FORMAT = 'DD.MM.YYYY';
/** Во сколько (локаль портала) назначается реанимационный звонок на завтра. */
const REVIVE_CALL_HOUR = 10;

/** Коды маркер-полей реанимации (deal-only, self-gated по слепку). */
const QUEUED_AT_CODE = 'op_xo_revive_queued_at';
const SENT_AT_CODE = 'op_xo_revive_sent_at';
const POST_FAIL_DATE_CODE = 'post_fail_date';

type BxRow = Record<string, unknown>;

/**
 * Реанимация отказников: сделки основной воронки в отказных стадиях
 * (Отказ / Не состоялась / Не ЦА) возвращаются в работу постановкой
 * холодного звонка cold-call хуком — через интервал либо по перебивающей
 * дате post_fail_date.
 *
 * Подстраховка ДВУХФАЗНАЯ и переживает падение хука (требование владельца):
 *  1) сделка получает устойчивый маркер `op_xo_revive_queued_at` ДО отправки;
 *  2) хук принят буфером → `op_xo_revive_sent_at`.
 * Падение между шагами оставляет сделку «недоехавшей» — следующий тик
 * находит такие (queued старше порога, sent пуст) и досылает.
 *
 * Сделка НЕ открывается и стадия НЕ меняется: маркеры — UF-поля, Bitrix
 * разрешает их запись на закрытой сделке. Повторный отказ чистит маркеры
 * (sales-base-deal.failFields) — клиент реанимируется снова через интервал.
 *
 * Silence-буфер cold-hook НЕ дедупит — вся идемпотентность на маркерах.
 */
@Injectable()
export class RejectReviveService {
    private readonly logger = new Logger(RejectReviveService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly coldHook: ColdHookSilinceEndpointService,
    ) {}

    async runForDomain(
        domain: string,
        opts: RejectReviveOptions,
    ): Promise<RejectReviveRunResult> {
        const result: RejectReviveRunResult = {
            resent: 0,
            queued: 0,
            revived: 0,
            warnings: [],
        };

        const { bitrix, PortalModel: portal } = await this.pbx.init(domain);

        const category = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (!category) {
            result.warnings.push('воронка sales_base не настроена');
            return result;
        }

        const queuedName = this.fieldName(portal, QUEUED_AT_CODE);
        const sentName = this.fieldName(portal, SENT_AT_CODE);
        if (!queuedName || !sentName) {
            // Self-gate: без маркер-полей двухфазность не собрать — фича
            // молчит, пока владелец не установит поля (памятка в README).
            result.warnings.push(
                'маркер-поля op_xo_revive_* не установлены — реанимация пропущена',
            );
            return result;
        }
        const postFailName = opts.usePostFailDate
            ? this.fieldName(portal, POST_FAIL_DATE_CODE)
            : null;

        const failStageIds = this.failStageIds(category);
        if (!failStageIds.length) {
            result.warnings.push('отказные стадии sales_base не найдены');
            return result;
        }

        const tz = portal.getTimezone();
        const select = [
            'ID',
            'TITLE',
            'ASSIGNED_BY_ID',
            'COMPANY_ID',
            'CLOSEDATE',
            queuedName,
            sentName,
            ...(postFailName ? [postFailName] : []),
        ];
        const resolver = new RejectReviveResponsibleResolver(bitrix, portal);
        let budget = Math.max(1, opts.maxPerRun);

        // === Фаза A: досылка «недоехавших» (хук упал после queued) ===
        const resendThreshold = dayjs()
            .tz(tz)
            .subtract(opts.resendAfterMinutes, 'minute');
        const stuck = await this.listDeals(
            bitrix,
            {
                CATEGORY_ID: String(category.bitrixId),
                STAGE_ID: failStageIds,
                [`!${queuedName}`]: '',
            },
            select,
            result.warnings,
        );
        for (const deal of stuck) {
            if (budget <= 0) break;
            if (this.text(deal[sentName])) continue;
            const queuedAt = this.parsePortalDate(deal[queuedName], tz);
            if (!queuedAt || queuedAt.isAfter(resendThreshold)) continue;

            budget -= 1;
            const ok = await this.dispatchHook(
                domain,
                bitrix,
                portal,
                resolver,
                deal,
                opts,
                sentName,
                result.warnings,
            );
            if (ok) {
                result.resent += 1;
                result.revived += 1;
            }
        }

        // === Фаза B: новые кандидаты (интервал либо перебивающая дата) ===
        const candidates = await this.collectCandidates(
            bitrix,
            category.bitrixId,
            failStageIds,
            select,
            opts,
            postFailName,
            tz,
            result.warnings,
        );
        for (const deal of candidates) {
            if (budget <= 0) break;
            if (this.text(deal[queuedName]) || this.text(deal[sentName])) {
                continue;
            }

            budget -= 1;
            // Маркер ДО отправки: упавший хук оставит сделку «недоехавшей»,
            // и фаза A следующего тика дошлёт её.
            const queuedStamp = dayjs().tz(tz).format(CRM_DATETIME_FORMAT);
            try {
                await bitrix.deal.update(Number(deal.ID), {
                    [queuedName]: queuedStamp,
                } as never);
            } catch (error) {
                result.warnings.push(
                    `сделка ${deal.ID}: queued_at не записан (${(error as Error).message})`,
                );
                continue;
            }
            result.queued += 1;

            const ok = await this.dispatchHook(
                domain,
                bitrix,
                portal,
                resolver,
                deal,
                opts,
                sentName,
                result.warnings,
            );
            if (ok) result.revived += 1;
        }

        this.logger.log(
            `[reject-revive] ${domain}: resent=${result.resent} ` +
                `queued=${result.queued} revived=${result.revived}` +
                (result.warnings.length
                    ? ` warnings=${result.warnings.length}`
                    : ''),
        );
        return result;
    }

    /** Отправка cold-call хука + отметка sent_at. true — хук принят. */
    private async dispatchHook(
        domain: string,
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        portal: PortalModel,
        resolver: RejectReviveResponsibleResolver,
        deal: BxRow,
        opts: RejectReviveOptions,
        sentName: string,
        warnings: string[],
    ): Promise<boolean> {
        const tz = portal.getTimezone();
        const assignedById = Number(deal.ASSIGNED_BY_ID) || 0;
        const responsibleId = await resolver.resolve(
            opts.assignMode,
            assignedById,
            warnings,
        );
        if (!responsibleId) {
            warnings.push(`сделка ${deal.ID}: некому назначить — пропуск`);
            return false;
        }

        const companyId = Number(deal.COMPANY_ID) || 0;
        const deadline = dayjs()
            .tz(tz)
            .add(1, 'day')
            .hour(REVIVE_CALL_HOUR)
            .minute(0)
            .second(0)
            .format(CRM_DATETIME_FORMAT);

        try {
            await this.coldHook.createColdCallHook(domain, {
                entityType: companyId
                    ? EnumColdCallEntityType.COMPANY
                    : EnumColdCallEntityType.DEAL,
                entityId: String(companyId || deal.ID),
                responsible: `user_${responsibleId}`,
                created: `user_${responsibleId}`,
                deadline,
                name: `Реанимация отказа: ${this.text(deal.TITLE) ?? deal.ID}`,
                isTmc: EnumColdCallIsTmc.N,
            });
        } catch (error) {
            warnings.push(
                `сделка ${deal.ID}: cold-call хук упал (${(error as Error).message}) — дошлётся следующим тиком`,
            );
            return false;
        }

        try {
            await bitrix.deal.update(Number(deal.ID), {
                [sentName]: dayjs().tz(tz).format(CRM_DATETIME_FORMAT),
            } as never);
        } catch (error) {
            // Хук уже принят: без sent_at следующий тик дошлёт ПОВТОРНО —
            // единственное окно двойной задачи, принято by design (README).
            warnings.push(
                `сделка ${deal.ID}: sent_at не записан (${(error as Error).message}) — возможна повторная отправка`,
            );
        }
        return true;
    }

    /** Кандидаты фазы B: по интервалу от закрытия и/или по post_fail_date. */
    private async collectCandidates(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        categoryBitrixId: number | string,
        failStageIds: string[],
        select: string[],
        opts: RejectReviveOptions,
        postFailName: string | null,
        tz: string,
        warnings: string[],
    ): Promise<BxRow[]> {
        const byId = new Map<string, BxRow>();

        // Перебивающая дата — приоритетнее интервала: такие сделки идут первыми.
        if (postFailName) {
            const today = dayjs().tz(tz).format(CRM_DATE_FORMAT);
            const rows = await this.listDeals(
                bitrix,
                {
                    CATEGORY_ID: String(categoryBitrixId),
                    STAGE_ID: failStageIds,
                    [`!${postFailName}`]: '',
                    [`<=${postFailName}`]: today,
                },
                select,
                warnings,
            );
            for (const row of rows) byId.set(String(row.ID), row);
        }

        const closedBefore = dayjs()
            .tz(tz)
            .subtract(opts.intervalDays, 'day')
            .format(CRM_DATE_FORMAT);
        const rows = await this.listDeals(
            bitrix,
            {
                CATEGORY_ID: String(categoryBitrixId),
                STAGE_ID: failStageIds,
                '<CLOSEDATE': closedBefore,
            },
            select,
            warnings,
        );
        for (const row of rows) {
            const id = String(row.ID);
            if (byId.has(id)) continue;
            // Заполненная перебивающая дата исключает сделку из интервальной
            // ветки: владелец назначил свой срок — интервал её не трогает.
            if (postFailName && this.text(row[postFailName])) continue;
            byId.set(id, row);
        }
        return [...byId.values()];
    }

    private async listDeals(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        filter: Record<string, unknown>,
        select: string[],
        warnings: string[],
    ): Promise<BxRow[]> {
        try {
            const response = await bitrix.deal.getList(
                filter as Partial<IBXDeal>,
                select,
            );
            return ((response?.result ?? []) as BxRow[]).filter(Boolean);
        } catch (error) {
            warnings.push(`crm.deal.list упал: ${(error as Error).message}`);
            return [];
        }
    }

    /** STAGE_ID отказных стадий (fail / apology / not_ca) в нотации C{n}:{X}. */
    private failStageIds(category: {
        bitrixId: number | string;
        stages: Array<{ code: string; bitrixId: string }>;
    }): string[] {
        const codes: string[] = [
            PBX_DEAL_SALES_BASE_STAGE_CODE.fail,
            PBX_DEAL_SALES_BASE_STAGE_CODE.apology,
            PBX_DEAL_SALES_BASE_STAGE_CODE.notCa,
        ];
        return codes
            .map(code => category.stages.find(stage => stage.code === code))
            .filter((stage): stage is { code: string; bitrixId: string } =>
                Boolean(stage),
            )
            .map(stage => composeStageId(category.bitrixId, stage.bitrixId));
    }

    private fieldName(portal: PortalModel, code: string): string | null {
        const field = portal.getEntityFieldByCode('deal', code);
        return field ? portal.getFieldBitrixId(field) : null;
    }

    /** CRM отдаёт либо портальный формат, либо ISO с оффсетом. */
    private parsePortalDate(raw: unknown, tz: string): dayjs.Dayjs | null {
        const value = this.text(raw);
        if (!value) return null;
        const crm = dayjs.tz(value, CRM_DATETIME_FORMAT, tz);
        if (crm.isValid()) return crm;
        const iso = dayjs(value);
        return iso.isValid() ? iso : null;
    }

    private text(raw: unknown): string | null {
        if (typeof raw !== 'string') return null;
        const value = raw.trim();
        return value || null;
    }
}
