import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { BxDepartmentService } from '@lib/bx-department';
import {
    hasRopRecipients,
    keepWorkingRecipients,
    loadSalesDepartments,
    ROP_MERGE_POLICY,
    ROP_ORPHAN_POLICY,
    routeRecipients,
    userNamesOf,
    type RopRecipientSettings,
} from '@lib/rop-reports';
import {
    DEAL_MOVEMENT_DIGEST_SKIP,
    skippedDealMovementDigest,
    type DealMovementDigestSummary,
    type DealMovementStateEntry,
} from '@lib/sales-ai-analytics';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import type { DealAuditFrequency } from '../../deal-audit/lib/deal-audit-schedule';
import { DealAuditDigestDelivery } from '../../deal-audit/services/deal-audit-digest-delivery';
import type { DealAuditDigestOptions } from '../../deal-audit/services/deal-audit-digest.service';
import { DealAuditFindingsStore } from '../../deal-audit/services/deal-audit-findings.store';
import { DealAuditSettingsService } from '../../deal-audit/services/deal-audit-settings.service';
import { ActiveStaffService } from '../../shared/active-staff/active-staff.service';
import { DEAL_MOVEMENT_DIGEST } from '../constants/deal-movement.const';
import { dealAuditNotesOf } from '../lib/deal-movement-audit-note';
import { withDealAuditNotes } from '../lib/deal-movement-digest-deals';
import {
    buildDealMovementDigest,
    shouldSendDealMovementDigest,
} from '../lib/deal-movement-digest.formatter';
import {
    buildDealMovementPeriodDigest,
    reminderDealMovementDigestDeals,
} from '../lib/deal-movement-period-digest.formatter';
import type {
    DealMovementDigestDeal,
    DealMovementDigestOptions,
} from '../types/deal-movement.types';
import { DealMovementDigestSchedule } from './deal-movement-digest.schedule';

export interface DealMovementDigestRequest {
    readonly domain: string;
    /** День портала 'YYYY-MM-DD': заголовок сводки и отметка «уже слали». */
    readonly day: string;
    /** Момент прогона — от него меряется свежесть находок аудита. */
    readonly now: Date;
    readonly options: DealMovementDigestOptions;
    /** Оценённые сделки ночи (все статусы — для счёта в шапке). */
    readonly deals: readonly DealMovementDigestDeal[];
    /** Состояние ночи: в нём запоминается ступень показанных напоминаний. */
    readonly state: ReadonlyMap<string, DealMovementStateEntry>;
}

/** Получатели аудита сделок → адресаты отчёта РОПу. */
const recipientSettingsOf = (
    digest: DealAuditDigestOptions,
): RopRecipientSettings => ({
    toHead: digest.toHead,
    toEmployee: digest.toManager,
    departmentUserIds: digest.departmentUserIds,
    structureUserIds: digest.userIds,
});

/**
 * Сводка «Движение сделок» руководителям после ночного счёта (вторая
 * волна, часть Б, 17.11.2026; режимы за период — 20.11.2026).
 *
 * Получатели и каналы — те же, что у сводки аудита сделок
 * (`DealAuditSettingsService`): выбор — `routeRecipients` из
 * `@lib/rop-reports` (запись — сделка, владелец — ответственный, «шире
 * побеждает», сироты не рассылаются), неработающим не уходит. Доставка —
 * классом аудита со своими тегом уведомления и меткой задачи.
 *
 * Ежедневные режимы — один раз за день портала. Режимы «раз в неделю» и
 * «раз в две недели» — только в выбранный день недели и не чаще периода;
 * в них — блок «Давно без продвижения», показанные напоминания
 * запоминаются в состоянии сделки (каждая ступень — один раз). Отметки —
 * в Redis ДО рассылки: лучше потерять сводку при сбое, чем прислать её
 * дважды. Свежие находки аудита сделок — пометкой у сделки и числом в
 * шапке; статус они не меняют (решение 18.11.2026).
 *
 * `@Injectable`, но инстанс Битрикса живёт только внутри вызова (CLAUDE.md).
 */
@Injectable()
export class DealMovementDigestService {
    private readonly logger = new Logger(DealMovementDigestService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly departments: BxDepartmentService,
        private readonly staff: ActiveStaffService,
        private readonly auditSettings: DealAuditSettingsService,
        private readonly findings: DealAuditFindingsStore,
        private readonly schedule: DealMovementDigestSchedule,
    ) {}

