import { Injectable, Logger } from '@nestjs/common';
import {
    DuplicateEntityType,
    SignalFieldMapService,
} from '@lib/portal-lib/pbx-duplicate';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { toTimelineCommentDirect } from '@lib/bitrix/consts/timeline.consts';
import { BitrixEntityType } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import { EnumSalesHookSource } from '../../core/contracts/sales-hook-job.type';
import { SalesHookExecutionContext } from '../../core/contracts/sales-hook-use-case.contract';
import { SalesHookDispatchService } from '../../core/services/sales-hook-dispatch.service';
import { SalesHookIdempotencyService } from '../../core/services/sales-hook-idempotency.service';
import { buildTransferWorkItem } from '../../transfer-work/dto/transfer-work.dto';
import {
    IRepeatLeadNote,
    REPEAT_JOIN_MODES,
    RepeatJoinMode,
} from '../lib/repeat-work-routing';
import { IRepeatJoinNotice } from '../lib/repeat-join-notice';
import {
    dryRunNoteLines,
    RepeatNoticeNames,
} from '../lib/repeat-join-notice.texts';
import {
    IRepeatFinderLead,
    IRepeatFindOutcome,
    RepeatWorkFinderService,
} from './repeat-work-finder.service';
import { LeadToWorkRepeatNoticeService } from './lead-to-work-repeat-notice.service';

/**
 * ПОВТОРНАЯ ЗАЯВКА на входе (решения владельца 28.09 и 01.10.2026) — всё,
 * что хуку «лид → работа» нужно вокруг присоединения, кроме самой записи
 * (её ставит LeadToWorkFlowService.queueJoin в группу лида):
 *  - режим из настроек портала (off | dry_run | on);
 *  - поиск работы клиента (RepeatWorkFinderService, batch-чтение);
 *  - комментарии холостого хода в таймлайн лида;
 *  - оповещения, когда открытых сделок было несколько (комментарии в
 *    сделки и лид, менеджерам и руководителям — LeadToWorkRepeatNoticeService);
 *  - передача основной сделки, если её владелец больше не работает.
 *
 * @Injectable без состояния: инстанс Битрикса приходит в ctx вызова.
 */
@Injectable()
export class LeadToWorkRepeatService {
    private readonly logger = new Logger(LeadToWorkRepeatService.name);

    constructor(
        private readonly appSettings: PortalAppSettingsService,
        private readonly fieldMap: SignalFieldMapService,
        private readonly dispatch: SalesHookDispatchService,
        private readonly idempotency: SalesHookIdempotencyService,
        private readonly notice: LeadToWorkRepeatNoticeService,
    ) {}

    async mode(domain: string): Promise<RepeatJoinMode> {
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.eventSales,
            );
            const raw = String(settings.leadIntakeRepeatJoinMode ?? 'off');
            return (REPEAT_JOIN_MODES as readonly string[]).includes(raw)
                ? (raw as RepeatJoinMode)
                : 'off';
        } catch (error) {
            this.logger.warn(
                `[repeat] ${domain}: настройка не прочитана (${(error as Error).message}) — выключено`,
            );
            return 'off';
        }
    }

    /**
     * Поиск работы клиента для пачки. ЧИТАЕТ через общую карту batch-команд
     * `ctx.bitrix` — звать строго до первой записи буфера.
     */
    async find(
        ctx: SalesHookExecutionContext,
        leads: readonly IRepeatFinderLead[],
    ): Promise<Map<number, IRepeatFindOutcome>> {
        if (!leads.length) return new Map();
        const [lead, deal, company] = await Promise.all([
            this.fieldMap.getInnEntityFields(
                ctx.domain,
                DuplicateEntityType.LEAD,
            ),
            this.fieldMap.getInnEntityFields(
                ctx.domain,
                DuplicateEntityType.DEAL,
            ),
            this.fieldMap.getInnEntityFields(
                ctx.domain,
                DuplicateEntityType.COMPANY,
            ),
        ]);
        const finder = new RepeatWorkFinderService(ctx.bitrix, ctx.portal, {
            lead,
            deal,
            company,
        });
        try {
            return await finder.find(leads);
        } catch (error) {
            // Поиск — предохранитель, а не условие: упал — вход как раньше.
            this.logger.warn(
                `[repeat] ${ctx.domain}: поиск повторной заявки не удался — ${(error as Error).message}`,
            );
            return new Map();
        }
    }

    /**
     * Всё, что пишется о повторных заявках ПОСЛЕ записи, прямыми вызовами
     * (сбой — в предупреждения, операция не падает):
     *  - холостой ход — «присоединил бы…» в таймлайн лида (к единственной
     *    открытой либо к самой свежей из нескольких);
     *  - присоединение к самой свежей из нескольких открытых — комментарии
     *    в сделки и лид, уведомления менеджерам и руководителям.
     */
    async writeNotes(
        ctx: SalesHookExecutionContext,
        input: {
            notes: readonly IRepeatLeadNote[];
            notices: readonly IRepeatJoinNotice[];
            names: RepeatNoticeNames;
        },
    ): Promise<string[]> {
        const warnings: string[] = [];
        for (const note of input.notes) {
            if (note.mode !== 'dry_run') continue;
            const lines = dryRunNoteLines(
                ctx.domain,
                note.resolution,
                input.names,
            );
            if (!lines.length) continue;
            try {
                await ctx.bitrix.timeline.addTimelineComment({
                    ENTITY_ID: note.leadId,
                    ENTITY_TYPE: BitrixEntityType.LEAD,
                    COMMENT: toTimelineCommentDirect(lines),
                });
            } catch (error) {
                warnings.push(
                    `Лид ${note.leadId}: комментарий о повторной заявке не записан — ${(error as Error).message}`,
                );
            }
        }
        warnings.push(
            ...(await this.notice.send(ctx, input.notices, input.names)),
        );
        return warnings;
    }

    /**
     * Владелец основной сделки больше не работает → штатная «передача
     * работы» новому ответственному (задачи, контакты, лиды, дела сделки).
     * Только `dealIds`, НЕ `companyId`: иначе закрылась бы живая ХО-сделка
     * компании (правило transfer-work для спутников).
     */
    async transferMainDeal(
        ctx: SalesHookExecutionContext,
        mainDealId: number,
        newResponsibleId: number,
    ): Promise<string | null> {
        const item = buildTransferWorkItem('give', {
            domain: ctx.domain,
            dealIds: [mainDealId],
            newResponsibleId,
        } as never);
        const entityKey = `deal:${mainDealId}`;
        try {
            const operation = await this.dispatch.accept(
                EnumSalesHookCode.TRANSFER_WORK,
                ctx.domain,
                EnumSalesHookSource.ROBOT,
                [
                    {
                        entityKey,
                        fingerprint: this.idempotency.fingerprint(
                            EnumSalesHookCode.TRANSFER_WORK,
                            entityKey,
                            { repeatJoin: true, ...item },
                        ),
                        data: item,
                    },
                ],
            );
            return operation
                ? null
                : `Сделка ${mainDealId}: передача уже выполняется другой операцией`;
        } catch (error) {
            return `Сделка ${mainDealId}: передача новому ответственному не поставлена — ${(error as Error).message}`;
        }
    }
}
