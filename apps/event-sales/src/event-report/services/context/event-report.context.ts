import { IBXCompany, IBXDeal, IBXLead } from '@/modules/bitrix';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { PortalModel } from '@lib/portal/services/portal.model';
import { EventSalesFlowDto } from '../../dto/event-sale-flow/event-sales-flow.dto';
import { EnumEventItemResultType } from '../../types/report-types';
import { EnumWorkStatusCode } from '../../types/report-types';
import {
    EventReportEventType,
    GSIRK_DOMAIN,
} from '../../types/event-report.event-codes';
import {
    EventReportEntityType,
    IEventReportInitContext,
} from '../init/event-report-init.types';

/**
 * Состояние event-report flow: входной DTO + загруженные сущности + все
 * вычисленные бизнес-флаги.
 *
 * Класс держит ссылки, но не имеет инстанса Bitrix — он передаётся отдельно
 * в каждый flow-сервис. Это соответствует CLAUDE.md (никакого `this.bitrix`).
 */
export class EventReportContext {
    constructor(
        public readonly dto: EventSalesFlowDto,
        public readonly portal: PortalModel,
        public readonly init: IEventReportInitContext,
        public readonly nowDate: Date = new Date(),
    ) {}

    // === Identity ===
    get domain(): string {
        return this.portal.getPortal().domain;
    }
    get isGsirk(): boolean {
        return this.domain === GSIRK_DOMAIN;
    }
    get entityId(): number {
        return this.init.entityId;
    }
    get entityType(): EventReportEntityType {
        return this.init.entityType;
    }

    // === Resolved entities (короткие алиасы для flow-сервисов) ===
    get company(): IBXCompany | null {
        return this.init.company;
    }
    get lead(): IBXLead | null {
        return this.init.lead;
    }
    get currentBaseDeal(): IBXDeal | null {
        return this.init.currentBaseDeal;
    }
    get currentXoDeal(): IBXDeal | null {
        return this.init.currentXoDeal;
    }
    get currentPresDeal(): IBXDeal | null {
        return this.init.currentPresDeal;
    }
    get currentTmcDeal(): IBXDeal | null {
        return this.init.currentTmcDeal;
    }
    get currentTmcFromPresentation(): IBXDeal | null {
        return this.init.currentTmcFromPresentation;
    }
    get currentTask(): IBXTask | null {
        return this.init.currentTask;
    }

    // === Result/work-status flags ===
    get resultStatus(): EnumEventItemResultType {
        return this.dto.report.resultStatus;
    }
    get isResult(): boolean {
        return this.resultStatus === EnumEventItemResultType.RESULT;
    }
    get isNew(): boolean {
        return this.resultStatus === EnumEventItemResultType.NEW;
    }
    get isCancel(): boolean {
        return this.resultStatus === EnumEventItemResultType.CANCEL;
    }
    get isNoResult(): boolean {
        return this.resultStatus === EnumEventItemResultType.NORESULT;
    }
    get workStatusCode(): EnumWorkStatusCode | null {
        return this.dto.report.workStatus?.current?.code ?? null;
    }
    get isInWork(): boolean {
        return (
            this.workStatusCode === EnumWorkStatusCode.inJob ||
            this.workStatusCode === EnumWorkStatusCode.setAside
        );
    }
    get isFail(): boolean {
        return this.workStatusCode === EnumWorkStatusCode.fail;
    }
    get isSuccessSale(): boolean {
        return this.workStatusCode === EnumWorkStatusCode.success;
    }

    // === Plan flags ===
    get isPlanned(): boolean {
        return Boolean(this.dto.plan?.isPlanned && this.dto.plan?.isActive);
    }
    get isExpired(): boolean {
        // resultStatus не result/new + план есть + план активен
        return !this.isResult && !this.isNew && this.isPlanned;
    }
    get planEventType(): EventReportEventType | null {
        const code = this.dto.plan?.type?.current?.code;
        return code
            ? (this.normalizeEventType(code) as EventReportEventType)
            : null;
    }
    get planEventName(): string {
        return this.dto.plan?.name ?? '';
    }
    get planDeadline(): string {
        return this.dto.plan?.deadline ?? '';
    }
    get planResponsibleId(): number {
        return Number(this.dto.plan?.responsibility?.ID ?? 0);
    }
    get planCreatedById(): number {
        return Number(this.dto.plan?.createdBy?.ID ?? 0);
    }

    // === Report flags ===
    get reportEventType(): EventReportEventType | null {
        const code = this.dto.currentTask?.eventType;
        return code
            ? (this.normalizeEventType(code) as EventReportEventType)
            : null;
    }
    get reportEventName(): string {
        return this.dto.currentTask?.name ?? '';
    }
    get isNoCall(): boolean {
        return Boolean(this.dto.report?.isNoCall);
    }
    get reportComment(): string {
        return this.dto.report?.description ?? '';
    }

    // === Presentation flags ===
    get isPresentationDone(): boolean {
        return Boolean(this.dto.presentation?.isPresentationDone);
    }
    get isUnplannedPresentation(): boolean {
        return (
            this.isPresentationDone && this.reportEventType !== 'presentation'
        );
    }
    get isPresentationCanceled(): boolean {
        return Boolean(this.dto.currentTask?.isPresentationCanceled);
    }

    // === Misc ===
    get isPostSale(): boolean {
        return Boolean(this.dto.isPostSale);
    }
    get isNeedReturnToTmc(): boolean {
        return Boolean(this.dto.returnToTmc?.isActive);
    }
    get isDealFlow(): boolean {
        // sales_base сделка нужна если есть тип события (хоть какой-то план/отчёт)
        return Boolean(this.planEventType || this.reportEventType);
    }

    /**
     * Маппинг DTO-кодов плана (cold/warm/presentation/hot/moneyAwait/supply) в
     * унифицированный EventReportEventType. `cold` из DTO → `xo` (исторически).
     */
    private normalizeEventType(raw: string): string {
        if (raw === 'cold') return 'xo';
        return raw;
    }
}
