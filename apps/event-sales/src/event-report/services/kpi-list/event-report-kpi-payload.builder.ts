import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    KpiEventDedup,
    KpiEventPayload,
} from '../../../shared/kpi-list-flow/type/kpi-event-payload.type';
import {
    EventTypeCode,
    EventActionCode,
    OpWorkStatusCode,
    OpResultStatusCode,
    OpFailTypeCode,
    OpProspectsTypeCode,
    OpNoresultReasonCode,
    OpFailReasonCode,
    EventReportEventType,
    eventTypeName,
} from '../../types/event-report.event-codes';
import { EventReportContext } from '../context/event-report.context';
import { EEventReportEntityType } from '../init/event-report-init.types';
import { DealFlowResult } from '../deal/event-report-deal-flow.service';
import { toBatchText } from '@lib/bitrix/consts/batch.consts';

import { EnumWorkStatusCode } from '../../types/report-types';

/**
 * Смещения event_date (секунды) — читаемая хронология шагов ОДНОГО отчёта
 * при сортировке ленты по дате (todo2508 №14). Спонтанная презентация:
 *   звонок состоялся (0) → презентация запланирована (+1) →
 *   презентация состоялась (+2) → следующий план, например ЗПР (+3).
 * Плановая презентация пары «запланирована/состоялась» не даёт:
 *   отчёт-презентация (0) → следующий план (+1).
 * Раньше пары (report, unplannedPlan) и (presDone, plan) получали равные
 * даты — порядок внутри пар в ленте был недетерминированным.
 */
const PLAN_EVENT_DATE_OFFSET_SEC = 1;
const UNPLANNED_PRES_PLAN_OFFSET_SEC = 1;
const UNPLANNED_PRES_DONE_OFFSET_SEC = 2;
const UNPLANNED_NEXT_PLAN_OFFSET_SEC = 3;
/**
 * Финал (продажа/отказ) — всегда ПОСЛЕДНИЙ шаг хронологии отчёта: сначала
 * отчётная запись по звонку (в т.ч. недозвонная «Не состоялся»), следующим
 * тиком секунды — финальная «Продажа»/«Отказ» (todo2508-02 №8: при
 * недозвонном отказе обе записи обязаны быть, финал — отдельным элементом).
 * План с финалом не сосуществует (buildPlan гасится при fail/success),
 * поэтому слот +1 свободен; при спонтанной презентации финал уходит за
 * пару «запланирована/состоялась» — на слот следующего плана (+3).
 */
const FINAL_EVENT_DATE_OFFSET_SEC = PLAN_EVENT_DATE_OFFSET_SEC;

/**
 * KPI-сценарии (см. event-report-service-map.md «Блок 4»):
 * `unique` — уникальные презентации sales_kpi
 * (presentation_uniq / presentation_contact_uniq, легаси-коды).
 */
export type KpiScenario =
    | 'report'
    | 'unplanned_presentation_plan'
    | 'presentation_done'
    | 'plan'
    | 'final'
    | 'unique';

/**
 * Тип события → код item'а списка KPI (`event_type`).
 *
 * Именно `Record`, а не `switch`: TypeScript требует запись для КАЖДОГО
 * значения `EventReportEventType`, поэтому новый тип события физически
 * нельзя добавить, забыв про KPI. Раньше здесь был switch с `default`, и
 * несведённый код молча превращался в «звонок» либо в `null` — записи
 * (включая продажу и отказ) пропадали из отчётности.
 *
 * Заявки НЕ сливаются с холодным обзвоном: `xoRequest` пишется кодом `site`
 * («Заявка с сайта»), `xoLead` — `come_call` («Входящий звонок»). Оба item'а
 * уже есть в списке KPI (PBX_SALES_KPI_LIST_FIELDS) и учитываются отчётом ОП
 * в той же группе «Звонок», что и `xo`, — сводные цифры не разъезжаются.
 *
 * ⚠ ТОЧКА РАЗРЫВА РЯДА: раздельные коды введены 13.08.2026 по решению
 * владельца. ДО этой даты все холодные события писались как `xo`, поэтому
 * сравнивать заявки (`site`/`come_call`) с более ранними периодами нельзя —
 * там их просто нет. Сводная строка «Звонок» сопоставима, разрез по видам —
 * только с 13.08.2026.
 *
 * Захотят снова считать все холодные одним кодом — правится ТОЛЬКО эта
 * таблица (и парная `WORK_KIND_TO_KPI_EVENT_TYPE` в lead-to-work-kpi.service).
 */
