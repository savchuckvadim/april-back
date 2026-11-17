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
} from '@lib/sales-ai-analytics';
import { DealAuditDigestDelivery } from '../../deal-audit/services/deal-audit-digest-delivery';
import type { DealAuditDigestOptions } from '../../deal-audit/services/deal-audit-digest.service';
import { DealAuditSettingsService } from '../../deal-audit/services/deal-audit-settings.service';
import { ActiveStaffService } from '../../shared/active-staff/active-staff.service';
import { DEAL_MOVEMENT_DIGEST } from '../constants/deal-movement.const';
import {
    buildDealMovementDigest,
    shouldSendDealMovementDigest,
} from '../lib/deal-movement-digest.formatter';
import type {
    DealMovementDigestDeal,
    DealMovementDigestOptions,
} from '../types/deal-movement.types';
import { DealMovementNightCounters } from './deal-movement-night-counters';

export interface DealMovementDigestRequest {
    readonly domain: string;
    /** День портала 'YYYY-MM-DD': заголовок сводки и отметка «уже слали». */
    readonly day: string;
    readonly options: DealMovementDigestOptions;
    /** Оценённые сделки ночи (все статусы — для счёта в шапке). */
    readonly deals: readonly DealMovementDigestDeal[];
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
 * волна, часть Б, 17.11.2026).
 *
 * Получатели и каналы — те же, что у сводки аудита сделок
 * (`DealAuditSettingsService`): выбор — `routeRecipients` из
 * `@lib/rop-reports` (запись — сделка, владелец — ответственный, «шире
 * побеждает», сироты не рассылаются), неработающим не уходит. Доставка —
 * классом аудита со своими тегом уведомления и меткой задачи. Один раз за
 * день портала (отметка в Redis ставится ДО рассылки: лучше потерять
 * сводку при сбое, чем прислать её дважды).
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
        private readonly counters: DealMovementNightCounters,
    ) {}

    async send(
        request: DealMovementDigestRequest,
        warnings: string[],
    ): Promise<DealMovementDigestSummary> {
        const { domain, day, options } = request;
        if (!options.enabled) {
            return skippedDealMovementDigest(
                false,
                DEAL_MOVEMENT_DIGEST_SKIP.disabled,
            );
        }
        const audit = (await this.auditSettings.resolveOptions(domain)).digest;
        const settings = recipientSettingsOf(audit);
        if (!hasRopRecipients(settings)) {
            return skippedDealMovementDigest(
                true,
                DEAL_MOVEMENT_DIGEST_SKIP.noRecipients,
            );
        }
        if (!(await this.counters.claimDigest(domain, day))) {
            return skippedDealMovementDigest(
                true,
                DEAL_MOVEMENT_DIGEST_SKIP.alreadySent,
            );
        }
        const excluded = new Set(audit.excludeUserIds);
        const departments = await loadSalesDepartments(
            this.departments,
            domain,
            warnings,
        );
        const due = routeRecipients(
            {
                items: request.deals.filter(
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
        if (due.length === 0) {
            return {
                enabled: true,
                skipped: null,
                recipients: 0,
                sent: 0,
                failed: 0,
            };
        }

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
        let sent = 0;
        for (const bucket of working) {
            const digest = buildDealMovementDigest({
                domain,
                day,
                deals: bucket.items,
                top: options.top,
                userNames,
            });
            if (
                digest &&
                (await delivery.deliver(bucket.userId, digest, warnings))
            ) {
                sent += 1;
            }
        }
        this.logger.log(
            `[deal-movement] ${domain}: сводок руководителям доставлено ${sent} из ${working.length}`,
        );
        return {
            enabled: true,
            skipped: null,
            recipients: working.length,
            sent,
            failed: working.length - sent,
        };
    }
}
