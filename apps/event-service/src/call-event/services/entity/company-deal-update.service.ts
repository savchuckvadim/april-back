import { Logger } from '@nestjs/common';
import { BitrixService, IBXCompany, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { CallEventContext } from '../context/call-event.context';
import { ServiceCompanyFieldCode } from '../../types/service-company-field.enum';
import { formatCrmDateTime } from '../smart/utils/date.util';

type FieldValue = string | number | string[];

const HISTORY_LIMIT = 8;
const PRES_TASK_PREFIX = 'Презентация:';
const EDU_TASK_PREFIX = 'Обучение:';

/**
 * Обновление полей компании и сделки после звонка (аналог legacy
 * `updateFieldCompany`). Создаётся через `new(bitrix, portal)` — копит
 * `crm.company.update` / `crm.deal.update` в общий batch.
 */
export class CompanyDealUpdateService {
    private readonly logger = new Logger(CompanyDealUpdateService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    /** @returns [factCountIshodCommun, eduCount, presCount] — для логов. */
    queue(ctx: CallEventContext): [number, number, number] {
        const company = ctx.init.company;
        if (!company) {
            this.logger.warn('company-deal-update: компания не загружена');
            return [0, 0, 0];
        }
        const record = company as unknown as Record<string, unknown>;
        const out: Record<string, FieldValue> = {};
        const tasks = ctx.init.companyTasks;

        // ОРК Комментарий История (multiple, max 8)
        const historyLine = `${formatCrmDateTime(ctx.nowDate, undefined, true)}\n${ctx.dto.report.description}`;
        const prevHistory = this.readMultiple(
            record,
            ServiceCompanyFieldCode.ork_last_history,
        );
        this.set(
            out,
            ServiceCompanyFieldCode.ork_last_history,
            [historyLine, ...prevHistory].slice(0, HISTORY_LIMIT),
        );

        // Следующий звонок (из ближайшей открытой задачи)
        const nextTask = tasks[0];
        this.set(
            out,
            ServiceCompanyFieldCode.ork_next_call_name,
            nextTask?.title ?? '',
        );
        this.set(
            out,
            ServiceCompanyFieldCode.ork_next_call_date,
            nextTask?.deadline
                ? formatCrmDateTime(
                      new Date(nextTask.deadline),
                      undefined,
                      true,
                  )
                : '',
        );

        // Последний звонок
        const prevNextCallName = this.readCurrent(
            record,
            ServiceCompanyFieldCode.ork_next_call_name,
        );
        this.set(
            out,
            ServiceCompanyFieldCode.ork_last_call_name,
            typeof prevNextCallName === 'string' ? prevNextCallName : '',
        );
        this.set(
            out,
            ServiceCompanyFieldCode.ork_last_call_date,
            formatCrmDateTime(ctx.nowDate, undefined, true),
        );

        // Фактическое количество исходящих коммуникаций
        const eventCommunications = this.countEventCommunications(ctx);
        const prevFact = Number(
            this.readCurrent(
                record,
                ServiceCompanyFieldCode.ork_communication_fact_count,
            ) ?? 0,
        );
        const factCount =
            (Number.isFinite(prevFact) ? prevFact : 0) + eventCommunications;
        this.set(
            out,
            ServiceCompanyFieldCode.ork_communication_fact_count,
            factCount,
        );

        let presCount =
            Number(
                this.readCurrent(
                    record,
                    ServiceCompanyFieldCode.ork_pres_count,
                ) ?? 0,
            ) || 0;
        let eduCount =
            Number(
                this.readCurrent(
                    record,
                    ServiceCompanyFieldCode.ork_edu_count,
                ) ?? 0,
            ) || 0;

        if (ctx.dto.report.results.presentation) {
            presCount += 1;
            this.set(out, ServiceCompanyFieldCode.ork_pres_count, presCount);
            this.set(
                out,
                ServiceCompanyFieldCode.ork_last_pres_name,
                ctx.dto.report.description,
            );
            this.set(
                out,
                ServiceCompanyFieldCode.ork_last_pres_date,
                formatCrmDateTime(ctx.nowDate, undefined, true),
            );
            const presTask = tasks.find(t =>
                (t.title ?? '').includes(PRES_TASK_PREFIX),
            );
            this.set(
                out,
                ServiceCompanyFieldCode.ork_next_pres_name,
                presTask?.description ?? '',
            );
            this.set(
                out,
                ServiceCompanyFieldCode.ork_next_pres_date,
                presTask?.deadline ?? '',
            );
        }

        if (ctx.dto.report.results.edu) {
            eduCount += 1;
            this.set(out, ServiceCompanyFieldCode.ork_edu_count, eduCount);
            this.set(
                out,
                ServiceCompanyFieldCode.ork_last_edu_name,
                ctx.dto.report.description,
            );
            this.set(
                out,
                ServiceCompanyFieldCode.ork_last_edu_date,
                formatCrmDateTime(ctx.nowDate, undefined, true),
            );
            const eduTask = tasks.find(t =>
                (t.title ?? '').includes(EDU_TASK_PREFIX),
            );
            this.set(
                out,
                ServiceCompanyFieldCode.ork_next_edu_name,
                eduTask?.description ?? '',
            );
            this.set(
                out,
                ServiceCompanyFieldCode.ork_next_edu_date,
                eduTask?.deadline ?? '',
            );
        }

        this.applyPlanNextEvent(ctx, out);

        // company.update + (если есть сделка) deal.update
        this.bitrix.batch.company.update(
            'update_company',
            ctx.dto.placement.options.ID,
            out as unknown as Partial<IBXCompany>,
        );
        if (ctx.dealId) {
            this.bitrix.batch.deal.update(
                'update_deal',
                ctx.dealId,
                out as unknown as Partial<IBXDeal>,
            );
        }
        return [factCount, eduCount, presCount];
    }

    /** Тема/дата следующего события из плана (презентация/обучение). */
    private applyPlanNextEvent(
        ctx: CallEventContext,
        out: Record<string, FieldValue>,
    ): void {
        const planCode = ctx.dto.plan?.type?.current?.code;
        if (planCode === 'presentation') {
            this.set(
                out,
                ServiceCompanyFieldCode.ork_next_pres_name,
                ctx.dto.plan.name,
            );
            this.set(
                out,
                ServiceCompanyFieldCode.ork_next_pres_date,
                ctx.dto.plan.deadline,
            );
        } else if (
            planCode === 'edu' ||
            planCode === 'edu_first' ||
            planCode === 'first_edu'
        ) {
            this.set(
                out,
                ServiceCompanyFieldCode.ork_next_edu_name,
                ctx.dto.plan.name,
            );
            this.set(
                out,
                ServiceCompanyFieldCode.ork_next_edu_date,
                ctx.dto.plan.deadline,
            );
        }
    }

    /** Количество исходящих коммуникаций события (план + результаты). */
    private countEventCommunications(ctx: CallEventContext): number {
        const expired = ctx.planIsExpired || ctx.isNoResult;
        let count = ctx.planIsActive && !expired ? 1 : 0;
        const r = ctx.dto.report.results;
        const currentType = ctx.dto.currentTask?.eventType;
        if (r.edu && currentType !== 'edu') count += 1;
        if (r.edu_first && currentType !== 'edu_first') count += 1;
        if (r.presentation && currentType !== 'presentation') count += 1;
        if (r.signal && currentType !== 'signal') count += 1;
        return count;
    }

    private set(
        out: Record<string, FieldValue>,
        code: ServiceCompanyFieldCode,
        value: FieldValue,
    ): void {
        const field = this.portal.getCompanyFieldByCode(code);
        if (!field?.bitrixId) return;
        out[`UF_CRM_${field.bitrixId}`] = value;
    }

    private readCurrent(
        record: Record<string, unknown>,
        code: ServiceCompanyFieldCode,
    ): unknown {
        const field = this.portal.getCompanyFieldByCode(code);
        if (!field?.bitrixId) return undefined;
        return record[`UF_CRM_${field.bitrixId}`];
    }

    private readMultiple(
        record: Record<string, unknown>,
        code: ServiceCompanyFieldCode,
    ): string[] {
        const raw = this.readCurrent(record, code);
        if (Array.isArray(raw)) return raw.map(v => String(v));
        if (typeof raw === 'string' && raw) return [raw];
        return [];
    }
}