const EVENT_TYPE_TO_KPI_ITEM: Record<EventReportEventType, EventTypeCode> = {
    xo: 'xo',
    xoRequest: 'site',
    xoLead: 'come_call',
    warm: 'call',
    presentation: 'presentation',
    hot: 'call_in_progress',
    /*
     * Доработка ВЕЗДЕ считается «Звонком» — и в сводке, и в истории
     * (решение владельца, подтверждено 27.08).
     *
     * Свой item `refine` в истории был ошибкой: на портале он не
     * установлен в поле EVENT_TYPE списков, и Битрикс показывал у записи
     * пустой тип — «событие неопределён». Доработку по-прежнему видно по
     * имени записи: `withRefineMark` ставит префикс «Доработка: ».
     */
    refine: 'call',
    moneyAwait: 'call_in_money',
    // Своих кодов в KPI у них нет; по смыслу это разговор с клиентом.
    supply: 'call',
    document: 'call',
};

/**
 * Пометка доработки в имени записи: тип в KPI — общий «call», и без
 * префикса запись «Доработка» в сводке неотличима от обычного звонка.
 * Имя попадает и в event_title (assemble пишет их одинаково).
 */
function withRefineMark(
    name: string,
    type: EventReportEventType | null,
): string {
    if (type !== 'refine') return name;
    // Имени нет (заголовок задачи его не нёс) — пишем «Доработка» без
    // двоеточия: висячее «Доработка: » выглядело обрывом записи (todo3108
    // №3), а сама пометка типа нужна и без названия.
    const trimmed = name.trim();
    return trimmed ? `Доработка: ${trimmed}` : 'Доработка';
}

/**
 * Маппинг типа события → код item'а KPI.
 *
 * `null` только тогда, когда типа события НЕТ вовсе (ни отчёта, ни плана).
 * Для любого известного типа возврат гарантирован таблицей выше; на случай
 * кода, проехавшего мимо типов (данные с портала), остаётся `call` — как в
 * легаси (bx-event-flow.service): неизвестный код не должен УНИЧТОЖАТЬ
 * запись.
 */
function mapEventType(type: EventReportEventType | null): EventTypeCode | null {
    if (!type) return null;
    return EVENT_TYPE_TO_KPI_ITEM[type] ?? 'call';
}

function mapWorkStatus(ctx: EventReportContext): OpWorkStatusCode | undefined {
    if (ctx.isSuccessSale) return 'op_status_success';
    if (ctx.isFail) return 'op_status_fail';
    if (ctx.workStatusCode === EnumWorkStatusCode.setAside)
        return 'op_status_in_long';
    if (ctx.planEventType === 'hot') return 'op_status_in_progress';
    if (ctx.planEventType === 'moneyAwait') return 'op_status_money_await';
    if (ctx.isInWork) return 'op_status_in_work';
    return undefined;
}

function mapResultStatus(isResult: boolean): OpResultStatusCode {
    return isResult ? 'op_call_result_yes' : 'op_call_result_no';
}

function mapFailType(
    code: string | null | undefined,
): OpFailTypeCode | undefined {
    if (!code) return undefined;
    const known: ReadonlyArray<OpFailTypeCode> = [
        'garant',
        'no_perspect',
        'go',
        'territory',
        'accountant',
        'autsorc',
        'depend',
        'failure',
        'nofailure',
    ];
    return known.includes(code as OpFailTypeCode)
        ? (code as OpFailTypeCode)
        : undefined;
}

function mapFailReason(
    code: string | null | undefined,
): OpFailReasonCode | undefined {
    if (!code) return undefined;
    const known: ReadonlyArray<OpFailReasonCode> = [
        'fail_notime',
        'c_habit',
        'c_prepay',
        'c_price',
        'to_expensive',
        'to_cheap',
        'nomoney',
        'noneed',
        'lpr',
        'employee',
    ];
    return known.includes(code as OpFailReasonCode)
        ? (code as OpFailReasonCode)
        : undefined;
}

/**
 * Причина отказа для KPI — ровно та, что выбрал менеджер.
 *
 * Гейт целиком в `ctx.failReasonCode` (см. EventReportContext): причина
 * существует только при типе отказа «Отказ» и не при «не ЦА». Без него
 * дефолт селекта («Не было времени») ложился в KPI при восьми типах отказа
 * из девяти, и отчёт по причинам отказа врал.
 */
function mapFailReasonGuarded(
    ctx: EventReportContext,
): OpFailReasonCode | undefined {
    return mapFailReason(ctx.failReasonCode);
}

function mapNoresultReason(
    code: string | null | undefined,
): OpNoresultReasonCode | undefined {
    if (!code) return undefined;
    const known: ReadonlyArray<OpNoresultReasonCode> = [
        'secretar',
        'nopickup',
        'nonumber',
        'busy',
        'noresult_notime',
        'nocontact',
        'giveup',
        'bay',
        'wrong',
        'auto',
    ];
    return known.includes(code as OpNoresultReasonCode)
        ? (code as OpNoresultReasonCode)
        : undefined;
}

