import { IBXCompany, IBXContact, IBXDeal, IBXLead } from '@/modules/bitrix';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { BitrixDateTime } from '@/shared/lib/date';
import { PBXDateTime } from '@lib/portal-lib/pbx-domain/date/pbx-datetime';
import { EventSalesFlowDto } from '../../dto/event-sale-flow/event-sales-flow.dto';
import { EnumEventItemResultType } from '../../types/report-types';
import { EnumWorkStatusCode } from '../../types/report-types';
import {
    EventReportEventType,
    GSIRK_DOMAIN,
    normalizeEventReportEventType,
} from '../../types/event-report.event-codes';
import {
    EEventReportEntityType,
    EventReportEntityType,
    IEventReportInitContext,
} from '../init/event-report-init.types';
import { EventTaskChecklistOutcome } from '../task/event-task-checklist.catalog';

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
export class EventReportContext {
    constructor(
        public readonly dto: EventSalesFlowDto,
        public readonly portal: PortalModel,
        public readonly init: IEventReportInitContext,
        public readonly nowDate: Date = new Date(),
    ) {}

    /**
     * Дата/время в таймзоне портала — единая точка форматирования для всего
     * flow. Раньше каждый сервис писал `dayjs(...).tz(portal.getTimezone())
     * .format('DD.MM.YYYY HH:mm:ss')` и дублировал формат поля Bitrix.
     */
    get dateTime(): PBXDateTime {
        return (this.dateTimeVo ??= new PBXDateTime(this.portal));
    }
    private dateTimeVo?: PBXDateTime;

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
    get reportContact(): IBXContact | null {
        return this.init.reportContact;
    }
    get planContact(): IBXContact | null {
        return this.init.planContact;
    }

    // === Чек-лист закрываемой задачи ===
    /**
     * Итог чек-листа задачи, которую этот отчёт закрывает; null — чек-листы
     * выключены настройкой портала, задачи нет, либо пунктов в ней не было.
     *
     * Заполняется ОДИН раз, ДО прогонки flow-сервисов
     * (`EventReportTaskFlowService.readClosingChecklist`): итог обязан попасть
     * в историю карточки, а её собирает entity-flow — первым в цепочке.
     * Отдельным полем контекста, а не параметром сервисов: читателей трое
     * (поля сущности, таймлайн gsirk, комментарий задачи).
     */
    get taskChecklist(): EventTaskChecklistOutcome | null {
        return this.taskChecklistVo;
    }
    setTaskChecklist(outcome: EventTaskChecklistOutcome | null): void {
        this.taskChecklistVo = outcome;
    }
    private taskChecklistVo: EventTaskChecklistOutcome | null = null;

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
    /**
     * ПРИЧИНА ОТКАЗА, которую менеджер действительно выбрал; `null` — селект
     * причины не открывался, и в DTO лежит его дефолт.
     *
     * Единственный источник истины по инварианту «`op_efield_fail_reason` /
     * KPI `op_fail_reason` заполняет ТОЛЬКО финальный отказ типа „Отказ“».
     * Почему getter, а не проверка по месту: читателей трое (поля сущности,
     * items KPI, подпись финальной записи), и разъехавшиеся гейты уже дали
     * баг — поля сущности писали причину при ЛЮБОМ типе отказа.
     *
     * Что отсекается:
     *  - НЕ отказ: селекты отказа фронт присылает всегда (`isActive` по
     *    проводам не едет), а менеджер их даже не открывал;
     *  - тип отказа не «Отказ» (`failure`): при garant/go/territory/…
     *    фронт селект причины НЕ показывает
     *    (`event-report-util.ts::applyFailType`), но шлёт его дефолт
     *    «Не было времени» — раньше он и уезжал в CRM и в KPI, делая
     *    аналитику отказов недостоверной;
     *  - «не ЦА»: там отказные селекты не выбирались вовсе.
     */
    get failReasonCode(): string | null {
        if (!this.isFail || this.isNotCa) return null;
        if (this.dto.report?.failType?.current?.code !== 'failure') return null;
        return this.dto.report?.failReason?.current?.code ?? null;
    }
    /**
     * Тип отказа — ровно тот, что выбрал менеджер, и только когда отказ
     * действительно оформлен.
     *
     * Тот же класс дефекта, что у {@link failReasonCode}: справочник типов
     * строится с `current = items[0]` («Гарант/Запрет»), фронт шлёт его при
     * ЛЮБОМ отчёте, а гейт в KPI стоял только на «не ЦА». Результативный
     * отчёт «в работе» уносил в сводку тип отказа, которого не было, — и
     * отчётность по типам отказа врала так же, как по причинам.
     *
     * Перспективность (`op_prospects_type`) отдельного гейта не требует:
     * её ветка отсекает «в работе», продажу и «не ЦА», и по исключению
     * остаётся только отказ.
     */
    get failTypeCode(): string | null {
        if (!this.isFail || this.isNotCa) return null;
        return this.dto.report?.failType?.current?.code ?? null;
    }
    /**
     * Клиент НЕЦЕЛЕВОЙ: менеджер квалифицировал отказ как «не ЦА». Тип «не ЦА»
     * обязателен при таком отказе (см. `LeadRequestSyncDto.notCaTypeCode`),
     * поэтому его наличие и есть признак.
     *
     * Сигнал общий для лида и сделки: лид уезжает в статус «Не ЦА», сделка
     * ОП — в отдельный отказной финал «Не ЦА» вместо общего «Отказа».
     */
    get isNotCa(): boolean {
        return Boolean(this.dto.leadSync?.notCaTypeCode);
    }

