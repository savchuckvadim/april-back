import { Injectable } from '@nestjs/common';
import {
    DEAL_MOVEMENT_DIGEST_SKIP,
    skippedDealMovementDigest,
    type DealMovementDigestSummary,
    type DealMovementNightPlan,
    type DealMovementRunPhase,
    type DealMovementRunStatus,
} from '@lib/sales-ai-analytics';
import type { ETimeZone } from '@lib/shared/lib/date';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import { DEAL_MOVEMENT_NOTES } from '../constants/deal-movement.const';
import { buildDealMovementDigestDeals } from '../lib/deal-movement-digest-deals';
import type { DealMovementOptions } from '../types/deal-movement.types';
import { DealMovementDigestService } from './deal-movement-digest.service';
import type { DealMovementEvaluation } from './deal-movement-evaluator.service';
import { DealMovementNotesService } from './deal-movement-notes.service';

export interface DealMovementPublishInput {
    readonly domain: string;
    /** День портала 'YYYY-MM-DD'. */
    readonly day: string;
    /** Момент прогона: от него меряется свежесть находок аудита. */
    readonly now: Date;
    readonly timezone: ETimeZone;
    /**
     * Ночной счёт по расписанию: только он пишет в ленты и шлёт сводку
     * руководителям. Ручной счёт из админки оставляет всё до ночи.
     */
    readonly nightly: boolean;
    readonly options: DealMovementOptions;
    readonly evaluation: DealMovementEvaluation;
    readonly plan: DealMovementNightPlan;
    /** Состояние прогона: итог записей растёт по ходу, сюда же — сводка. */
    readonly status: DealMovementRunStatus;
    /** Фаза прогона: продлить замок и сохранить ход. */
    readonly onPhase: (phase: DealMovementRunPhase) => Promise<void>;
}

/**
 * Что прогон счёта отдаёт людям после сохранения состояния: записи в
 * ленты сделок, затем сводка руководителям. Оба — только у ночного счёта
 * по расписанию (решения 17.11.2026). Сбой сводки прогон не роняет: она
 * вторична, причина — в предупреждениях.
 *
 * `@Injectable` без bitrix-состояния: Битрикс — внутри сервисов записи и
 * сводки на вызов.
 */
@Injectable()
export class DealMovementPublishService {
    constructor(
        private readonly notes: DealMovementNotesService,
        private readonly digest: DealMovementDigestService,
    ) {}

    /** Сделки, которым ушла запись в ленту (для пометки в снимке). */
    async publish(
        input: DealMovementPublishInput,
    ): Promise<ReadonlySet<string>> {
        const notified = await this.writeNotes(input);
        input.status.digest = await this.sendDigest(input);
        return notified;
    }

    /** Записи в ленту по плану; ручной счёт и пустой план — ничего. */
    private async writeNotes(
        input: DealMovementPublishInput,
    ): Promise<ReadonlySet<string>> {
        const summary = input.status.notes;
        if (
            summary === undefined ||
            !input.nightly ||
            input.plan.toNotify.length === 0
        ) {
            return new Set();
        }
        await input.onPhase('notes');
        const outcome = await this.notes.write({
            domain: input.domain,
            day: input.day,
            timezone: input.timezone,
            plan: input.plan,
            verdicts: input.evaluation.verdicts,
            pointers: input.evaluation.pointers,
            options: input.options.notes,
            summary,
            // notifiedAt — момент самой записи, а не старт прогона.
            clock: () => new Date(),
            pauseMs: DEAL_MOVEMENT_NOTES.pauseMs,
            onProgress: () => input.onPhase('notes'),
        });
        input.status.warnings.push(...outcome.warnings);
        return outcome.written;
    }

    /** Сводка руководителям — только после ночного счёта, один раз в день. */
    private async sendDigest(
        input: DealMovementPublishInput,
    ): Promise<DealMovementDigestSummary> {
        const { enabled } = input.options.digest;
        if (!enabled) {
            return skippedDealMovementDigest(
                false,
                DEAL_MOVEMENT_DIGEST_SKIP.disabled,
            );
        }
        if (!input.nightly) {
            return skippedDealMovementDigest(
                true,
                DEAL_MOVEMENT_DIGEST_SKIP.manual,
            );
        }
        await input.onPhase('digest');
        try {
            return await this.digest.send(
                {
                    domain: input.domain,
                    day: input.day,
                    now: input.now,
                    options: input.options.digest,
                    deals: buildDealMovementDigestDeals(
                        input.evaluation.deals,
                        input.plan.changes,
                        input.plan.state,
                    ),
                    state: input.plan.state,
                },
                input.status.warnings,
            );
        } catch (error) {
            input.status.warnings.push(
                `сводка руководителям не разослана: ${getErrorString(error)}`,
            );
            return {
                enabled: true,
                skipped: null,
                recipients: 0,
                sent: 0,
                failed: 0,
            };
        }
    }
}