/**
 * Тип нерезультативности пишется ТОЛЬКО для несостоявшихся разговоров.
 *
 * Фронт шлёт `noresultReason` всегда (дефолт селекта — «Недозвон - трубку
 * не берут»), а `isActive` бэк не читает — поэтому без гарда КАЖДОЕ событие,
 * включая результативные и финалы, получало «недозвон». Легаси-гард
 * (example legacy-flow.php:234-256) при переносе был потерян: при
 * result/new поле явно очищалось — возвращаем ровно эту семантику
 * (`null` = очистка, см. KpiEventItemCodes).
 */
function mapNoresultReasonGuarded(
    ctx: EventReportContext,
): OpNoresultReasonCode | null {
    if (ctx.isResult || ctx.isNew) return null;
    return (
        mapNoresultReason(ctx.dto.report?.noresultReason?.current?.code) ?? null
    );
}

function mapProspects(
    failTypeCode: string | undefined,
    ctx: EventReportContext,
): OpProspectsTypeCode | undefined {
    if (ctx.isInWork || ctx.isSuccessSale) return undefined;
    // «Не ЦА»: тип отказа не выбирался (дефолт в DTO) — без перспектив.
    if (ctx.isNotCa) return 'op_prospects_nopersp';
    if (!failTypeCode) return 'op_prospects_nopersp';
    const m: Partial<Record<string, OpProspectsTypeCode>> = {
        garant: 'op_prospects_garant',
        go: 'op_prospects_go',
        territory: 'op_prospects_territory',
        accountant: 'op_prospects_acountant',
        autsorc: 'op_prospects_autsorc',
        depend: 'op_prospects_depend',
        op_prospects_nophone: 'op_prospects_nophone',
        op_prospects_company: 'op_prospects_company',
        failure: 'op_prospects_fail',
    };
    return m[failTypeCode] ?? 'op_prospects_nopersp';
}

/**
 * Строит payload'ы для каждого требующегося KPI-сценария.
 * Сервис-потребитель просто прогоняет результат через KpiListFlowService.
 */
export class EventReportKpiPayloadBuilder {
    constructor(
        private readonly portal: PortalModel,
        private readonly ctx: EventReportContext,
        private readonly deals: DealFlowResult,
    ) {}

    /** Возвращает упорядоченный список payload'ов для всех применимых сценариев. */
    buildAll(): KpiEventPayload[] {
        const payloads: KpiEventPayload[] = [];

        const reportPayload = this.buildReport();
        if (reportPayload) payloads.push(reportPayload);

        const unplannedPresPlan = this.buildUnplannedPresentationPlan();
        if (unplannedPresPlan) payloads.push(unplannedPresPlan);

        const presDone = this.buildPresentationDone();
        if (presDone) payloads.push(presDone);

        const plan = this.buildPlan();
        if (plan) payloads.push(plan);

        const final = this.buildFinal();
        if (final) payloads.push(final);

        payloads.push(
            ...this.buildPresentationUniq({
                unplannedPresPlan,
                presDone,
                plan,
            }),
        );

        return payloads;
    }

    // ---------- сценарии ----------

    private buildReport(): KpiEventPayload | null {
        const ctx = this.ctx;
        if (ctx.isNew || ctx.isExpired) return null;
        /*
         * Отчёт по презентации живёт в сценариях buildPresentationDone/
         * buildPlan; исключение — недозвон (isNoCall): у него презентационных
         * сценариев нет, и без этой ветки быстрый недозвон по задаче
         * «Презентация» не оставлял бы ни одной записи. Легаси-правило
         * дословно: PHP писал отчёт при `!== 'presentation' || isNoCall`
         * (порт в event-flow.service.ts:273).
         */
        if (ctx.reportEventType === 'presentation' && !ctx.isNoCall) {
            return null;
        }

        const eventType = mapEventType(ctx.reportEventType);
        if (!eventType) return null;

        /*
         * Как в легаси (BitrixListFlowService.php:558): несостоявшийся
         * разговор — act_noresult_fail («Не Состоялся»), а не expired.
         * Отчётная запись пишется И ПРИ ФИНАЛЕ — двойного счёта с финальной
         * нет, потому что финал несёт СВОЙ тип события (ev_success/ev_fail),
         * а не тип звонка (EventReportService.php:3456 + :3643).
         */
        const action: EventActionCode = ctx.isResult
            ? 'done'
            : 'act_noresult_fail';

        return this.assemble({
            scenario: 'report',
            name: withRefineMark(
                ctx.reportEventName || ctx.planEventName,
                ctx.reportEventType,
            ),
            eventType,
            action,
            crm: this.crmLinks(),
            // История различает доработку своим item'ом; сводка KPI — нет.
            historyItems: undefined,
        });
    }

