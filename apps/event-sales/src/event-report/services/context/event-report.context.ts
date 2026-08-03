import { IBXCompany, IBXDeal, IBXLead } from '@/modules/bitrix';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
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
     *
     * ВНИМАНИЕ: здесь известное расхождение, пока НЕ исправленное.
     *
     * Коды плана и коды задачи — разные наборы. План приходит из
     * EnumEventPlanCode (libs/shared/src/event-sales/types/plan-types.ts):
     * cold | warm | presentation | hot | moneyAwait | supply — и после
     * замены cold → xo полностью совпадает с EventReportEventType.
     *
     * А тип ЗАДАЧИ приходит из EnumTaskEventType
     * (libs/shared/src/event-sales/dto/task.dto.ts):
     * xo | warm | presentation | in_progress | money_await | event | supply.
     * Три значения не совпадают ни с чем: `in_progress` вместо `hot`,
     * `money_await` вместо `moneyAwait`, и `event`, которого в
     * EventReportEventType нет вовсе. Фронт их действительно шлёт —
     * parseTaskTitle ставит `in_progress` для «Решение» и `money_await`
     * для «Оплата» (front/apps/event-sales/modules/entities/EventTask/lib/
     * task-util.ts).
     *
     * Функция их не приводит, а вызывающий код гасит ошибку приведением
     * `as EventReportEventType`. Из-за этого reportEventType по таким
     * задачам не совпадает ни с одной записью SALES_BASE_EVENT_ORDER
     * (deal-target-stage.calculator.ts) и не проходит switch в mapEventType
     * (kpi-list/event-report-kpi-payload.builder.ts). Практически это значит:
     *   — отчёт по «Звонку по решению» и «Звонку по оплате» НЕ поднимает
     *     стадию (вниз она не съезжает: держит currentStageEvent, он выводится
     *     из текущей стадии и потому всегда в правильном алфавите);
     *   — запись в «ОП KPI» по таким отчётам НЕ создаётся.
     * Планирование при этом работает: коды плана с лестницей совпадают.
     *
     * Чинится здесь же — добавить in_progress → hot, money_await → moneyAwait
     * и решить, чем считать `event` (по смыслу warm), — плюс убрать приведение
     * `as EventReportEventType`, чтобы компилятор впредь ловил такие
     * расхождения сам. Правка меняет цифры отчётности, поэтому сравнивать
     * периоды до и после будет некорректно: делать отдельной задачей.
     */
    private normalizeEventType(raw: string): string {
        if (raw === 'cold') return 'xo';
        return raw;
    }
}
