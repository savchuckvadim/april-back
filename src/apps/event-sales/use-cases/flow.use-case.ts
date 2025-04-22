import { Injectable, Logger } from '@nestjs/common';
import { FailDto } from '../dto/fail.dto';
import { EventSalesFlowDto } from '../dto/event-sales-flow.dto';
import { ReportDto } from '../dto/report.dto';

import { PlanDto } from '../dto/plan.dto';
import { LeadDto } from '../dto/lead.dto';
import { IPortal } from 'src/modules/portal/interfaces/portal.interface';
import { PortalProviderService } from 'src/modules/portal/services/portal-provider.service';
import { PortalModel } from 'src/modules/portal/services/portal.model';

@Injectable()
export class EventSalesFlowUseCase {
    private hook: string;
    private portal: IPortal;
    private domain: string;
    private portalModel: PortalModel;

    private relationLead?: LeadDto;
    private plan: PlanDto;
    private report: ReportDto;

    private workStatus: any;

    private isUnplannedPresentation?: boolean;
    private entityType: string | null = null;
    private entityId: number | null = null;
    private currentTask: any;

    private resultStatus: string;
    private currentReportEventType: string = 'new';
    private currentReportEventName: string = '';
    private comment: string = '';
    private currentTaskTitle: string = '';
    private isResult = false;
    private isExpired = false;
    private isInWork = false;
    private isFail = false;
    private isSuccessSale = false;
    private isNew = false;
    private isPlanned = false;
    private isPlanActive = true;
    private isPresentationDone: boolean;
    private nowDate: string;
    private isDealFlow = false;
    private isSmartFlow = true;
    private isNoCall = false;
    private postFail?: FailDto;
    private isPostSale = false;

    // остальные поля...

    constructor(private readonly portalProvider: PortalProviderService) { }


    async init(data: EventSalesFlowDto): Promise<this> {
        this.portalModel = await this.portalProvider.getModel();
        this.portal = this.portalModel.getPortal();
        this.isPostSale = data.isPostSale ?? false;
        this.postFail = data.fail;
        this.relationLead = data.lead;
        this.plan = data.plan;
        this.report = data.report;
        this.resultStatus = data.report.resultStatus;
        this.workStatus = data.report.workStatus.current;
        this.isPresentationDone = data.presentation.isPresentationDone;
        this.isUnplannedPresentation = data.presentation.isUnplannedPresentation;

        this.nowDate = new Date().toLocaleString('ru-RU', {
            timeZone: this.getTimeZone(data.domain),
        });

        this.currentTask = data.currentTask || null;
        this.currentReportEventType = this.currentTask?.eventType || 'new';
        this.currentTaskTitle =
            this.currentTask?.TITLE || this.currentTask?.title || '';

        this.setResultFlags();
        this.setEntityTypeAndId(data.placement);
        this.setPlanDetails(data.plan);
        this.setHook(data.domain);



        return this;
    }

    async getFlow(): Promise<{ result: boolean, error: string, data: any }> {

        const data = {
            hook: this.hook,
            isUnplannedPresentation: this.isUnplannedPresentation,
            isPostSale: this.isPostSale,
            report: this.report,
            relationLead: this.relationLead,
            plan: this.plan,

            currentTask: this.currentTask,
            currentTaskTitle: this.currentTaskTitle,
            currentReportEventType: this.currentReportEventType,
            currentReportEventName: this.currentReportEventName,
            comment: this.comment,
            resultStatus: this.resultStatus,
            workStatus: this.workStatus,
            isResult: this.isResult,
            isExpired: this.isExpired,
            isInWork: this.isInWork,
            isFail: this.isFail,
            isSuccessSale: this.isSuccessSale,
            isNew: this.isNew,
            isPlanned: this.isPlanned,
            isPlanActive: this.isPlanActive,
            isPresentationDone: this.isPresentationDone,
            nowDate: this.nowDate,
            isDealFlow: this.isDealFlow,

        }

        return { result: true, error: '', data };
    }
    private setResultFlags(): void {
        // ...
    }

    private setEntityTypeAndId(placement: any): void {
        // ...
    }

    private setPlanDetails(plan: any): void {
        // ...
    }

    private setHook(domain: string): void {
        this.hook = this.portal.C_REST_WEB_HOOK_URL;
    }

    private getTimeZone(domain: string): string {
        return 'Europe/Moscow';
    }

    // и т. д.
}