    private buildUnplannedPresentationPlan(): KpiEventPayload | null {
        const ctx = this.ctx;
        if (!ctx.isUnplannedPresentation || ctx.isExpired) return null;
        /*
         * Незапланированная презентация даёт ПАРУ записей с читаемой
         * хронологией ПОСЛЕ отчётной: звонок (0) → «запланирована» (+1) →
         * «состоялась» (+2). Раньше эта запись шла без смещения и совпадала
         * датой с отчётной — порядок в ленте был недетерминированным.
         */
        return this.assemble({
            scenario: 'unplanned_presentation_plan',
            name: `Незапланированная презентация ${this.nowFormatted()}`,
            eventType: 'presentation',
            action: 'plan',
            crm: this.crmLinks(),
            eventDateOffsetSec: UNPLANNED_PRES_PLAN_OFFSET_SEC,
        });
    }

    private buildPresentationDone(): KpiEventPayload | null {
        const ctx = this.ctx;
        if (!ctx.isPresentationDone || ctx.isExpired) return null;
        return this.assemble({
            scenario: 'presentation_done',
            name: `Презентация состоялась ${this.nowFormatted()}`,
            eventType: 'presentation',
            action: 'done',
            crm: this.crmLinks(),
            // Пара к «Незапланированной презентации»: факт проведения — ПОЗЖЕ
            // факта планирования (см. хронологию у констант смещений).
            eventDateOffsetSec: this.ctx.isUnplannedPresentation
                ? UNPLANNED_PRES_DONE_OFFSET_SEC
                : undefined,
        });
    }

    private buildPlan(): KpiEventPayload | null {
        const ctx = this.ctx;
        /*
         * Перенос пишется этой же записью с action `pound`, и писать её надо
         * даже без выбранного типа плана: при переносе тип не выбирают заново
         * — событие то же самое, просто на другую дату. Раньше такой отчёт
         * («Не очень» без правки типа — самый массовый случай) не давал НИ
         * ОДНОЙ записи: отчётную глушил isExpired, а плановую — isPlanned.
         */
        if (!ctx.isPlanned && !ctx.isExpired) return null;
        if (ctx.isSuccessSale || ctx.isFail) return null;
        // При переносе тип берём от события отчёта — он и остаётся у задачи.
        const planEventType = ctx.planEventType ?? ctx.reportEventType;
        const eventType = mapEventType(planEventType);
        if (!eventType) return null;
        return this.assemble({
            scenario: 'plan',
            name: withRefineMark(
                ctx.planEventName || ctx.reportEventName,
                planEventType,
            ),
            eventType,
            action: ctx.isExpired ? 'pound' : 'plan',
            crm: this.crmLinks(),
            // При спонтанной презентации план (например, ЗПР) — последний
            // шаг хронологии, после «запланирована»/«состоялась».
            eventDateOffsetSec: ctx.isUnplannedPresentation
                ? UNPLANNED_NEXT_PLAN_OFFSET_SEC
                : PLAN_EVENT_DATE_OFFSET_SEC,
            // История различает доработку своим item'ом; сводка KPI — нет.
            historyItems: undefined,
        });
    }

    private buildFinal(): KpiEventPayload | null {
        const ctx = this.ctx;
        if (!ctx.isSuccessSale && !ctx.isFail) return null;
        /*
         * Финал несёт СОБСТВЕННЫЙ тип события — ev_success / ev_fail, как в
         * легаси (getEventType, BitrixListFlowService.php:1052-1056; вызов —
         * EventReportService.php:3643-3676 с eventType 'success'/'fail').
         * Тип звонка остаётся у ОТЧЁТНОЙ записи (buildReport) — поэтому
         * двойного счёта по паре тип+действие нет.
         *
         * Расхождение с легаси — СОЗНАТЕЛЬНОЕ, по требованию владельца:
         * легаси писал финал со СЛУЧАЙНЫМ кодом (повторная отправка плодила
         * дубли), у нас код детерминирован и повтор ОБНОВЛЯЕТ элемент
         * (crm-привязки, даты, причину). Имя тоже подробнее легаси
         * («Продажа»/«Отказ» → finalName с поводом и причиной).
         */
        return this.assemble({
            scenario: 'final',
            name: this.finalName(),
            eventType: ctx.isSuccessSale ? 'ev_success' : 'ev_fail',
            action: 'done',
            crm: this.crmLinks(),
            // Финал — последний шаг хронологии: следующим тиком секунды после
            // отчётной записи (недозвонный отказ даёт ПАРУ «Не состоялся» →
            // «Отказ», и порядок в ленте обязан быть детерминированным).
            eventDateOffsetSec: ctx.isUnplannedPresentation
                ? UNPLANNED_NEXT_PLAN_OFFSET_SEC
                : FINAL_EVENT_DATE_OFFSET_SEC,
            dedup: {
                key: this.finalDedupKey(),
                scope: 'both',
                mode: 'upsert',
            },
        });
    }

