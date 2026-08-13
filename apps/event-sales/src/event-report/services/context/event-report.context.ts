import { IBXCompany, IBXDeal, IBXLead } from '@/modules/bitrix';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventSalesFlowDto } from '../../dto/event-sale-flow/event-sales-flow.dto';
import { EnumEventItemResultType } from '../../types/report-types';
import { EnumWorkStatusCode } from '../../types/report-types';
import {
    EVENT_REPORT_EVENT_TYPE,
    EventReportEventType,
    GSIRK_DOMAIN,
} from '../../types/event-report.event-codes';
import {
    EEventReportEntityType,
    EventReportEntityType,
    IEventReportInitContext,
} from '../init/event-report-init.types';

/**
 * Стратегия flow по типу владельца события:
 *  - `COMPANY` — полный flow: воронки сделок, задачи, списки (как исторически);
 *  - `DEAL` — владелец — сделка без компании: воронки работают, привязки `D_`;
 *  - `LEAD_ONLY` — чистый лид: сделки НЕ создаются и НЕ двигаются, событие
 *    живёт в полях лида, его стадии и списках с привязкой `L_`.
 */
export const EEventReportFlowStrategy = {
    COMPANY: 'company',
    DEAL: 'deal',
    LEAD_ONLY: 'leadOnly',
} as const;

export type EventReportFlowStrategy =
    (typeof EEventReportFlowStrategy)[keyof typeof EEventReportFlowStrategy];

/**
 * Состояние event-report flow: входной DTO + загруженные сущности + все
 * вычисленные бизнес-флаги.
 *
 * Класс держит ссылки, но не имеет инстанса Bitrix — он передаётся отдельно
 * в каждый flow-сервис. Это соответствует CLAUDE.md (никакого `this.bitrix`).
 */
/**
 * Коды типа события → внутренний алфавит EventReportEventType.
 *
 * Фронт с 08.08.2026 шлёт уже согласованные коды (hot/moneyAwait), но карта
 * остаётся: она закрывает legacy-значения старых сборок фрейма
 * (in_progress/money_await), фронтовые состояния без аналога на бэке
 * (event — тип задачи не распознан, ss — сервисный сигнал; оба по смыслу
 * разговор с клиентом) и историческое cold.
 *
 * Раньше несогласованный код проезжал сюда как есть и обнулял mapEventType —
 * отчёт уходил успешно, а в KPI не появлялось НИ ОДНОЙ записи, включая
 * продажу и отказ.
 */
const NORMALIZED_EVENT_TYPE: Record<string, EventReportEventType> = {
    cold: 'xo',
    in_progress: 'hot',
    money_await: 'moneyAwait',
    event: 'warm',
    ss: 'warm',
};

/**
 * Коды, которые фронт шлёт как есть и которые уже совпадают с внутренним
 * алфавитом. Отдельный Set нужен, чтобы `normalizeEventType` возвращала
 * ТИПИЗИРОВАННОЕ значение и не приходилось глушить компилятор приведением
 * `as EventReportEventType` на каждом вызове.
 */
const KNOWN_EVENT_TYPES = new Set<string>(
    Object.values(EVENT_REPORT_EVENT_TYPE),
);

/**
 * Куда падает НЕИЗВЕСТНЫЙ код события. Не null и не «как есть»: null терял
 * запись целиком (см. историю в mapEventType), а сырой код не совпадал ни с
 * лестницей стадий, ни с KPI. `warm` = «разговор с клиентом» — минимальная
 * по последствиям трактовка, которая гарантирует, что событие в отчётности
 * останется.
 */
