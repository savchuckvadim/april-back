import { Logger } from '@nestjs/common';
import { BitrixService, IBXContact } from '@/modules/bitrix';
import { toTimelineComment } from '@lib/bitrix/consts/timeline.consts';
import {
    contactFullName,
    entityTitleOr,
} from '../../../shared/bitrix/crm-entity-name.util';
import { EventReportContext } from '../context/event-report.context';
import { EEventReportEntityType } from '../init/event-report-init.types';
import {
    buildEventReportTimelineComment,
    IEventReportTimelineSource,
    ITimelineCard,
    ITimelineContact,
    TimelineOutcome,
} from './event-report-timeline.formatter';

/**
 * Запись в таймлайн сущности-владельца ПРИ КАЖДОМ отчёте основного потока.
 *
 * Зачем: менеджер и руководитель открывают карточку клиента, а не список
 * KPI — в таймлайне должно быть видно, что произошло, что дальше, с кем
 * говорили и куда идти. Именно это писал легаси-хук (`EventReportService::
 * setTimeLine`), и при переезде на Nest запись осталась только для gsirk и
 * без единой ссылки.
 *
 * Куда пишем: владелец контекста — компания, лид либо сделка без компании
 * (`ctx.entityType`/`ctx.entityId` совпадают с `ENTITY_TYPE`/`ENTITY_ID`
 * метода `crm.timeline.comment.add`). Одна запись на отчёт: дублировать её
 * по всем связанным карточкам значит превратить таймлайн в шум — до
 * остальных карточек ведут ссылки внизу записи.
 *
 * Экранирование — здесь, на границе транспорта (`toTimelineComment`):
 * команда уезжает батчем, и её `#`, `&`, `+`, `%` и переносы готовит провод,
 * а не форматтер.
 *
 * НЕ @Injectable: создаётся с per-domain bitrix (правило CLAUDE.md).
 */
export class EventReportTimelineService {
    private readonly logger = new Logger(EventReportTimelineService.name);

    constructor(private readonly bitrix: BitrixService) {}

    queue(ctx: EventReportContext): void {
        if (!ctx.entityId) return;

        const comment = buildEventReportTimelineComment(this.source(ctx));
        if (!comment.trim()) return;

        this.logger.log(
            `[timeline] ${ctx.entityType}:${ctx.entityId} — ` +
                comment.split('\n').join(' / '),
        );
        // Репозиторий сам оборачивает поля в { fields }: двойной { fields }
        // ломает запись.
        this.bitrix.batch.timeline.addTimelineComment(
            `add_timeline_${ctx.entityType}_${ctx.entityId}`,
            {
                ENTITY_TYPE: ctx.entityType,
                ENTITY_ID: ctx.entityId,
                COMMENT: toTimelineComment([comment]),
            },
        );
    }

    /** Контекст flow → плоские данные форматтера. */
    private source(ctx: EventReportContext): IEventReportTimelineSource {
        return {
            domain: ctx.domain,
            happenedAt: ctx.dateTime.ruHuman(ctx.nowDate),
            reportEventType: ctx.reportEventType,
            reportEventName: ctx.reportEventName,
            isResult: ctx.isResult,
            reportContact: toTimelineContact(ctx.reportContact),
            planEventType: ctx.planEventType,
            planEventName: ctx.planEventName,
            planAt: ctx.planDeadline?.toRuHumanFullDateTime() ?? null,
            isExpired: ctx.isExpired,
            planContact: toTimelineContact(ctx.planContact),
            isUnplannedPresentation: ctx.isUnplannedPresentation,
            comment: ctx.reportComment,
            outcome: outcomeOf(ctx),
            cards: this.cards(ctx),
        };
    }

    /**
     * Карточки клиента в записи: основная сделка, компания, заявка.
     *
     * Сделка — ТОЛЬКО существующая (`currentBaseDeal`): id только что
     * созданной приезжает подстановкой `$result[...]`, которая в url
     * превратилась бы в битую ссылку. Владелец контекста себя не
     * дублирует — запись и так лежит в его карточке.
     */
    private cards(ctx: EventReportContext): ITimelineCard[] {
        const cards: ITimelineCard[] = [];
        const push = (
            section: string,
            label: string,
            rawId: unknown,
            rawTitle: unknown,
            fallback: string,
        ): void => {
            const id = Number(rawId);
            if (!Number.isFinite(id) || id <= 0) return;
            cards.push({
                section,
                label,
                id,
                title: entityTitleOr(rawTitle, `${fallback} #${id}`),
            });
        };

        const baseDeal = ctx.currentBaseDeal;
        if (
            baseDeal &&
            !(
                ctx.entityType === EEventReportEntityType.DEAL &&
                String(baseDeal.ID) === String(ctx.entityId)
            )
        ) {
            push('deal', 'Сделка', baseDeal.ID, baseDeal.TITLE, 'Сделка');
        }
        if (ctx.entityType !== EEventReportEntityType.COMPANY && ctx.company) {
            push(
                'company',
                'Компания',
                ctx.company.ID,
                ctx.company.TITLE,
                'Компания',
            );
        }
        if (ctx.entityType !== EEventReportEntityType.LEAD && ctx.lead) {
            push('lead', 'Заявка', ctx.lead.ID, ctx.lead.TITLE, 'Заявка');
        }
        return cards;
    }
}

/**
 * Итог работы для записи: продажа, «не ЦА» либо обычный отказ. Работа
 * продолжается — null, и строки итога в записи не будет.
 */
const outcomeOf = (ctx: EventReportContext): TimelineOutcome | null => {
    if (ctx.isSuccessSale) return 'success';
    if (!ctx.isFail) return null;
    return ctx.isNotCa ? 'notCa' : 'fail';
};

/** Контакт карточки → контакт записи; без id — контакта для записи нет. */
const toTimelineContact = (
    contact: IBXContact | null,
): ITimelineContact | null => {
    const id = Number(contact?.ID);
    if (!contact || !Number.isFinite(id) || id <= 0) return null;
    return { id, name: contactFullName(contact) };
};