    /**
     * Код финального элемента (он же ELEMENT_CODE дедупа).
     *
     * Решение владельца (25.08): один финал НА ЦИКЛ РАБОТЫ, а не на
     * сущность навсегда. Прежний ключ `final_{entity}_{id}` съедал новые
     * отказы: у давнего клиента финал уже существовал, и upsert лишь
     * обновлял старую запись — в ленте новый исход не появлялся. Состав:
     *  - вид финала: продажа / отказ / «не ЦА» (не ЦА — ОТДЕЛЬНЫЙ вид
     *    отказа: его финал не должен склеиваться с обычным и наоборот);
     *  - клиент (компания, фолбэк — сущность-владелец у лид-only);
     *  - основная сделка цикла (создана этим же отчётом — литерал `new`:
     *    числового id в момент сборки batch ещё нет);
     *  - менеджер.
     * Повтор ТОГО ЖЕ исхода тем же менеджером по той же сделке по-прежнему
     * обновляет элемент, а не плодит дубли.
     */
    private finalDedupKey(): string {
        const ctx = this.ctx;
        const kind = ctx.isSuccessSale
            ? 'sale'
            : ctx.isNotCa
              ? 'notca'
              : 'fail';
        const companyId =
            ctx.entityType === EEventReportEntityType.COMPANY
                ? ctx.entityId
                : Number(ctx.company?.ID) || null;
        const client = companyId ?? `${ctx.entityType}${ctx.entityId}`;
        const dealId =
            Number(ctx.currentBaseDeal?.ID ?? this.deals.baseDealId) || 'new';
        const userId = ctx.planResponsibleId || 0;
        return `final_${kind}_${client}_${dealId}_${userId}`;
    }