    async send(
        request: DealMovementDigestRequest,
        warnings: string[],
    ): Promise<DealMovementDigestSummary> {
        const { domain, options } = request;
        if (!options.enabled) {
            return skippedDealMovementDigest(
                false,
                DEAL_MOVEMENT_DIGEST_SKIP.disabled,
            );
        }
        const auditOptions = await this.auditSettings.resolveOptions(domain);
        const audit = auditOptions.digest;
        const settings = recipientSettingsOf(audit);
        if (!hasRopRecipients(settings)) {
            return skippedDealMovementDigest(
                true,
                DEAL_MOVEMENT_DIGEST_SKIP.noRecipients,
            );
        }
        const claim = await this.schedule.claim(request);
        if (claim.skipped !== null) {
            return skippedDealMovementDigest(true, claim.skipped);
        }
        const period = claim.period;
        const deals = withDealAuditNotes(
            request.deals,
            await this.auditNotes(
                domain,
                request.now,
                auditOptions.frequency,
                warnings,
            ),
        );
        const auditForgotten = deals.filter(deal => deal.audit !== null).length;
        const excluded = new Set(audit.excludeUserIds);
        const departments = await loadSalesDepartments(
            this.departments,
            domain,
            warnings,
        );
        const due = routeRecipients(
            {
                items: deals.filter(
                    deal =>
                        deal.assignedById === null ||
                        !excluded.has(deal.assignedById),
                ),
                keyOf: deal => deal.dealId,
                ownersOf: deal =>
                    deal.assignedById === null ? [] : [deal.assignedById],
                departments,
                settings,
                merge: ROP_MERGE_POLICY.widest,
                orphans: ROP_ORPHAN_POLICY.ignore,
                itemsLabel: 'сделок',
            },
            warnings,
        ).filter(bucket =>
            shouldSendDealMovementDigest(bucket.items, options.mode),
        );
        const summary: DealMovementDigestSummary = {
            enabled: true,
            skipped: null,
            recipients: 0,
            sent: 0,
            failed: 0,
            auditForgotten,
            ...(period === null ? {} : { reminders: 0 }),
        };
        if (due.length === 0) return summary;

        const { bitrix, PortalModel } = await this.pbx.init(domain);
        const working = await keepWorkingRecipients(
            due,
            this.staff,
            domain,
            bitrix,
            warnings,
        );
        const delivery = new DealAuditDigestDelivery(
            bitrix,
            audit.channels,
            PortalModel.getTimezone(),
            {
                notifyTag: DEAL_MOVEMENT_DIGEST.notifyTag,
                taskMark: DEAL_MOVEMENT_DIGEST.taskMark,
            },
        );
        const userNames = userNamesOf(departments);
        const reminded = new Map<string, number>();
        let sent = 0;
        for (const bucket of working) {
            const scope = { domain, deals: bucket.items, userNames };
            const digest =
                period === null
                    ? buildDealMovementDigest({
                          ...scope,
                          day: request.day,
                          top: options.top,
                      })
                    : buildDealMovementPeriodDigest({
                          ...scope,
                          day: request.day,
                          top: options.top,
                          ...period,
                      });
            if (
                !digest ||
                !(await delivery.deliver(bucket.userId, digest, warnings))
            ) {
                continue;
            }
            sent += 1;
            if (period === null) continue;
            for (const deal of reminderDealMovementDigestDeals(
                bucket.items,
                options.top,
            )) {
                if (deal.remindStep !== null) {
                    reminded.set(deal.dealId, deal.remindStep);
                }
            }
        }
        await this.schedule.markReminded(
            domain,
            request.state,
            reminded,
            warnings,
        );
        this.logger.log(
            `[deal-movement] ${domain}: сводок руководителям доставлено ${sent} из ${working.length}`,
        );
        return {
            ...summary,
            recipients: working.length,
            sent,
            failed: working.length - sent,
            ...(period === null ? {} : { reminders: reminded.size }),
        };
    }

    /**
     * Свежие находки аудита сделок пометками по id сделки. Не прочиталось —
     * сводка уходит без пометок, причина — в предупреждениях.
     */
    private async auditNotes(
        domain: string,
        now: Date,
        frequency: DealAuditFrequency,
        warnings: string[],
    ): Promise<Map<string, string>> {
        try {
            return dealAuditNotesOf(
                await this.findings.load(domain),
                now,
                frequency,
            );
        } catch (error) {
            warnings.push(
                `находки аудита сделок не прочитаны — сводка без пометок: ${getErrorString(error)}`,
            );
            return new Map();
        }
    }
}