    // === Plan flags ===
    get isPlanned(): boolean {
        return Boolean(this.dto.plan?.isPlanned && this.dto.plan?.isActive);
    }
    /**
     * ПЕРЕНОС события: отчитались не результатом, а план не выключили.
     *
     * Опираться на {@link isPlanned} здесь нельзя: он требует выбранного типа
     * плана, а при переносе тип не меняют — событие то же самое, просто уезжает
     * на другую дату. Из-за этого «Не очень» без правки типа не считалось
     * переносом: задача закрывалась (complete), новая не создавалась (add под
     * тем же isPlanned), и клиент молча выпадал из обзвона.
     *
     * Выключенный план («Без плана») переносом не считается — там менеджер
     * фиксирует недозвон и не назначает следующий шаг; задачу в этом случае
     * не трогает и task-flow.
     *
     * Финальный статус («Отказ»/«Продажа») переносом не бывает по определению:
     * работа с клиентом окончена, и задачу нужно ЗАКРЫТЬ, даже если менеджер
     * пришёл в отчёт кнопкой «Не очень» и не выключал план руками (выключить
     * его на финальном статусе не даёт и сам экран — колонка плана там
     * схлопнута в «не планируется»).
     */
    get isExpired(): boolean {
        return (
            !this.isResult &&
            !this.isNew &&
            !this.isFail &&
            !this.isSuccessSale &&
            Boolean(this.dto.plan?.isActive)
        );
    }
    get planEventType(): EventReportEventType | null {
        const code = this.dto.plan?.type?.current?.code;
        return code ? this.normalizeEventType(code) : null;
    }
    get planEventName(): string {
        return this.dto.plan?.name ?? '';
    }
    /**
     * Дедлайн плана как момент времени портала; null — план без дедлайна.
     * Сырую строку `dto.plan.deadline` наружу не отдаём: она без таймзоны,
     * и записанная в Bitrix как есть разъезжается на не-московских порталах.
     * Целевые форматы — только через {@link BitrixDateTime}.
     */
    get planDeadline(): BitrixDateTime | null {
        if (this.planDeadlineVo === undefined) {
            const raw = this.dto.plan?.deadline?.trim() ?? '';
            this.planDeadlineVo = raw ? this.dateTime.fromInput(raw) : null;
        }
        return this.planDeadlineVo;
    }
    private planDeadlineVo?: BitrixDateTime | null;
    /**
     * Флаг «важная» из UI планирования (todo2508-02 №10): менеджер отметил
     * задачу важной руками. Отдельно от «важных» ТИПОВ событий
     * (IMPORTANT_PLAN_TYPES в task-flow): флаг поднимает приоритет любому
     * типу, тип — сам по себе. Старые сборки фрейма поле не шлют — false.
     */
    get isPlanMarkedImportant(): boolean {
        return Boolean(this.dto.plan?.isImportant);
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
    /**
     * Нормализация кода события — общая с stage-predict
     * (normalizeEventReportEventType): предикт обязан считать стадию тем же
     * алфавитом, что и реальный прогон.
     */
    private normalizeEventType(raw: string): EventReportEventType {
        return normalizeEventReportEventType(raw);
    }
}