    /**
     * Уникальные презентации — ТОЧНАЯ копия легаси-схемы
     * (hook/app/Services/HookFlow/BitrixListFlowService.php:823-905):
     *
     *  - уникальная запись = КОПИЯ обычной записи презентации с подменённым
     *    `event_type` и детерминированным кодом; пишется ТОЛЬКО в sales_kpi
     *    (history — полная лента);
     *  - уровни зернистости ключа:
     *      company+deal:          `{companyId}_{baseDealId}_{plan|done}`
     *      company+deal+contact:  `{companyId}_{baseDealId}_ {contactId}_{plan|done}`
     *      (подчёркивание+ПРОБЕЛ перед contactId — легаси-формат :895-902,
     *      сохраняем бук-в-букву ради совместимости с элементами на порталах);
     *  - `presentation_uniq` — company-уровень, `presentation_contact_uniq` —
     *    contact-уровень (:826, :891);
     *  - гейт (:823): только result|new; исключение — «план вхолостую»
     *    незапланированной презентации, легаси хардкодит result
     *    (EventReportService.php:3517) и uniq-plan пишется всегда;
     *  - ЛИД в ключах НЕ участвует — так в легаси (ключи только
     *    company/deal/contact), поэтому лид-only события уникальных записей
     *    не порождают;
     *  - легаси-вариант `_done_{responsible}` (ТМЦ-ответственный ≠ su,
     *    :840) у нас недостижим: сценарий «презентация от имени ТМЦ» на
     *    Nest ещё не перенесён.
     *
     * Уникальность — insert-once по коду: легаси добивался того же отказом
     * Битрикса создать дубль кода.
     */
    private buildPresentationUniq(sources: {
        unplannedPresPlan: KpiEventPayload | null;
        presDone: KpiEventPayload | null;
        plan: KpiEventPayload | null;
    }): KpiEventPayload[] {
        const ctx = this.ctx;
        const out: KpiEventPayload[] = [];

        // Легаси-предусловие: ключ строится из компании и базовой сделки.
        const companyId =
            ctx.entityType === EEventReportEntityType.COMPANY
                ? ctx.entityId
                : Number(ctx.company?.ID) || null;
        const leadId =
            ctx.entityType === EEventReportEntityType.LEAD
                ? ctx.entityId
                : Number(ctx.lead?.ID) || null;
        /*
         * Слот владельца в ключе: КОМПАНИЯ, а без неё — ЛИД («он будет как
         * бы заменой компании» — расширение новой версии поверх легаси:
         * там ситуация «компании нет, но есть лид» не существовала).
         *
         * Форматы слота НАМЕРЕННО разные:
         *  - компания — голый числовой id, бук-в-букву легаси-формат
         *    (совместимость с элементами, уже записанными PHP-хуком);
         *  - лид — с явным маркером `lead{id}`: id-пространства компаний и
         *    лидов независимы, и голый leadId в коде мог бы численно
         *    совпасть с чужим companyId — дедуп ложно сработал бы об чужую
         *    запись. Легаси лид-ключей никогда не писал, поэтому новый
         *    формат совместимости не ломает.
         */
        const owner = companyId ?? (leadId ? `lead${leadId}` : null);
        const baseDealId =
            this.deals.baseDealId ??
            (ctx.entityType === EEventReportEntityType.DEAL
                ? ctx.entityId
                : null);
        // Без владельца ключа не существует вовсе.
        if (!owner) return out;
        /*
         * Отсутствие базовой сделки:
         *  - для КОМПАНИИ — гейт остаётся: company-ключи всегда c
         *    deal-сегментом (бук-в-букву легаси), а company-flow без
         *    базовой сделки в наших сценариях недостижим (isDealFlow её
         *    создаёт);
         *  - для ЛИДА — решение владельца: uniq пишется БЕЗ deal-сегмента
         *    (`lead{id}_done`), lead-only работа без сделок — штатный
         *    случай. Когда работа дорастёт до сделки, следующая
         *    презентация получит `lead{id}_{deal}_done` — две «уникальные»
         *    по одному клиенту (до сделки и после) осознанно допустимы.
         */
        if (!baseDealId && companyId) return out;

        const resultOrNew = ctx.isResult || ctx.isNew;

        // План презентации (осознанный) — uniq-plan при result|new.
        const plannedPres =
            ctx.planEventType === 'presentation' && !ctx.isExpired
                ? sources.plan
                : null;
        if (plannedPres && resultOrNew) {
            out.push(
                ...this.presentationUniqPair(
                    plannedPres,
                    'plan',
                    owner,
                    baseDealId,
                    ctx.dto.plan?.contact?.ID,
                ),
            );
        }
        // «План вхолостую» незапланированной — без гейта (легаси хардкодит
        // result). Если план-uniq уже создан выше, код совпадёт и второй
        // не пишется (insert-once), поэтому явно не дублируем.
        if (sources.unplannedPresPlan && !(plannedPres && resultOrNew)) {
            out.push(
                ...this.presentationUniqPair(
                    sources.unplannedPresPlan,
                    'plan',
                    owner,
                    baseDealId,
                    ctx.dto.report?.contact?.ID,
                ),
            );
        }
        // Презентация состоялась — uniq-done при result|new.
        if (sources.presDone && resultOrNew) {
            out.push(
                ...this.presentationUniqPair(
                    sources.presDone,
                    'done',
                    owner,
                    baseDealId,
                    ctx.dto.report?.contact?.ID,
                ),
            );
        }
        return out;
    }

    /**
     * Пара уникальных записей одного действия: owner-уровень всегда,
     * contact-уровень — при известном контакте. Каждая — клон исходной
     * записи с другим `event_type` и легаси-кодом. `owner` — числовой
     * companyId (легаси-формат) либо `lead{id}` (замена компании лидом,
     * см. buildPresentationUniq).
     */
    private presentationUniqPair(
        source: KpiEventPayload,
        action: 'plan' | 'done',
        owner: string | number,
        /** null — lead-only без базовой сделки: deal-сегмент опускается. */
        baseDealId: string | number | null,
        contactId: string | number | undefined,
    ): KpiEventPayload[] {
        const clone = (
            eventType: EventTypeCode,
            key: string,
        ): KpiEventPayload => ({
            ...source,
            items: { ...source.items, event_type: eventType },
            dedup: {
                key,
                scope: 'kpi',
                mode: 'insert-once',
                requireEventTypeItem: true,
            },
        });

        // Префикс из ПРИСУТСТВУЮЩИХ сегментов: без сделки deal-сегмент
        // опускается целиком — пустых `__` в кодах не бывает.
        const prefix =
            baseDealId != null ? `${owner}_${baseDealId}` : `${owner}`;

        const pair: KpiEventPayload[] = [
            clone('presentation_uniq', `${prefix}_${action}`),
        ];
        if (contactId) {
            pair.push(
                clone(
                    'presentation_contact_uniq',
                    // Подчёркивание+пробел — легаси-формат, менять нельзя.
                    `${prefix}_ ${contactId}_${action}`,
                ),
            );
        }
        return pair;
    }

