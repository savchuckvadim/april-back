import { Logger } from '@nestjs/common';
import { IBXCompany, IBXDeal, IBXLead } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PortalDeadline } from '@lib/shared/lib/date';
import { EnumColdCallEntityType } from '../../../cold-hook/dto/cold.dto';
import { EventEntityModel } from '../../../cold-hook/services/enities/entity/event-entity.model';

type BxRow = Record<string, unknown>;

/** Что нужно EventEntityModel для расчёта событийных полей ХО. */
export interface ILeadToWorkEventContext {
    /** Название события (без префикса «Холодный обзвон» — его ставит модель). */
    eventName: string;
    /** Дедлайн обзвона в локали портала; без него событийные поля не пишем. */
    deadline: PortalDeadline | null;
    responsibleId: number;
    /** Кто инициировал ХО (робот/менеджер) — поле xo_created. */
    xoCreated: number;
}

/**
 * Событийные поля ХО «как в классическом холодном обзвоне»: xo_name,
 * xo_date, call_next_date, call_last_date, xo_responsible, manager_op,
 * xo_created, op_history/op_mhistory, op_current_status, op_work_status,
 * op_prospects_type.
 *
 * Расчёт делегирован `EventEntityModel` cold-hook'а — это ЕДИНСТВЕННЫЙ
 * источник правды по составу и семантике полей события (правило CLAUDE.md:
 * файлы cold-hook не меняем, импортировать из него можно; дублировать
 * модель копипастой значило бы развести два поведения).
 *
 * Применяется ТОЛЬКО в ХО-ветке (isXo=Y): конвертация лида в работу —
 * не «холодный обзвон», ей эти поля не нужны.
 *
 * НЕ @Injectable: создаётся `new` рядом с per-domain PortalModel.
 */
export class LeadToWorkEventFieldsService {
    private readonly logger = new Logger(LeadToWorkEventFieldsService.name);

    constructor(private readonly portal: PortalModel) {}

    /**
     * Поля события для существующей сущности (лид/компания/сделка) либо для
     * СОЗДАВАЕМОЙ (entity=null — как ХО-сделка в классическом хуке).
     * Нет дедлайна или ни одно поле не установлено — пустой объект.
     */
    build(
        ctx: ILeadToWorkEventContext,
        entityType: EnumColdCallEntityType,
        entity: IBXCompany | IBXLead | IBXDeal | null,
    ): BxRow {
        if (!ctx.deadline) return {};
        const model = new EventEntityModel(
            this.portal,
            entity,
            entityType,
            ctx.eventName,
            ctx.deadline,
            String(ctx.responsibleId),
            String(ctx.xoCreated),
        );
        const values = model.getNextValues();
        if (Object.keys(values).length === 0) {
            this.logger.debug(
                `событийные поля ХО для ${entityType} не установлены на портале — пропущены`,
            );
        }
        return values as BxRow;
    }

    /** Название ХО-сделки «Холодный обзвон {событие}» (как в классическом). */
    xoDealTitle(ctx: ILeadToWorkEventContext): string | null {
        if (!ctx.deadline) return null;
        return new EventEntityModel(
            this.portal,
            null,
            EnumColdCallEntityType.DEAL,
            ctx.eventName,
            ctx.deadline,
            String(ctx.responsibleId),
            String(ctx.xoCreated),
        ).getEventName();
    }
}
