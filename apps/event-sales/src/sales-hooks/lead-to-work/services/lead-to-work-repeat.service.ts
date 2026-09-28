import { Injectable, Logger } from '@nestjs/common';
import {
    DuplicateEntityType,
    SignalFieldMapService,
} from '@lib/portal-lib/pbx-duplicate';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    crmCardUrl,
    timelineBold,
    timelineLinkLine,
    timelineText,
    toTimelineCommentDirect,
} from '@lib/bitrix/consts/timeline.consts';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import { EnumSalesHookSource } from '../../core/contracts/sales-hook-job.type';
import { SalesHookExecutionContext } from '../../core/contracts/sales-hook-use-case.contract';
import { SalesHookDispatchService } from '../../core/services/sales-hook-dispatch.service';
import { SalesHookIdempotencyService } from '../../core/services/sales-hook-idempotency.service';
import { buildTransferWorkItem } from '../../transfer-work/dto/transfer-work.dto';
import {
    describeRepeatResolution,
    IRepeatResolution,
} from '../lib/repeat-work.resolver';
import {
    IRepeatFinderLead,
    IRepeatFindOutcome,
    RepeatWorkFinderService,
} from './repeat-work-finder.service';

/** Режим настройки `lead_intake_repeat_join_mode`. */
export const REPEAT_JOIN_MODES = ['off', 'dry_run', 'on'] as const;
export type RepeatJoinMode = (typeof REPEAT_JOIN_MODES)[number];

/** Комментарий в таймлайн лида после записи. */
export interface IRepeatLeadNote {
    leadId: number;
    resolution: IRepeatResolution;
    mode: RepeatJoinMode;
}

/**
 * ПОВТОРНАЯ ЗАЯВКА на входе (решения владельца 28.09.2026) — всё, что
 * хуку «лид → работа» нужно вокруг присоединения, кроме самой записи
 * (её ставит LeadToWorkFlowService.queueJoin в группу лида):
 *  - режим из настроек портала (off | dry_run | on);
 *  - поиск работы клиента (RepeatWorkFinderService, batch-чтение);
 *  - комментарии в таймлайн лида: холостой ход и неоднозначность;
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
     * Комментарии в таймлайн ЛИДА — после записи, прямыми вызовами.
     * dry_run: «присоединил бы…»; on + неоднозначность: «присоедините
     * вручную». Сбой комментария операцию не роняет.
     */
    async writeLeadNotes(
        ctx: SalesHookExecutionContext,
        notes: readonly IRepeatLeadNote[],
    ): Promise<string[]> {
        const warnings: string[] = [];
        for (const note of notes) {
            const lines = this.noteLines(ctx.domain, note);
            if (!lines.length) continue;
            try {
                await ctx.bitrix.api.call('crm.timeline.comment.add', {
                    fields: {
                        ENTITY_ID: note.leadId,
                        ENTITY_TYPE: 'lead',
                        COMMENT: toTimelineCommentDirect(lines),
                    },
                });
            } catch (error) {
                warnings.push(
                    `Лид ${note.leadId}: комментарий о повторной заявке не записан — ${(error as Error).message}`,
                );
            }
        }
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

    private noteLines(domain: string, note: IRepeatLeadNote): string[] {
        const { resolution, mode } = note;
        if (resolution.kind === 'join' && mode === 'dry_run') {
            const dealId = resolution.mainDeal?.dealId ?? 0;
            return [
                timelineBold('🔁 Повторная заявка — холостой ход'),
                timelineText(
                    `Присоединил бы к работе клиента: ${describeRepeatResolution(resolution)}.`,
                ),
                timelineLinkLine(
                    'Сделка',
                    crmCardUrl(domain, 'deal', dealId),
                    `#${dealId}`,
                ),
                timelineText(
                    'Сейчас создана отдельная работа (режим «холостой ход» в настройках портала).',
                ),
            ];
        }
        if (resolution.kind === 'ambiguous') {
            return [
                timelineBold('🔁 Повторная заявка — нужен выбор'),
                timelineText(
                    `У клиента ${describeRepeatResolution(resolution)}. ` +
                        'Автоматически не присоединено: руководитель может присоединить кнопкой «Присоединить сюда» в панели дублей.',
                ),
            ];
        }
        return [];
    }
}
