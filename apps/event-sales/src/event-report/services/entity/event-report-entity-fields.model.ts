import {
    BATCH_LINE_BREAK_SYMBOL,
    toBatchText,
} from '@lib/bitrix/consts/batch.consts';
import { buildEventHistoryParts } from '../history/event-history-comment.builder';
import {
    EVENT_TASK_CHECKLIST_ITEM,
    isChecklistItemDone,
} from '../task/event-task-checklist.catalog';
import {
    IField,
    IFieldItem,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../context/event-report.context';
import {
    eventTypeName,
    GSIRK_DOMAIN,
} from '../../types/event-report.event-codes';
import { EnumWorkStatusCode } from '../../types/report-types';
import {
    EEventReportEntityType,
    EventReportEntityType,
} from '../init/event-report-init.types';

type EntityFieldValue = string | number | string[] | null;
type EntityFieldsMap = Record<string, EntityFieldValue>;

/**
 * Тип сущности, для которой формируются UF_CRM_* поля.
 * Логика portal-полей одинакова для всех — отличается только источник «текущих»
 * значений (для multiple-полей вроде op_mhistory).
 */
export type EntityFieldsTargetType = EventReportEntityType;

/**
 * Роль сделки (только для `entityType='deal'`). Нужна, чтобы понять, надо ли
 * добавлять `to_base_sales` (связь с корневой sales_base) и как обнулять
 * `pres_count`.
 */
export const EDealRole = {
    BASE: 'base',
    PRESENTATION: 'presentation',
    XO: 'xo',
    TMC: 'tmc',
} as const;

export type DealRole = (typeof EDealRole)[keyof typeof EDealRole];

/**
 * Лимиты на multiple-поля (исторически выставлены в legacy `EventReportService`).
 *
 * `op_mhistory` для gsirk сильно больше — этот портал использует историю как
 * аудит. На остальных порталах обрезаем чаще, чтобы Bitrix не отказал в
 * больших значениях.
 */
const HISTORY_LIMIT_DEFAULT = 12;
const HISTORY_LIMIT_GSIRK = 30;
const PRES_COMMENTS_LIMIT = 15;
const FAIL_COMMENTS_LIMIT = 18;

/**
 * Анкета после презентации: сводные («Хвост», «Пять К») + девять детальных
 * ответов «5К» + шесть обязательных вопросов «Разговора» (op_talk_*).
 * Значения пишет ФРЕЙМ прямо в ЛИД; event-report при
 * проведённой презентации разносит их тем же каркасом, что
 * `pres_comments`/`pres_count`, по правилам владельца:
 *  - основная (sales_base) сделка — всегда, ПЕРЕЗАТИРАЯ: смысл —
 *    «последняя проведённая презентация»;
 *  - pres-сделки — только та, ПО КОТОРОЙ отчитываются, и спонтанная
 *    (у каждой презентации своя запись); плановой — нет;
 *  - связанный с презентацией ЛИД — через EventReportLeadRequestSyncService
 *    (связь — presentationLink из модалки; лид контекста и есть «один
 *    открытый, прокинутый через задачу», ответы на нём уже стоят).
 *
 * Скаляры, не multiple: перенос перезаписывает прошлые значения. Сейчас на
 * сделках заведены только сводные; детальные разрезолвятся в пустоту и
 * молча пропустятся — а если владелец заведёт их и на сделках, перенос
 * подхватит их без правки кода.
 */
export const PRESENTATION_SURVEY_FIELD_CODES = [
    'op_presentation_xvost',
    'op_presentation_5k',
    // Шесть обязательных вопросов «Разговора»: до появления op_talk_* они
    // жили только в тексте комментария к презентации — прочитать их мог
    // человек, отфильтровать не мог никто. Переносятся тем же каркасом,
    // что и «5К»: источник — лид, приёмник — сделки.
    'op_talk_impression',
    'op_talk_remembered',
    'op_talk_desire',
    'op_talk_decision_process',
    'op_talk_price_opinion',
    'op_talk_boss_readiness',
    'op_5k_client_what',
    'op_5k_client_ready',
    'op_5k_client_price',
    'op_5k_company_who',
    'op_5k_company_how',
    'op_5k_company_right',
    'op_5k_command',
    'op_5k_concurent',
    'op_5k_criteri',
] as const;

/**
 * Deal-only поля хвоста (владельческая таблица todo2508): фрейм пишет их
 * в БАЗОВУЮ сделку, на лиде их нет вовсе — поэтому общий перенос анкеты
 * (источник — лид) их не видит. Пресс-сделка, по которой отчитались,
 * увозит СВОЙ снимок этих значений с базовой: следующая презентация
 * перезатрёт базовую, а история по каждой презентации сохранится.
 */
export const XVOST_DEAL_FIELD_CODES = [
    'op_xvost_decision_call_date',
    'op_xvost_decision_date_agreement',
    'op_manager_approach_date',
    'op_xvost_is_offer',
    'op_xvost_is_complect',
    'op_xvost_is_price',
] as const;

/**
 * Опции для построения полей сделки (entityType='deal').
 */
export interface DealFieldsOptions {
    /** Конкретная сделка-источник для чтения текущих multiple-полей (op_mhistory, pres_comments). */
    deal: Record<string, unknown> | null;
    /** Роль сделки — определяет связи и обнуление pres_count для презентации. */
    role: DealRole;
    /**
     * ID корневой sales_base сделки (реальный ID или `$result[set_base_deal]`).
     * Используется только для `role='presentation'` — выставляется в поле
     * `to_base_sales`. Для остальных ролей игнорируется.
     */
    baseDealId?: string | null;
    /**
     * Только для `role='presentation'`: состоялась ли презентация ИМЕННО на
     * этой сделке.
     *
     * Pres-сделка — это «элемент презентации», у неё счётчик не копится, а
     * равен 1 (презентация прошла) либо 0 (сделка только заведена под план).
     * Флаг ставит вызывающий: он единственный знает, какую из pres-сделок
     * сейчас собирает — обновляемую текущую, новую плановую или новую
     * незапланированную. Выводить это из общих флагов контекста нельзя:
     * «отчитались по презентации И запланировали следующую» — обычный
     * сценарий, и по флагам обе сделки выглядят одинаково.
     */
    presentationHappenedHere?: boolean;
}

/**
 * Чистая модель: получает {@link EventReportContext} и собирает мапу
 * `UF_CRM_*` → значение для company / lead / deal. Никаких побочных
 * эффектов: модель не дёргает Bitrix.
 *
 * Сценарии формирования полей следуют map из `event-report-service-map.md`
 * § «Блок 3: Поля сущностей».
 *
 * Для сделок (`entityType='deal'`):
 * - сама сделка передаётся через `dealOptions.deal`;
 * - для презентации добавляется `to_base_sales`;
 * - `pres_count` инкрементируется относительно current deal (или 0 для новой
 *   презентации; для plan/fail презентации стартует с -1 → ++ = 0).
 * - `ASSIGNED_BY_ID` для сделок не ставится — он уже выставляется
 *   deal-сервисом в base-полях.
 */
export class EventReportEntityFieldsModel {
    constructor(
        private readonly portal: PortalModel,
        private readonly ctx: EventReportContext,
        private readonly entityType: EntityFieldsTargetType,
        private readonly dealOptions: DealFieldsOptions | null = null,
    ) {}

    toFields(): EntityFieldsMap {
        const out: EntityFieldsMap = {};

        // ===== Always =====
        if (this.ctx.planEventType || this.ctx.reportEventType) {
            this.setScalar(out, 'call_last_date', this.nowCrmDate());
            this.setScalar(out, 'next_pres_plan_date', null);
            this.setScalar(out, 'call_next_date', null);
            this.setScalar(out, 'manager_op', this.ctx.planResponsibleId);
        }

        // ===== isPresentationDone =====
        if (this.ctx.isPresentationDone) {
            this.applyPresentationDoneStamp(out);
            this.bumpPresCount(out);
            this.appendMultiple(
                out,
                'pres_comments',
                this.presentationDoneComment(),
                PRES_COMMENTS_LIMIT,
            );
            this.copyPresentationSurvey(out);
        }

        // ===== Чек-лист закрытой задачи (фолбэк по презентации) =====
        this.applyChecklistFacts(out);

        // ===== isPlanned =====
        if (this.ctx.isPlanned) {
            this.applyPlannedFields(out);
        }

        // ===== isExpired =====
        if (this.ctx.isExpired) {
            this.applyExpiredFields(out);
        }

        // ===== Финальный статус =====
        if (!this.ctx.isPlanned) {
            if (this.ctx.isFail) {
                // «Не ЦА» — брак, а не отказ: история сущности обязана
                // называть исход своим именем, хотя по проводам он едет
                // отказным статусом (контракт очереди кода notCa не знает).
                this.setScalar(
                    out,
                    'op_current_status',
                    this.statusText(this.ctx.isNotCa ? 'Не ЦА' : 'Отказ'),
                );
                // Тип «не ЦА» — и на владельца (компанию/сделку), не только
                // на лид: поле заведено на всех трёх сущностях (todo2508),
                // item-коды у них совпадают (op_lead_not_ca_type1..4).
                if (this.ctx.isNotCa && this.ctx.dto.leadSync?.notCaTypeCode) {
                    this.applyEnumeration(
                        out,
                        'op_lead_not_ca_type',
                        this.ctx.dto.leadSync.notCaTypeCode,
                    );
                }
                this.appendMultiple(
                    out,
                    'op_fail_comments',
                    this.failComment(),
                    FAIL_COMMENTS_LIMIT,
                );
            }
            if (this.ctx.isSuccessSale) {
                this.setScalar(
                    out,
                    'op_current_status',
                    this.statusText('Успех: продажа состоялась'),
                );
            }
        }

        // ===== Enumeration: op_work_status / op_prospects_type =====
        this.applyEnumeration(
            out,
            'op_work_status',
            this.resolveWorkStatusCode(),
        );
        this.applyEnumeration(
            out,
            'op_prospects_type',
            this.resolveProspectsCode(),
        );

        // ===== Enumeration: noresult / fail reason =====
        /*
         * Причина нерезультативности — только у НЕсостоявшегося разговора.
         * `isNew` («новое событие») из гейта исключён: отчёт по кнопке
         * «новое событие» разговором не был вовсе, и недозвон там —
         * выдумка. Гейт обязан совпадать с KPI-билдером
         * (`mapNoresultReasonGuarded`, легаси legacy-flow.php:234-256):
         * раньше карточка клиента получала причину, которой в отчётности
         * не было.
         */
        if (
            !this.ctx.isResult &&
            !this.ctx.isNew &&
            this.ctx.dto.report?.noresultReason
        ) {
            const code = this.ctx.dto.report.noresultReason.current?.code;
            if (code) {
                this.applyEnumeration(out, 'op_noresult_reason', code);
            }
        }
        /*
         * ИНВАРИАНТ: `op_efield_fail_reason` — поле ФИНАЛЬНОГО отказа и
         * больше ничьё. Возражение живого клиента пишется в
         * `op_objection_reason` (чек-лист «Доработка»), иначе финал
         * перезатирал бы возражение, а возражение — причину отказа.
         *
         * Гейт целиком живёт в `ctx.failReasonCode`: причина существует
         * только при типе отказа «Отказ» и не при «не ЦА» (см. getter).
         */
        const failReasonCode = this.ctx.failReasonCode;
        if (failReasonCode) {
            this.applyEnumeration(
                out,
                'op_efield_fail_reason',
                `op_efield_fail_${failReasonCode}`,
            );
        }

        // ===== История op_history / op_mhistory =====
        this.appendHistory(out);

        // ===== entity-specific =====
        // Ответственный переносится на сущность-владельца: и на компанию, и на
        // лид (раньше лид оставался без ASSIGNED_BY_ID — дыра lead-flow).
        // Для сделок не ставим — deal-сервисы делают это сами в base-полях.
        if (
            (this.entityType === EEventReportEntityType.COMPANY ||
                this.entityType === EEventReportEntityType.LEAD) &&
            this.ctx.planResponsibleId
        ) {
            out['ASSIGNED_BY_ID'] = this.ctx.planResponsibleId;
        }

        // ===== Deal-only: связь pres-сделки с корневой sales_base =====
        if (
            this.entityType === EEventReportEntityType.DEAL &&
            this.dealOptions?.role === EDealRole.PRESENTATION &&
            this.dealOptions.baseDealId
        ) {
            this.setScalar(out, 'to_base_sales', this.dealOptions.baseDealId);
        }

        return out;
    }

    // ---------- private ----------

    /**
     * Факты из чек-листа закрываемой задачи в поля карточки.
     *
     * Пишется ТОЛЬКО то, под что поле в реестре уже есть, и ТОЛЬКО как
     * фолбэк: галка в задаче не спорит с отчётом. Сейчас это одна ветка —
     * «Презентация проведена» отмечена, а в отчёте кнопку не нажали:
     * дату последней проведённой презентации фиксируем, СЧЁТЧИК не трогаем
     * (`pres_count` ведёт отчёт, и удвоить его галкой нельзя).
     *
     * «Решение подтверждено» и «Возражения зафиксированы» полей на порталах
     * не имеют (см. EVENT_TASK_CHECKLIST_FIELDLESS_CODES) — их итог уходит
     * в историю (`appendHistory`) и комментарий задачи.
     *
     * «Дата следующей коммуникации» отдельного действия не требует:
     * `call_next_date` уже выставляется планом, а без плана даты и нет.
     */
    private applyChecklistFacts(out: EntityFieldsMap): void {
        if (this.ctx.isPresentationDone) return;
        if (
            !isChecklistItemDone(
                this.ctx.taskChecklist,
                EVENT_TASK_CHECKLIST_ITEM.presentationDone,
            )
        ) {
            return;
        }

        this.applyPresentationDoneStamp(out);
    }

    /**
     * «Последняя ПРОВЕДЁННАЯ презентация» — дата и тот, кто её провёл.
     *
     * Гейт по роли сделки симметричен {@link bumpPresCount} и
     * {@link copyPresentationSurvey}: pres-сделка — сам «элемент
     * презентации», и отвечает только за СВОЮ. Плановой pres-сделке,
     * создаваемой ЭТИМ ЖЕ отчётом, презентации не было — раньше она
     * рождалась с отметкой «презентация проведена сейчас», и по такому
     * полю нельзя было отличить проведённую презентацию от назначенной.
     *
     * Компания, основная сделка и лид — вне гейта: у них поле означает
     * «последняя проведённая по клиенту», и она действительно только что
     * состоялась.
     */
    private applyPresentationDoneStamp(out: EntityFieldsMap): void {
        if (this.isPresentationDealWithoutPresentation()) return;

        this.setScalar(out, 'last_pres_done_date', this.nowCrmDate());
        this.setScalar(
            out,
            'last_pres_done_responsible',
            this.ctx.planResponsibleId,
        );
    }

    /** Pres-сделка, на которой презентации НЕ было (заведена под план). */
    private isPresentationDealWithoutPresentation(): boolean {
        return (
            this.entityType === EEventReportEntityType.DEAL &&
            this.dealOptions?.role === EDealRole.PRESENTATION &&
            !this.dealOptions.presentationHappenedHere
        );
    }

    private applyPlannedFields(out: EntityFieldsMap): void {
        this.setScalar(out, 'call_next_date', this.planDeadlineCrm());
        this.setScalar(out, 'call_next_name', this.ctx.planEventName);
        this.setScalar(
            out,
            'op_current_status',
            this.statusText('Звонок запланирован в работе'),
        );
        this.setScalar(out, 'xo_responsible', this.ctx.planResponsibleId);
        this.setScalar(out, 'xo_created', this.ctx.planCreatedById);

        switch (this.ctx.planEventType) {
            // Заявка планируется теми же полями обзвона, что и ХО: работа
            // ведётся в холодной части воронки.
            case 'xo':
            case 'xoRequest':
            case 'xoLead':
                this.setScalar(out, 'xo_date', this.planDeadlineCrm());
                this.setScalar(out, 'xo_name', this.ctx.planEventName);
                break;
            case 'hot':
                this.setScalar(
                    out,
                    'op_current_status',
                    this.statusText('В решении'),
                );
                break;
            case 'moneyAwait':
                this.setScalar(
                    out,
                    'op_current_status',
                    this.statusText('Ждём оплаты'),
                );
                break;
            case 'presentation':
                this.setScalar(out, 'last_pres_plan_date', this.nowCrmDate());
                this.setScalar(
                    out,
                    'last_pres_plan_responsible',
                    this.ctx.planResponsibleId,
                );
                this.setScalar(
                    out,
                    'next_pres_plan_date',
                    this.planDeadlineCrm(),
                );
                this.setScalar(
                    out,
                    'op_current_status',
                    this.statusText('В работе: Презентация запланирована'),
                );
                this.appendMultiple(
                    out,
                    'pres_comments',
                    this.presentationPlanComment(),
                    PRES_COMMENTS_LIMIT,
                );
                break;
            default:
                break;
        }
    }

    private applyExpiredFields(out: EntityFieldsMap): void {
        switch (this.ctx.reportEventType) {
            case 'xo':
            case 'xoRequest':
            case 'xoLead':
                this.setScalar(out, 'xo_date', this.planDeadlineCrm());
                this.setScalar(
                    out,
                    'op_current_status',
                    this.statusText(
                        `Перенос: ${eventTypeName(this.ctx.reportEventType)}`,
                    ),
                );
                break;
            case 'presentation':
                this.setScalar(
                    out,
                    'next_pres_plan_date',
                    this.planDeadlineCrm(),
                );
                this.appendMultiple(
                    out,
                    'pres_comments',
                    this.presentationExpiredComment(),
                    PRES_COMMENTS_LIMIT,
                );
                this.setScalar(
                    out,
                    'op_current_status',
                    this.statusText('Перенос: Презентация'),
                );
                break;
            default:
                break;
        }
    }

    private resolveWorkStatusCode(): string | null {
        if (this.ctx.isSuccessSale) return 'op_status_success';
        if (this.ctx.isFail) return 'op_status_fail';
        if (this.ctx.workStatusCode === EnumWorkStatusCode.setAside)
            return 'op_status_in_long';
        if (this.ctx.planEventType === 'hot') return 'op_status_in_progress';
        if (this.ctx.planEventType === 'moneyAwait')
            return 'op_status_money_await';
        if (this.ctx.isInWork) return 'op_status_in_work';
        /*
         * Статус обязан «поддерживаться при любом event-report» (todo2508-02
         * №9): активный план сам по себе означает, что клиент снова в работе.
         * Без этой ветки план после отказа оставлял и компанию, и НОВУЮ
         * сделку со старым «Провалом» (или вовсе без статуса): отчётный
         * workStatus при чистом плане не выбирается, и резолвер возвращал
         * null. Ничего не утверждаем только когда нет ни финала, ни плана.
         */
        if (this.ctx.isPlanned) return 'op_status_in_work';
        return null;
    }

    private resolveProspectsCode(): string | null {
        if (this.ctx.isInWork || this.ctx.isSuccessSale) return null;
        // «Не ЦА»: тип отказа не выбирался (в DTO дефолт селекта) — клиент
        // без перспектив. Item «Не ЦА» в op_prospects_type — фолоу-ап с
        // переустановкой поля.
        if (this.ctx.isNotCa) return 'op_prospects_nopersp';
        const failTypeCode = this.ctx.dto.report?.failType?.current?.code;
        if (!failTypeCode) return 'op_prospects_nopersp';
        const map: Record<string, string> = {
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
        return map[failTypeCode] ?? 'op_prospects_nopersp';
    }

    private applyEnumeration(
        out: EntityFieldsMap,
        code: string,
        itemCode: string | null,
    ): void {
        if (!itemCode) return;
        const field = this.portal.getEntityFieldByCode(this.entityType, code);
        if (!field) return;
        const item = this.portal.getFieldItemByCode(field, itemCode);
        if (!item || item.bitrixId == null) return;
        out[this.bitrixKey(field)] = item.bitrixId;
    }

    private setScalar(
        out: EntityFieldsMap,
        code: string,
        value: EntityFieldValue,
    ): void {
        const field = this.portal.getEntityFieldByCode(this.entityType, code);
        if (!field) return;
        out[this.bitrixKey(field)] = value;
    }

    /**
     * `pres_count` — сколько презентаций проведено.
     *
     * Смысл зависит от того, ЧЬЁ это поле:
     *  - КОМПАНИЯ — сквозной счётчик клиента: копится через все её сделки,
     *    сколько бы их ни было;
     *  - основная сделка (`sales_base`) и лид — копится, пока работа ведётся;
     *  - pres-сделка — она сама и есть «элемент презентации», поэтому не
     *    копится: 1, если презентация на ней состоялась, иначе 0.
     *
     * Раньше сброс до 0/1 выводился из общих флагов контекста
     * (`isPlanned && planEventType==='presentation'`), и обычный сценарий
     * «отчитались по презентации и тут же запланировали следующую» ставил
     * состоявшейся презентации 0. Теперь сброс — только для pres-сделки и
     * только по явному флагу вызывающего.
     */
    private bumpPresCount(out: EntityFieldsMap): void {
        const field = this.portal.getEntityFieldByCode(
            this.entityType,
            'pres_count',
        );
        if (!field) return;

        if (
            this.entityType === EEventReportEntityType.DEAL &&
            this.dealOptions?.role === EDealRole.PRESENTATION
        ) {
            out[this.bitrixKey(field)] = this.dealOptions
                .presentationHappenedHere
                ? 1
                : 0;
            return;
        }

        out[this.bitrixKey(field)] =
            this.readNumber(this.entityRecord(), field) + 1;
    }

    /**
     * Перенос анкеты после презентации: ответы «последней проведённой»
     * с ЛИДА → на pres-сделку и основную сделку.
     *
     * Почему источник — лид, а не DTO отчёта: анкету фрейм пишет в лид
     * напрямую, и лид уже прочитан init-фазой; расширять контракт отчёта
     * ради дублирования этих значений не нужно.
     *
     * Пишем ТОЛЬКО на сделки (роли base/pres):
     *  - на лиде значения и так живут, а перезапись снапшотом init-фазы
     *    могла бы ОТКАТИТЬ ответ, сохранённый фреймом после чтения;
     *  - XO/TMC-сделки к презентации отношения не имеют;
     *  - на компании полей нет намеренно (см. реестр).
     *
     * Пустой ответ на лиде НЕ переносится: перенос фиксирует «последнюю
     * проведённую», а не затирает сделку пустотой, когда анкету ещё не
     * заполнили. Непустой — перезаписывает (скаляры, не multiple).
     * Поле не установлено (на лиде или на сделке) — молча пропускается.
     */
    private copyPresentationSurvey(out: EntityFieldsMap): void {
        if (this.entityType !== EEventReportEntityType.DEAL) return;
        const role = this.dealOptions?.role;
        if (role !== EDealRole.BASE && role !== EDealRole.PRESENTATION) return;
        /*
         * У каждой презентации СВОЯ запись анкеты: pres-сделка получает
         * ответы, только если презентация состоялась ИМЕННО на ней
         * (отчитываемая и спонтанная). Плановой pres-сделке, создаваемой
         * этим же отчётом, писать нечего — у будущей презентации ещё нет
         * своих ответов. Основная сделка — вне гейта: на ней всегда
         * «последняя проведённая».
         */
        if (this.isPresentationDealWithoutPresentation()) return;
        // Deal-only хвост (op_xvost_*) — отдельным снимком с БАЗОВОЙ сделки:
        // на лиде этих полей нет, общий цикл ниже их не увидит.
        this.copyXvostSnapshot(out);

        const lead = this.ctx.lead as unknown as Record<string, unknown> | null;
        if (!lead) return;

        for (const code of PRESENTATION_SURVEY_FIELD_CODES) {
            const leadField = this.portal.getEntityFieldByCode('lead', code);
            if (!leadField) continue;
            const raw = lead[this.bitrixKey(leadField)];
            const value = typeof raw === 'string' ? raw.trim() : '';
            if (!value) continue;
            /*
             * setScalar сам резолвит поле на ЦЕЛЕВОЙ сущности и молча
             * пропускает неустановленное (детальные «5К» на сделке).
             * toBatchText обязателен: ответы анкеты многострочны по
             * построению, а поля сделок уезжают batch-командой, где сырой
             * `\n` доезжает подчёркиванием. На лиде значение хранится с
             * настоящими переносами (Битрикс декодирует %0A при записи),
             * поэтому повторный перенос не двоит экранирование.
             */
            this.setScalar(out, code, toBatchText(value));
        }
    }

    /**
     * Снимок deal-only полей хвоста (op_xvost_*) с БАЗОВОЙ сделки в
     * пресс-сделку, по которой отчитались (см. XVOST_DEAL_FIELD_CODES).
     * Даты и булевы — однострочные, toBatchText не нужен.
     */
    private copyXvostSnapshot(out: EntityFieldsMap): void {
        if (this.dealOptions?.role !== EDealRole.PRESENTATION) return;
        if (!this.dealOptions?.presentationHappenedHere) return;
        const base = this.ctx.currentBaseDeal as unknown as Record<
            string,
            unknown
        > | null;
        if (!base) return;

        for (const code of XVOST_DEAL_FIELD_CODES) {
            const field = this.portal.getEntityFieldByCode('deal', code);
            if (!field) continue;
            const raw = base[this.bitrixKey(field)];
            const value =
                typeof raw === 'string' ? raw.trim() : raw ? String(raw) : '';
            if (!value) continue;
            this.setScalar(out, code, value);
        }
    }

    private appendMultiple(
        out: EntityFieldsMap,
        code: string,
        line: string,
        limit: number,
    ): void {
        const field = this.portal.getEntityFieldByCode(this.entityType, code);
        if (!field) return;
        const key = this.bitrixKey(field);
        const previous = this.readMultiple(this.entityRecord(), field);
        const next = [line, ...previous].slice(0, limit);
        out[key] = next;
    }

    private appendHistory(out: EntityFieldsMap): void {
        const limit = this.ctx.isGsirk
            ? HISTORY_LIMIT_GSIRK
            : HISTORY_LIMIT_DEFAULT;
        /*
         * Перенос строки — ТОЛЬКО через BATCH_LINE_BREAK_SYMBOL: поля
         * заполняются batch-командой, а там сырой `\n` доезжает до карточки
         * подчёркиванием. Формат записи (склонение типов, без слова
         * «Отчёт») — см. buildEventHistoryParts; первой строкой — когда
         * событие произошло.
         */
        const line = [
            this.nowCrmDate(),
            ...buildEventHistoryParts(this.ctx),
        ].join(BATCH_LINE_BREAK_SYMBOL);
        this.appendMultiple(out, 'op_mhistory', line, limit);
        this.setScalar(out, 'op_history', line);
    }

    private statusText(prefix: string): string {
        return this.ctx.planEventName
            ? `${prefix}: ${this.ctx.planEventName}`
            : prefix;
    }

    private presentationPlanComment(): string {
        return `${this.nowCrmDate()} Запланирована презентация: ${this.ctx.planEventName}`;
    }
    private presentationDoneComment(): string {
        return `${this.nowCrmDate()} Презентация состоялась: ${this.ctx.reportEventName}`;
    }
    private presentationExpiredComment(): string {
        return `${this.nowCrmDate()} Перенос презентации: ${this.ctx.planEventName}`;
    }
    private failComment(): string {
        // Комментарий менеджера бывает многострочным — экранируем переносы
        // для batch, иначе в карточке они превратятся в подчёркивания.
        const label = this.ctx.isNotCa ? 'Не ЦА' : 'Отказ';
        return `${this.nowCrmDate()} ${label}: ${toBatchText(this.ctx.reportComment)}`;
    }

    /**
     * Дедлайн плана в формате CRM datetime (локаль портала); '' — дедлайна
     * нет. CRM-поля хранят локальное время портала, поэтому сырая строка
     * плана нормализуется через BitrixDateTime, а не пишется как есть.
     */
    private planDeadlineCrm(): string {
        return this.ctx.planDeadline?.toCrmDateTime() ?? '';
    }

    private nowCrmDate(): string {
        return this.ctx.dateTime.crmDateTime(this.ctx.nowDate);
    }

    private bitrixKey(field: IField): string {
        return `UF_CRM_${field.bitrixId}`;
    }

    private entityRecord(): Record<string, unknown> | null {
        if (this.entityType === EEventReportEntityType.DEAL) {
            return this.dealOptions?.deal ?? null;
        }
        if (this.entityType === EEventReportEntityType.COMPANY) {
            return this.ctx.company as unknown as Record<
                string,
                unknown
            > | null;
        }
        return this.ctx.lead as unknown as Record<string, unknown> | null;
    }

    private readNumber(
        entity: Record<string, unknown> | null,
        field: IField,
    ): number {
        if (!entity) return 0;
        const raw = entity[this.bitrixKey(field)];
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
    }

    private readMultiple(
        entity: Record<string, unknown> | null,
        field: IField,
    ): string[] {
        if (!entity) return [];
        const raw = entity[this.bitrixKey(field)];
        if (Array.isArray(raw)) {
            return raw.map(v => String(v));
        }
        if (typeof raw === 'string' && raw) {
            return [raw];
        }
        return [];
    }

    /**
     * Зарезервировано — `IFieldItem` будет нужен в будущей расширенной
     * валидации (например, проверка `isActive`). Сейчас не используется,
     * сохраняем import-связь для последующих фич.
     */
    public static __ensureFieldItemImport: IFieldItem | null = null;

    /** Используется только при необходимости debug-вывода. */
    public dumpDomain(): string {
        return this.ctx.isGsirk ? GSIRK_DOMAIN : this.ctx.domain;
    }
}
