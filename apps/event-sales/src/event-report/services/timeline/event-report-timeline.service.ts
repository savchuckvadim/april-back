import { Logger } from '@nestjs/common';
import { BitrixService, IBXContact } from '@/modules/bitrix';
import { toTimelineComment } from '@lib/bitrix/consts/timeline.consts';
import {
    contactFullName,
    entityTitleOr,
} from '../../../shared/bitrix/crm-entity-name.util';
import { EventReportContext } from '../context/event-report.context';
import {
    EEventReportEntityType,
    EventReportEntityType,
} from '../init/event-report-init.types';
import { DealFlowResult } from '../deal/event-report-deal-flow.service';
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

    queue(ctx: EventReportContext, deals: DealFlowResult): void {
        const targets = this.targets(ctx, deals);
        if (!targets.length) return;

        const cards = this.cards(ctx);
        targets.forEach((target, index) => {
            // Своя карточка в собственной записи — ссылка «сюда же».
            const comment = buildEventReportTimelineComment({
                ...this.source(ctx),
                cards: cards.filter(card => !isSameCard(card, target)),
            });
            if (!comment.trim()) return;

            this.logger.log(
                `[timeline] ${target.entityType}:${String(target.entityId)} — ` +
                    comment.split('\n').join(' / '),
            );
            // Репозиторий сам оборачивает поля в { fields }: двойной
            // { fields } ломает запись.
            this.bitrix.batch.timeline.addTimelineComment(
                `add_timeline_${index}_${target.entityType}_${target.realId ?? 'new'}`,
                {
                    ENTITY_TYPE: target.entityType,
                    ENTITY_ID: target.entityId,
                    COMMENT: toTimelineComment([comment]),
                },
            );
        });
    }

    /**
     * Куда кладём запись: во ВСЕ карточки клиента, а не только в ту, из
     * которой отчитались (решение владельца 15.09) —
     *  - сущность-владелец события (компания / лид / сделка без компании);
     *  - компания клиента, если она есть;
     *  - основная сделка «ОП Основная» — ВСЕГДА: руководитель смотрит работу
     *    по сделке, и пустой таймлайн там читался бы как «ничего не делали».
     *
     * Дубли гасятся по паре тип+id: при отчёте из карточки компании владелец
     * и есть компания, второй записи там не появится.
     *
     * ⚠ Основная сделка может быть СОЗДАНА этим же отчётом — тогда её id
     * приезжает подстановкой `$result[set_base_deal]`, валидной только внутри
     * ОДНОГО HTTP-батча. Команда таймлайна встаёт в ту же очередь ПОСЛЕ
     * команды сделки (тот же приём уже используют привязки задачи
     * UF_CRM_TASK), поэтому подстановка резолвится. Разъедутся по чанкам —
     * не выполнится только эта одна команда (halt: 0), отчёт цел.
     */
    private targets(
        ctx: EventReportContext,
        deals: DealFlowResult,
    ): ITimelineTarget[] {
        const targets: ITimelineTarget[] = [];
        const seen = new Set<string>();
        const push = (
            entityType: EventReportEntityType,
            entityId: number | string | null,
            realId: number,
        ): void => {
            if (!entityId) return;
            const key = `${entityType}_${String(entityId)}`;
            if (seen.has(key)) return;
            seen.add(key);
            targets.push({ entityType, entityId, realId: realId || null });
        };

        push(ctx.entityType, ctx.entityId, ctx.entityId);
        push(
            EEventReportEntityType.COMPANY,
            numericId(ctx.company?.ID),
            numericId(ctx.company?.ID),
        );
        // Реальный id знаем только у существующей сделки: у только что
        // созданной вместо него подстановка батча.
        push(
            EEventReportEntityType.DEAL,
            deals.baseDealId,
            numericId(ctx.currentBaseDeal?.ID),
        );
        return targets;
    }

    /** Контекст flow → плоские данные форматтера (карточки ставит queue). */
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
            cards: [],
        };
    }

    /**
     * Карточки клиента в записи: основная сделка, компания, заявка.
     *
     * Сделка — ТОЛЬКО существующая (`currentBaseDeal`): id только что
     * созданной приезжает подстановкой `$result[...]`, которая в url
     * превратилась бы в битую ссылку. Какую ссылку выкинуть из какой
     * записи, решает `queue` — список здесь общий для всех записей.
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
            const id = numericId(rawId);
            if (!id) return;
            cards.push({
                section,
                label,
                id,
                title: entityTitleOr(rawTitle, `${fallback} #${id}`),
            });
        };

        const baseDeal = ctx.currentBaseDeal;
        if (baseDeal) {
            push('deal', 'Сделка', baseDeal.ID, baseDeal.TITLE, 'Сделка');
        }
        if (ctx.company) {
            push(
                'company',
                'Компания',
                ctx.company.ID,
                ctx.company.TITLE,
                'Компания',
            );
        }
        if (ctx.lead) {
            push('lead', 'Заявка', ctx.lead.ID, ctx.lead.TITLE, 'Заявка');
        }
        return cards;
    }
}

/** Куда уходит одна запись таймлайна. */
interface ITimelineTarget {
    entityType: EventReportEntityType;
    /** Значение ENTITY_ID команды: id либо подстановка `$result[...]`. */
    entityId: number | string;
    /** Реальный id, если известен; null — сделка создаётся этим же батчем. */
    realId: number | null;
}

/** Раздел url карточки по типу сущности-владельца. */
const CARD_SECTION_BY_ENTITY: Record<EventReportEntityType, string> = {
    [EEventReportEntityType.COMPANY]: 'company',
    [EEventReportEntityType.DEAL]: 'deal',
    [EEventReportEntityType.LEAD]: 'lead',
};

/** Ссылка ведёт на ту же карточку, в которой лежит запись. */
const isSameCard = (card: ITimelineCard, target: ITimelineTarget): boolean =>
    CARD_SECTION_BY_ENTITY[target.entityType] === card.section &&
    card.id === target.realId;

/** Положительный числовой id либо 0 — «идентификатора нет». */
const numericId = (raw: unknown): number => {
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : 0;
};

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