const UNKNOWN_EVENT_TYPE_FALLBACK: EventReportEventType = 'warm';

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
    get strategy(): EventReportFlowStrategy {
        if (this.entityType === EEventReportEntityType.COMPANY) {
            return EEventReportFlowStrategy.COMPANY;
        }
        if (this.entityType === EEventReportEntityType.DEAL) {
            return EEventReportFlowStrategy.DEAL;
        }
        return EEventReportFlowStrategy.LEAD_ONLY;
    }

    // === Resolved entities (короткие алиасы для flow-сервисов) ===
    get company(): IBXCompany | null {
        return this.init.company;
    }
    get lead(): IBXLead | null {
        return this.init.lead;
    }
    get ownerDeal(): IBXDeal | null {
        return this.init.ownerDeal;
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
    get resultStatus(): EnumEventItemResultType | null {
        // null — отчёт из списка (недозвон / возврат в ТМЦ): меню результата не открывали.
        return this.dto.report?.resultStatus ?? null;
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
        return code ? this.normalizeEventType(code) : null;
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
        return code ? this.normalizeEventType(code) : null;
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
        if (!this.isPresentationDone) return false;
        if (this.reportEventType !== 'presentation') return true;
        /*
         * Fallback: отчёт «презентация», но живой pres-сделки нет (удалили,
         * либо работа началась ХО-хуком из лида и презентаций ещё не было).
         * Раньше ветка «update текущей pres-сделки» молча глотала событие —
         * ни сделки, ни KPI. Факт «презентация проведена» обязан
         * фиксироваться всегда → трактуем как незапланированную.
         */
        return !this.currentPresDeal;
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
    /**
     * Поля привязки создаваемой/обновляемой сделки к владельцу контекста.
     * Для владельца-сделки новые связанные сделки наследуют её лид: своей
     * компании у неё по определению нет, а лид-первоисточник — есть часто.
     */
    get ownerLinkFields(): Record<string, string> {
        if (this.entityType === EEventReportEntityType.COMPANY) {
            return { COMPANY_ID: String(this.entityId) };
        }
        if (this.entityType === EEventReportEntityType.LEAD) {
            return { LEAD_ID: String(this.entityId) };
        }
        const ownerLeadId = Number(
            (this.ownerDeal as Record<string, unknown> | null)?.['LEAD_ID'] ??
                0,
        );
        return ownerLeadId > 0 ? { LEAD_ID: String(ownerLeadId) } : {};
    }

    get isDealFlow(): boolean {
        // leadOnly: сделки не создаём и не двигаем — событие живёт в самом
        // лиде (поля, стадия, списки). Осознанное изменение поведения
        // лид-встроек: раньше отчёт от лида создавал базовую сделку.
        if (this.strategy === EEventReportFlowStrategy.LEAD_ONLY) return false;
        /*
         * Продажа и отказ двигают воронку САМИ ПО СЕБЕ: их итоговая стадия
         * (sales_success / sales_fail) не зависит от типа события. Раньше
         * гейт по типу выключал deal-flow целиком, и отчёт «продажа» без
         * задачи и без плана не менял ни одной сделки.
         */
        if (this.isSuccessSale || this.isFail) return true;
        // sales_base сделка нужна если есть тип события (хоть какой-то план/отчёт)
        return Boolean(this.planEventType || this.reportEventType);
    }

    /**
     * Коды плана (`EnumEventPlanCode`) и коды задачи (`EnumTaskEventType`) —
     * два разных набора; здесь оба сводятся к одному внутреннему алфавиту
     * `EventReportEventType`.
     *
     * Что сводится:
     *  - `cold` (код плана) → `xo` — исторически;
     *  - `in_progress`/`money_await` (старые сборки фрейма) → `hot`/`moneyAwait`;
     *  - `event` (тип задачи не распознан) и `ss` (сервисный сигнал) → `warm`:
     *    своего кода в отчётности у них нет, по смыслу это разговор с клиентом.
     *
     * Что проходит как есть: `xo`, `xoRequest`, `xoLead`, `warm`, `presentation`,
     * `hot`, `moneyAwait`, `supply` — они уже в алфавите отчётности.
     *
     * Возврат ВСЕГДА типизирован и никогда не пуст: раньше несведённый код
     * проезжал сюда строкой и гасился приведением `as EventReportEventType`,
     * из-за чего он не совпадал ни с лестницей стадий
     * (`SALES_BASE_EVENT_ORDER`), ни с маппингом KPI — отчёт уходил успешно,
     * а записи молча пропадали. Неизвестный код теперь падает в
     * {@link UNKNOWN_EVENT_TYPE_FALLBACK}, а не теряется.
     */
    private normalizeEventType(raw: string): EventReportEventType {
        const normalized = NORMALIZED_EVENT_TYPE[raw];
        if (normalized) return normalized;
        return KNOWN_EVENT_TYPES.has(raw)
            ? (raw as EventReportEventType)
            : UNKNOWN_EVENT_TYPE_FALLBACK;
    }
}
