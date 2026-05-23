import { Injectable } from '@nestjs/common';
import { EventSalesFlowDto } from '@/apps/event-sales/dto/event-sale-flow/event-sales-flow.dto';
import { PlanDto } from '@/apps/event-sales/dto/event-sale-flow/plan.dto';
import { ReportDto } from '@/apps/event-sales/dto/event-sale-flow/report.dto';
import { PresentationDto } from '@/apps/event-sales/dto/event-sale-flow/presentation.dto';
import { MinimalUserDto } from '@/apps/event-sales/dto/event-sale-flow/user.dto';
import {
    EnumEventItemResultType,
    EnumWorkStatusCode,
    EnumWorkStatusName,
    NoresultReason,
    FailReason,
    FailType,
    WorkStatus,
} from '@/apps/event-sales/types/report-types';
import {
    EnumEventPlanCode,
    EventPlanCall,
} from '@/apps/event-sales/types/plan-types';
import {
    CallFlowExtractDto,
    CallNoresultReasonCode,
    CallPlanTypeCode,
    CallSalesAnalysisResultDto,
} from '../dto/call-sales-analysis.dto';

const PLAN_TYPE_NAMES: Record<CallPlanTypeCode, string> = {
    cold: 'Холодный звонок',
    warm: 'Повторный звонок',
    presentation: 'Презентация',
    hot: 'В решении',
    moneyAwait: 'Ждём оплату',
    supply: 'Поставка',
};

const NORESULT_REASON_NAMES: Record<
    CallNoresultReasonCode,
    NoresultReason['name']
> = {
    secretar: 'Секретарь',
    nopickup: 'Недозвон - трубку не берут',
    nonumber: 'Недозвон - трубку не берут',
    busy: 'Занято',
    noresult_notime: 'Перенос - не было времени',
    nocontact: 'Контактера нет на месте',
    giveup: 'Просят оставить свой номер',
    bay: 'Не интересует, до свидания',
    wrong: 'По телефону отвечает не та организация',
    auto: 'Автоответчик',
};

@Injectable()
export class EventFlowMapperService {
    /**
     * Собирает частичный EventSalesFlowDto из AI-результата.
     * Заполняет domain, report, plan, presentation.
     * Поля placement/contact/sale/lead/departament оставляет undefined —
     * их заполнит менеджер при подтверждении или фронт перед отправкой в event-sales.
     */
    toFlowDto(
        analysis: CallSalesAnalysisResultDto,
        domain: string,
        responsibleId: number,
    ): Partial<EventSalesFlowDto> {
        const responsible = this.buildUser(responsibleId);
        return {
            domain,
            report: this.buildReport(analysis.flow.report, analysis.summary),
            plan: this.buildPlan(analysis.flow.plan, responsible),
            presentation: this.buildPresentation(),
        };
    }

    private buildUser(userId: number): MinimalUserDto {
        return { ID: userId };
    }

    private buildPlan(
        plan: CallFlowExtractDto['plan'],
        user: MinimalUserDto,
    ): PlanDto {
        const code = plan.typeCode ?? EnumEventPlanCode.WARM;
        const eventType: EventPlanCall = {
            id: 0,
            code: code as EnumEventPlanCode,
            name: PLAN_TYPE_NAMES[code as CallPlanTypeCode] ?? plan.name,
        };
        return {
            responsibility: user,
            createdBy: user,
            type: { current: eventType },
            name: plan.name || eventType.name,
            deadline: plan.deadlineDate ?? '',
            isPlanned: plan.isPlanned,
            isActive: plan.isPlanned,
            contact: null,
        };
    }

    private buildReport(
        report: CallFlowExtractDto['report'],
        description: string,
    ): ReportDto {
        return {
            resultStatus: report.resultStatus as EnumEventItemResultType,
            description,
            workStatus: { current: this.workStatusInJob() },
            noresultReason: {
                current: this.buildNoresultReason(report.noresultReasonCode),
            },
            failType: { current: this.emptyFailType() },
            failReason: { current: this.emptyFailReason() },
            contact: null,
            isNoCall: false,
        };
    }

    private buildPresentation(): PresentationDto {
        return {
            count: { company: 0, smart: 0, deal: 0 },
            isPresentationDone: false,
            isUnplannedPresentation: false,
        };
    }

    private workStatusInJob(): WorkStatus {
        return {
            id: 0,
            code: EnumWorkStatusCode.inJob,
            name: EnumWorkStatusName.В_работе,
            isActive: true,
        };
    }

    private buildNoresultReason(
        code: CallNoresultReasonCode | null,
    ): NoresultReason {
        const safeCode: CallNoresultReasonCode = code ?? 'auto';
        return {
            id: 0,
            code: safeCode,
            name: NORESULT_REASON_NAMES[safeCode],
            isActive: code !== null,
        };
    }

    private emptyFailType(): FailType {
        return { id: 0, code: 'failure', name: 'Отказ', isActive: false };
    }

    private emptyFailReason(): FailReason {
        return {
            id: 0,
            code: 'fail_off',
            name: 'Не хотят общаться',
            isActive: false,
        };
    }
}
