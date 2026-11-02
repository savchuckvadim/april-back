import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { toBatchSafeText } from '@lib/bitrix/consts/batch.consts';
import { contactFullName } from '../../shared/bitrix/crm-entity-name.util';
import { EventReportContext } from '../../event-report/services/context/event-report.context';
import { EEventReportEntityType } from '../../event-report/services/init/event-report-init.types';
import { EVENT_REPORT_EVENT_TYPE } from '../../event-report/types/event-report.event-codes';
import {
    RPA_PRESENTATION_CODE,
    RPA_PRESENTATION_FIELD,
} from '../lib/rpa-presentation-fields.const';

/** Ключ batch-команды создания элемента РПА. */
export const ADD_RPA_PRESENTATION_CMD = 'add_rpa_presentation';

/**
 * Заявка ТМЦ на презентацию в РПА портала — пока оба контура живут вместе
 * («Сделка ОП Презентации + Список Презентации = Смарт Презентации», но
 * бизнес-процесс согласования на gsr ещё ходит по элементу РПА).
 *
 * План «Презентация» в режиме ТМЦ — не задача менеджеру ОП, а ЗАЯВКА:
 * элемент РПА уходит руководителю на согласование, робот РПА по
 * утверждении зовёт ручку `tmc/presentation-approved`, и только она
 * планирует презентацию менеджеру ОП. Параллельно та же заявка рождается
 * элементом смарта «Презентации» (presentation-flow, kind `request`).
 *
 * РПА не установлен на портале — заявка живёт только элементом смарта,
 * команда не ставится (лог, не ошибка). Поле РПА не установлено — оно
 * пропускается, остальное пишется.
 *
 * Не @Injectable — создаётся с per-domain bitrix (правило CLAUDE.md).
 */
export class TmcPresentationRequestService {
    private readonly logger = new Logger(TmcPresentationRequestService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    /**
     * Ставит команду в батч; возвращает её ключ либо null — заявка не
     * нужна (план не презентация) или РПА на портале нет.
     *
     * @param tmcDealRef id ТМЦ-сделки либо подстановка `$result[set_tmc_deal]`
     *   — сделка может создаваться этим же батчем.
     */
    queue(ctx: EventReportContext, tmcDealRef: string | null): string | null {
        if (!this.isPresentationRequest(ctx)) return null;
        const rpa = this.portal.getRpaByCode(RPA_PRESENTATION_CODE);
        if (!rpa) {
            this.logger.log(
                `${ctx.domain}: РПА «Заявка на презентацию» не установлен — заявка живёт только элементом смарта`,
            );
            return null;
        }

        const missing: string[] = [];
        const fields: Record<string, unknown> = {
            // Автор элемента — кто согласует (руководитель, постановщик
            // плана); легаси держало тут захардкоженного пользователя.
            createdBy: ctx.planCreatedById || ctx.planResponsibleId,
        };
        const set = (code: string, value: unknown): void => {
            if (value === null || value === undefined || value === '') return;
            const key = this.portal.getRpaFieldBitrixIdByCode(
                RPA_PRESENTATION_CODE,
                code,
            );
            if (!key) {
                missing.push(code);
                return;
            }
            fields[key] = value;
        };

        set(
            RPA_PRESENTATION_FIELD.name,
            toBatchSafeText(this.requestName(ctx)),
        );
        set(
            RPA_PRESENTATION_FIELD.nextPresPlanDate,
            ctx.planDeadline?.toCrmDateTime() ?? null,
        );
        set(
            RPA_PRESENTATION_FIELD.lastPresPlanResponsible,
            ctx.planResponsibleId,
        );
        set(
            RPA_PRESENTATION_FIELD.ownerOp,
            ctx.planCreatedById || ctx.planResponsibleId,
        );
        set(RPA_PRESENTATION_FIELD.company, this.companyId(ctx) || null);
        set(
            RPA_PRESENTATION_FIELD.contact,
            Number(ctx.dto.plan?.contact?.ID) || null,
        );
        set(
            RPA_PRESENTATION_FIELD.tmcComment,
            ctx.reportComment ? [toBatchSafeText(ctx.reportComment)] : null,
        );
        set(RPA_PRESENTATION_FIELD.tmcDeal, tmcDealRef);

        if (missing.length) {
            this.logger.warn(
                `${ctx.domain}: у РПА «Заявка на презентацию» нет полей ${missing.join(', ')} — записаны остальные`,
            );
        }
        this.bitrix.batch.rpaItem.add(ADD_RPA_PRESENTATION_CMD, {
            typeId: rpa.bitrixId,
            fields,
        });
        return ADD_RPA_PRESENTATION_CMD;
    }

    /** План презентации в режиме ТМЦ = заявка на презентацию. */
    isPresentationRequest(ctx: EventReportContext): boolean {
        return (
            ctx.isPlanned &&
            ctx.planEventType === EVENT_REPORT_EVENT_TYPE.presentation
        );
    }

    /** «Заявка <название> <контакт> от <сейчас>» — формат легаси. */
    private requestName(ctx: EventReportContext): string {
        const contact = ctx.planContact ? contactFullName(ctx.planContact) : '';
        return `Заявка ${ctx.planEventName} ${contact} от ${ctx.dateTime.nowCrmDateTime()}`
            .replace(/\s+/g, ' ')
            .trim();
    }

    private companyId(ctx: EventReportContext): number {
        return ctx.entityType === EEventReportEntityType.COMPANY
            ? ctx.entityId
            : Number(ctx.company?.ID) || 0;
    }
}