    /**
     * Имя финальной записи — «отдельно и подробно»: тип события + повод +
     * причина. Примеры: «Отказ: Звонок по решению — Нет денег»,
     * «Продажа: спонтанная презентация».
     */
    private finalName(): string {
        const ctx = this.ctx;
        const base = ctx.isSuccessSale
            ? 'Продажа'
            : ctx.isNotCa
              ? 'Не ЦА'
              : 'Отказ';

        const occasion = ctx.isUnplannedPresentation
            ? 'спонтанная презентация'
            : ctx.isPresentationDone
              ? 'презентация'
              : (ctx.reportEventType ?? ctx.planEventType)
                ? eventTypeName(ctx.reportEventType ?? ctx.planEventType!)
                : ctx.reportEventName;

        // При «не ЦА» отказные селекты не выбирались (в DTO дефолты) —
        // причиной идёт имя типа «не ЦА» из слепка портала.
        const reason = ctx.isNotCa
            ? this.notCaTypeName()
            : ctx.isFail
              ? this.failReasonLabel()
              : '';

        let name = occasion ? `${base}: ${occasion}` : base;
        if (reason) name += ` — ${reason}`;
        return name;
    }

    /**
     * Подпись отказа в имени финальной записи.
     *
     * Причина («Нет денег») — только когда менеджер её ВЫБИРАЛ, то есть при
     * типе отказа «Отказ»; при остальных восьми типах подписью идёт сам тип
     * («Гарант/Запрет», «Покупает ГО», …). Раньше здесь всегда выигрывало
     * имя причины — фронт присылает её дефолт, и финал по гаранту читался
     * как «Отказ: Звонок — Не было времени».
     */
    private failReasonLabel(): string {
        const report = this.ctx.dto.report;
        if (this.ctx.failReasonCode) {
            return report?.failReason?.current?.name ?? '';
        }
        return report?.failType?.current?.name ?? '';
    }

    /** Имя типа «не ЦА» по коду из leadSync (поле лида в слепке портала). */
    private notCaTypeName(): string {
        const code = this.ctx.dto.leadSync?.notCaTypeCode;
        if (!code) return '';
        const field = this.portal.getEntityFieldByCode(
            'lead',
            'op_lead_not_ca_type',
        );
        if (!field) return '';
        return this.portal.getFieldItemByCode(field, code)?.name ?? '';
    }

    // ---------- helpers ----------

    private assemble(input: {
        scenario: KpiScenario;
        name: string;
        eventType: EventTypeCode;
        action: EventActionCode;
        crm: Record<string, string>;
        /**
         * Смещение event_date в секундах. План-элементы пишутся на +1 c от
         * отчёта: события приходят в один момент, но хронологически сначала
         * происходит то, о чём отчитались, потом — что запланировали
         * (как в legacy PHP). Без смещения сортировка по дате перемешивает
         * логическую последовательность.
         */
        eventDateOffsetSec?: number;
        /** Правило дедупликации (финал/уникальные); нет — множественная. */
        dedup?: KpiEventDedup;
        /** Override item'ов для sales_history (см. KpiEventPayload). */
        historyItems?: KpiEventPayload['historyItems'];
    }): KpiEventPayload {
        const ctx = this.ctx;
        const failTypeCode = ctx.dto.report?.failType?.current?.code;
        const eventDate = input.eventDateOffsetSec
            ? new Date(ctx.nowDate.getTime() + input.eventDateOffsetSec * 1000)
            : ctx.nowDate;

        return {
            name: input.name,
            values: {
                event_date: this.formatCrm(eventDate),
                event_title: input.name,
                plan_date: ctx.planDeadline?.toCrmDateTime() ?? null,
                author: ctx.planCreatedById || ctx.planResponsibleId,
                responsible: ctx.planResponsibleId,
                su: ctx.planResponsibleId,
                crm: input.crm,
                crm_company:
                    ctx.entityType === EEventReportEntityType.COMPANY &&
                    ctx.entityId
                        ? { n0: `CO_${ctx.entityId}` }
                        : undefined,
                crm_contact: ctx.dto.report?.contact?.ID
                    ? { n0: `C_${ctx.dto.report.contact.ID}` }
                    : undefined,
                // Комментарий уходит в lists.element.* через batch-строку:
                // сырые \n там теряются, экранируем в %0A.
                manager_comment: toBatchText(ctx.reportComment),
            },
            items: {
                event_type: input.eventType,
                event_action: input.action,
                op_result_status: mapResultStatus(ctx.isResult),
                op_noresult_reason: mapNoresultReasonGuarded(ctx),
                op_work_status: mapWorkStatus(ctx),
                // Тип и причина отказа — только у настоящего отказа: гейты
                // целиком в контексте (ctx.failTypeCode / ctx.failReasonCode).
                // Фронт шлёт оба селекта всегда, дефолтами «Гарант/Запрет» и
                // «Не было времени», и без гейтов они уезжали в сводку при
                // отчётах, где отказа не было вовсе.
                op_fail_type: mapFailType(ctx.failTypeCode),
                op_fail_reason: mapFailReasonGuarded(ctx),
                op_prospects_type: mapProspects(failTypeCode, ctx),
            },
            historyItems: input.historyItems,
            dedup: input.dedup,
            scenario: input.scenario,
        };
    }

