import { Injectable, Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { BitrixEntityType } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { toTimelineCommentDirect } from '@lib/bitrix/consts/timeline.consts';
import { BxDepartmentService } from '@lib/bx-department/services/bx-department.service';
import {
    buildHeadsByUser,
    headsOfUsers,
    loadSalesDepartments,
} from '../../../shared/department-heads';
import { IRepeatDealInfo } from '../lib/repeat-work.resolver';
import { IRepeatJoinNotice } from '../lib/repeat-join-notice';
import {
    chosenDealCommentLines,
    headNoticeMessage,
    leadJoinedNoteLines,
    managerNoticeMessage,
    otherDealCommentLines,
    personOf,
    RepeatNoticeNames,
} from '../lib/repeat-join-notice.texts';

/** Что нужно от вызова: портал и его инстанс Битрикса. */
export interface IRepeatNoticeContext {
    domain: string;
    bitrix: Pick<BitrixService, 'timeline' | 'imNotify'>;
}

/**
 * ОПОВЕЩЕНИЯ о повторной заявке, присоединённой к самой свежей из
 * нескольких открытых сделок клиента (решения владельца 01.10.2026):
 *  - комментарий в выбранную сделку и в каждую другую открытую (самые
 *    свежие в лимите MAX_REPEAT_NOTICE_OTHERS, остальные — числом);
 *  - комментарий в лид (вместо прежнего «нужен выбор»);
 *  - менеджерам других открытых сделок — по сообщению на человека
 *    (ответственный выбранной сделки и так получил «вам назначена»);
 *  - руководителям и заместителям отделов ВСЕХ владельцев открытых сделок
 *    и нового ответственного выбранной — без повторов.
 * Человек в обеих ролях получает одно сообщение — руководителя, оно шире.
 *
 * Только ПРЯМЫЕ вызовы после финального flush (ai/rules/bitrix-batch-
 * grouping.md): сбой одного адресата не роняет ни операцию, ни остальных —
 * он уходит в предупреждения.
 *
 * @Injectable без состояния: инстанс Битрикса приходит в контексте вызова.
 */
@Injectable()
export class LeadToWorkRepeatNoticeService {
    private readonly logger = new Logger(LeadToWorkRepeatNoticeService.name);

    constructor(private readonly departments: BxDepartmentService) {}

    /** Возвращает предупреждения; не бросает — оповещение вторично. */
    async send(
        ctx: IRepeatNoticeContext,
        notices: readonly IRepeatJoinNotice[],
        names: RepeatNoticeNames,
    ): Promise<string[]> {
        if (!notices.length) return [];
        const warnings: string[] = [];
        const headsByUser = buildHeadsByUser(
            await loadSalesDepartments(
                this.departments,
                ctx.domain,
                warnings,
                'Повторная заявка: структура отдела продаж не прочитана — руководителям не сообщено',
            ),
        );
        for (const notice of notices) {
            if (notice.moreCount > 0) this.warnCapped(notice, warnings);
            await this.comment(
                ctx,
                BitrixEntityType.DEAL,
                notice.mainDeal.dealId,
                chosenDealCommentLines(ctx.domain, notice, names),
                warnings,
            );
            for (const deal of notice.otherDeals) {
                await this.comment(
                    ctx,
                    BitrixEntityType.DEAL,
                    deal.dealId,
                    otherDealCommentLines(ctx.domain, notice, names),
                    warnings,
                );
            }
            await this.comment(
                ctx,
                BitrixEntityType.LEAD,
                notice.leadId,
                leadJoinedNoteLines(ctx.domain, notice, names),
                warnings,
            );
            const messages = this.messages(ctx.domain, notice, names, {
                headsByUser,
                warnings,
            });
            for (const [userId, message] of messages) {
                await this.notify(ctx, userId, message, warnings);
            }
        }
        return warnings;
    }

    /** Получатель → сообщение: менеджеры, затем руководители поверх. */
    private messages(
        domain: string,
        notice: IRepeatJoinNotice,
        names: RepeatNoticeNames,
        input: {
            headsByUser: ReadonlyMap<number, readonly number[]>;
            warnings: string[];
        },
    ): Map<number, string> {
        const messages = new Map<number, string>();
        for (const [ownerId, deals] of ownersOf(notice.otherDeals)) {
            if (ownerId === notice.responsibleId) continue;
            messages.set(
                ownerId,
                managerNoticeMessage(domain, notice, deals, names),
            );
        }
        const people = [...new Set([notice.responsibleId, ...notice.ownerIds])];
        // Снимок не прочитан — об этом уже предупредили один раз на пачку.
        const headless = input.headsByUser.size
            ? people.filter(id => !input.headsByUser.get(id)?.length)
            : [];
        if (headless.length) {
            const who = headless
                .map(id => personOf(names, id) ?? String(id))
                .join(', ');
            input.warnings.push(
                `Лид ${notice.leadId}: руководитель не найден в структуре отдела продаж у сотрудников: ${who} — их руководителям не сообщено`,
            );
        }
        const headMessage = headNoticeMessage(domain, notice, names);
        for (const headId of headsOfUsers(input.headsByUser, people)) {
            messages.set(headId, headMessage);
        }
        return messages;
    }

    /** Лимит оповещений сработал — видно в итоге операции и в логе. */
    private warnCapped(notice: IRepeatJoinNotice, warnings: string[]): void {
        const sent = notice.otherDeals.length;
        const text =
            `Лид ${notice.leadId}: у клиента ${sent + 1 + notice.moreCount} ` +
            `открытых сделок — комментарии и сообщения менеджерам ушли по ${sent} ` +
            `самым свежим, ещё ${notice.moreCount} только посчитаны в текстах`;
        warnings.push(text);
        this.logger.warn(text);
    }

    private async comment(
        ctx: IRepeatNoticeContext,
        entityType: BitrixEntityType,
        entityId: number,
        lines: readonly string[],
        warnings: string[],
    ): Promise<void> {
        try {
            await ctx.bitrix.timeline.addTimelineComment({
                ENTITY_ID: entityId,
                ENTITY_TYPE: entityType,
                COMMENT: toTimelineCommentDirect(lines),
            });
        } catch (error) {
            warnings.push(
                `Повторная заявка: комментарий (${entityType} ${entityId}) не записан — ${(error as Error).message}`,
            );
        }
    }

    private async notify(
        ctx: IRepeatNoticeContext,
        userId: number,
        message: string,
        warnings: string[],
    ): Promise<void> {
        try {
            await ctx.bitrix.imNotify.systemAdd({
                USER_ID: userId,
                MESSAGE: message,
            });
        } catch (error) {
            const text = `Повторная заявка: уведомление сотруднику ${userId} не отправлено — ${(error as Error).message}`;
            warnings.push(text);
            this.logger.warn(text);
        }
    }
}

/** Владелец → его сделки из списка (без ответственного — мимо). */
function ownersOf(
    deals: readonly IRepeatDealInfo[],
): Map<number, IRepeatDealInfo[]> {
    const result = new Map<number, IRepeatDealInfo[]>();
    for (const deal of deals) {
        if (!deal.responsibleId) continue;
        result.set(deal.responsibleId, [
            ...(result.get(deal.responsibleId) ?? []),
            deal,
        ]);
    }
    return result;
}