    private crmLinks(): Record<string, string> {
        const links: Record<string, string> = {};
        const seen = new Set<string>();
        let i = 0;
        // Дедуп на входе: привязки задачи (ufCrmTask) пересекаются с
        // владельцем/сделками контекста, а дубль `D_25359` в crm-поле —
        // мусор в карточке элемента.
        const push = (v: string) => {
            if (seen.has(v)) return;
            seen.add(v);
            links[`n${i++}`] = v;
        };
        if (
            this.ctx.entityType === EEventReportEntityType.COMPANY &&
            this.ctx.entityId
        ) {
            push(`CO_${this.ctx.entityId}`);
        }
        if (
            this.ctx.entityType === EEventReportEntityType.LEAD &&
            this.ctx.entityId
        ) {
            push(`L_${this.ctx.entityId}`);
        }
        /*
         * Лид контекста при владельце-сделке/компании: без этой привязки
         * отказ по сделке с лидом не находится ПО ЛИДУ — а карточка заявки
         * читает свою историю именно по `L_*`.
         */
        const contextLead =
            this.ctx.entityType !== EEventReportEntityType.LEAD
                ? Number(this.ctx.lead?.ID)
                : NaN;
        if (Number.isFinite(contextLead) && contextLead > 0) {
            push(`L_${contextLead}`);
        }
        // Заявка, с которой менеджер связал презентацию (модалка перед
        // отправкой): из лида должны быть видны KPI-записи этого отчёта.
        const linkedLead = this.ctx.dto.leadSync?.presentationLink
            ? Number(this.ctx.dto.leadSync.leadId)
            : NaN;
        if (
            Number.isFinite(linkedLead) &&
            linkedLead > 0 &&
            String(linkedLead) !== String(contextLead) &&
            !(
                this.ctx.entityType === EEventReportEntityType.LEAD &&
                String(this.ctx.entityId) === String(linkedLead)
            )
        ) {
            push(`L_${linkedLead}`);
        }
        // Владелец-сделка: запись истории/KPI обязана ссылаться на сделку —
        // по этой привязке история потом и читается.
        if (
            this.ctx.entityType === EEventReportEntityType.DEAL &&
            this.ctx.entityId
        ) {
            push(`D_${this.ctx.entityId}`);
        }
        if (
            this.deals.baseDealId &&
            String(this.deals.baseDealId) !== String(this.ctx.entityId)
        ) {
            push(`D_${this.deals.baseDealId}`);
        }
        if (this.deals.newPlanPresDealId) {
            push(`D_${this.deals.newPlanPresDealId}`);
        }
        if (this.deals.newUnplannedPresDealId) {
            push(`D_${this.deals.newUnplannedPresDealId}`);
        }
        const reportContact = this.ctx.dto.report?.contact?.ID;
        if (reportContact) {
            push(`C_${reportContact}`);
        }
        /*
         * Привязки САМОЙ задачи (ufCrmTask): элемент обязан ссылаться на все
         * сущности задачи (todo2508-02 №2 — недозвон из списка дел). Контекст
         * фрейма знает только владельца (company/deal/lead карточки), а
         * задача может быть связана с другими лидами/сделками — без этих
         * привязок запись не находится из их карточек. Дубли гасит push.
         */
        for (const link of this.taskCrmLinks()) {
            push(link);
        }
        return links;
    }

    /** CRM-привязки закрываемой задачи (`L_*`/`D_*`/`CO_*`/`C_*`) из DTO. */
    private taskCrmLinks(): string[] {
        const raw = this.ctx.dto.currentTask?.ufCrmTask;
        if (!Array.isArray(raw)) return [];
        return raw.filter(
            (v): v is string => typeof v === 'string' && /^[A-Z]+_\d+$/.test(v),
        );
    }

    private formatCrm(d: Date): string {
        return this.ctx.dateTime.crmDateTime(d);
    }

    private nowFormatted(): string {
        return this.formatCrm(this.ctx.nowDate);
    }
}
