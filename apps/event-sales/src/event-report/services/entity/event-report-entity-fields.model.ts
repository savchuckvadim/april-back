import { Logger } from '@nestjs/common';
import {
    toMultiFieldEntryText,
    toBatchSafeText,
} from '@lib/bitrix/consts/batch.consts';
import {
    isPresentationSurveyEmpty,
    PRESENTATION_SURVEY_CODES,
    PRESENTATION_SURVEY_SUMMARY_CODES,
    presentationSurveyAnswersByCode,
    PresentationSurveyValues,
} from '../../../shared/presentation-survey';
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
import {
    CALL_LAST_DATE_POLICY,
    CALL_NEXT_DATE_POLICY,
    CALL_NEXT_NAME_POLICY,
    FieldPolicy,
    FieldPolicyInput,
    NEXT_PRES_PLAN_DATE_POLICY,
    POLICY_KEEP,
    PRES_COUNT_POLICY,
    resolveFieldValue,
} from './field-policy';
import { fitMultipleEntries, joinScalarHistory } from './history-text';

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
 * Анкета после презентации: сводные («Хвост», «Пять К») + пять блоков «5К»
 * + пять блоков «Хвоста».
 *
 * СОСТАВ КОДОВ — общий (`shared/presentation-survey`): и легаси-ручка
 * `/event-sales/presentation-survey`, и запись ответов из payload отчёта
 * ({@link EventReportEntityFieldsModel.applyPresentationSurveyAnswers}), и
 * этот перенос «лид → сделки» обязаны понимать анкету одним списком.
 *
 * Здесь список работает на ЛЕГАСИ-ПУТИ: значения пишет ФРЕЙМ старой сборки
 * прямо в ЛИД, а event-report при проведённой презентации разносит их тем
 * же каркасом, что `pres_comments`/`pres_count`, по правилам владельца:
 *  - основная (sales_base) сделка — всегда, ПЕРЕЗАТИРАЯ: смысл —
 *    «последняя проведённая презентация»;
 *  - pres-сделки — только та, ПО КОТОРОЙ отчитываются, и спонтанная
 *    (у каждой презентации своя запись); плановой — нет;
 *  - связанный с презентацией ЛИД — через EventReportLeadRequestSyncService
 *    (связь — presentationLink из модалки; лид контекста туда не попадает:
 *    состав до него доезжает основным батчем, второй писатель запрещён).
 *
 * Скаляры, не multiple: перенос перезаписывает прошлые значения.
 *
 * ЧТО РЕАЛЬНО ЗАВЕДЕНО В РЕЕСТРЕ (`pbx-sales-event-field.type.ts`) после
 * переделки состава 01.09.2026:
 *  - `op_presentation_xvost` / `op_presentation_5k` — сводные;
 *  - пять `op_5k_*` (client/company/colleagues/competitor/criteria) —
 *    lead + deal;
 *  - пять `op_xvost_*` (desire/offered/price_reaction/decision_process/
 *    decision_way) — lead + deal. Компании у них нет намеренно: у прежних
 *    `op_talk_*` она была, но не писал в неё никто.
 * Неустановленное на конкретном портале поле разрезолвится в пустоту и
 * молча пропустится — реестр расширять безопасно, код правки не требует.
 */
export const PRESENTATION_SURVEY_FIELD_CODES = PRESENTATION_SURVEY_CODES;

/**
 * Deal-only поля «Хвоста»: фрейм пишет их в БАЗОВУЮ сделку, на лиде их нет
 * вовсе — поэтому общий перенос анкеты (источник — лид) их не видит.
 * Pres-сделка, по которой отчитались, увозит СВОЙ снимок этих значений с
 * базовой: следующая презентация перезатрёт базовую, а история по каждой
 * презентации сохранится.
 *
 * После переделки состава 01.09.2026 здесь осталось ОДНО поле. Ушли пять:
 * op_xvost_decision_date_agreement, op_manager_approach_date и три галочки
 * op_xvost_is_* — их больше нет в реестре. Список был голыми строками, не
 * типом, поэтому удаление кодов его не сломало: он молча продолжал
 * запрашивать несуществующие поля в select init-батча.
 */
export const XVOST_DEAL_FIELD_CODES = ['op_xvost_decision_call_date'] as const;

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
 * Сырое значение поля Битрикса → текст для записи в скалярное поле.
 *
 * Битрикс отдаёт значения нетипизированно (`unknown`), поэтому слепой
 * `String(raw)` небезопасен: на объекте он молча запишет в карточку
 * `[object Object]`. Здесь к тексту сводятся только те формы, которые
 * реально приходят из REST и которые прежний `String(raw)` печатал
 * ОДИНАКОВО: строки, числа/bigint, булевы и массивы (множественный UF —
 * `String(['a','b'])` === `'a,b'`, то есть join запятой). Всё остальное —
 * объект, к тексту не сводимый: он честно считается пустым, и поле просто
 * не переносится.
 *
 * ВНИМАНИЕ (единственное отличие от прежнего поведения): если в поле вдруг
 * приедет объект, раньше в карточку уходила строка `[object Object]`, а
 * теперь поле будет пропущено. Для дат и булевых из XVOST_DEAL_FIELD_CODES
 * такой формы не бывает; мусорная запись в CRM в любом случае хуже пропуска.
 */
function scalarToText(raw: unknown): string {
    if (typeof raw === 'string') return raw;
    if (
        typeof raw === 'number' ||
        typeof raw === 'boolean' ||
        typeof raw === 'bigint'
    ) {
        return String(raw);
    }
    // Массив примитивов повторяет семантику String(array) — join(','),
    // где null/undefined элементы дают пустую строку.
    if (Array.isArray(raw)) {
        return raw.map((item: unknown) => scalarToText(item)).join(',');
    }
    return '';
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
 *
 * ПОЛИТИКИ ПОЛЕЙ (`./field-policy`). Часть полей описана декларативно —
 * одно описание на поле: как значение получается и когда обнуляется.
 * Через политики проходят те, где слепая перезапись реально врала:
 *  - `call_next_date` / `call_next_name` / `next_pres_plan_date` — «ось
 *    следующего события», считается по ОТКРЫТЫМ ДЕЛАМ клиента;
 *  - `call_last_date` — политика `overwrite` (перезапись здесь верна);
 *  - `pres_count` — политика `increment`.
 *
 * Остальные поля осознанно оставлены на прямой записи:
 *  - `xo_date` / `xo_name` / `xo_responsible` / `xo_created` — не «ось», а
 *    снимок ТЕКУЩЕЙ холодной работы: у клиента она по инварианту домена
 *    одна, а cold-hook пишет те же поля своим путём. Считать их по оси —
 *    значит завести второго хозяина у полей ХО;
 *  - `last_pres_plan_date` / `last_pres_done_date` / `*_responsible` —
 *    штампы «когда назначили / когда провели». Событие произошло СЕЙЧАС,
 *    вычислять нечего; гейт по роли сделки — про «чей это штамп», а не про
 *    способ расчёта;
 *  - `op_current_status`, `op_work_status`, `op_prospects_type`,
 *    `op_*_reason` — резолверы кодов, а не даты: их «расчёт» уже вынесен в
 *    отдельные методы и в политику не укладывается;
 *  - `op_move_count` живёт в отдельном сервисе (`DealMoveCountService`):
 *    он пишется вне стадийных update'ов и модели полей не касается.
 */
export class EventReportEntityFieldsModel {
    private readonly logger = new Logger(EventReportEntityFieldsModel.name);

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
            // «Последний звонок» — политика `overwrite`: контакт только что
            // состоялся, вычислять там нечего (см. CALL_LAST_DATE_POLICY).
            this.applyPolicy(out, CALL_LAST_DATE_POLICY, {
                value: this.nowCrmDate(),
            });
            this.applyNextEventAxis(out);
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

        /*
         * ===== Анкета 5К/Хвост ИЗ PAYLOAD отчёта =====
         * Строго ПОСЛЕ переноса «лид → сделки»: payload — свежая правда
         * этого отчёта и обязан побеждать снимок лида, прочитанный
         * init-фазой. Блока в payload нет — ни одной команды не появится.
         *
         * Вне блока `isPresentationDone` НАМЕРЕННО: гейт живёт внутри
         * метода — его зовёт ещё и зеркало лида
         * (`toPresentationSurveyFields`), и условие обязано действовать на
         * оба входа, а не только на этот.
         */
        this.applyPresentationSurveyAnswers(out);

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

    /**
     * ТОЛЬКО ответы анкеты «5К/Хвост» из payload — без единого другого поля
     * отчёта.
     *
     * Нужен там, где сущность НЕ владелец отчёта, а анкету получить обязана.
     * Практически это ЛИД при живой компании: владельцем отчёта
     * (`resolveEntity`) компания становится всегда, когда `companyId` есть в
     * контексте, и полный `toFields()` для лида поток в этом случае не
     * строит вовсе. Легаси-ручка /presentation-survey писала анкету в лид
     * независимо от того, кто «владелец», — состав нового пути обязан
     * совпадать (см. {@link applyPresentationSurveyAnswers}).
     *
     * Именно ТОЛЬКО анкета: полный `toFields()` увёз бы на лид ещё и
     * счётчики, штампы, историю и `ASSIGNED_BY_ID` — то есть второй,
     * никем не заказанный update лида.
     */
    toPresentationSurveyFields(): EntityFieldsMap {
        const out: EntityFieldsMap = {};
        this.applyPresentationSurveyAnswers(out);
        return out;
    }

    // ---------- private: политики полей ----------

    /**
     * Ось «следующего события» — три поля, которые раньше писались вслепую.
     *
     * Слепая запись врала в самом обычном сценарии: у клиента открыты
     * презентация на 5-е и звонок на 3-е, отчёт планирует звонок на 7-е —
     * в «дату следующего звонка» уезжало 7-е (хотя следующим будет 5-е), а
     * «дата назначенной презентации» обнулялась (хотя презентация никуда
     * не делась). Теперь обе считаются по ОСИ открытых дел клиента.
     *
     * Фрейм списка дел не прислал либо настройка портала выключена — ветка
     * ровно прежняя: оба поля обнуляются здесь и переписываются планом
     * ниже. `call_next_name` в прежней ветке НЕ обнулялся — так и
     * оставляем, иначе отчёт без плана стирал бы тему, которую сам не
     * заменяет.
     */
    private applyNextEventAxis(out: EntityFieldsMap): void {
        const input: FieldPolicyInput = {
            events: this.ctx.clientEventAxis ?? [],
            /*
             * Правило `final` включается настройкой портала: гейт живёт
             * здесь, а не в таблице политик, — таблица описывает СМЫСЛ поля
             * и от настроек конкретного портала не зависит.
             */
            isFinal:
                this.ctx.isFinalOutcome &&
                this.ctx.fieldPolicySettings.resetOnFinal,
        };

        if (this.isNextCallAxisCalculated) {
            this.applyPolicy(out, CALL_NEXT_DATE_POLICY, input);
            this.applyPolicy(out, CALL_NEXT_NAME_POLICY, input);
        } else {
            this.setScalar(out, 'call_next_date', null);
        }

        if (this.isNextPresentationAxisCalculated) {
            this.applyPolicy(out, NEXT_PRES_PLAN_DATE_POLICY, input);
        } else {
            this.setScalar(out, 'next_pres_plan_date', null);
        }
        /*
         * ОТКРЫТЫЙ ВОПРОС ВЛАДЕЛЬЦУ — ветки else выше оставлены КАК БЫЛИ,
         * с `null`, и это осознанно.
         *
         * `null` из сборщика batch-команды бэка выпадает целиком, поэтому на
         * СЕРВЕРНОМ пути эти две ветки не пишут ничего и никогда не писали.
         * На браузерном (прямой путь) того же гейта нет, и SDK превращает
         * null в `ключ=` — там дата ОЧИЩАЕТСЯ. То есть одно и то же место
         * ведёт себя по-разному, и какое поведение верное — решение не
         * инженерное: комментарий у isNextCallAxisCalculated предостерегает
         * «расчёт стёр бы дату, которую отчёт просто не видит», а спека
         * рядом закрепляет обратное («прежняя ветка обнуляла дату
         * презентации при любом отчёте»).
         *
         * Менять поведение молча нельзя: включённая очистка начнёт стирать
         * менеджерам даты, которых отчёт не видит. Поэтому здесь всё как
         * было; исправлено только однозначное — обнуление ПО ПОЛИТИКЕ
         * (applyPolicy), где null означает «обнулить» по прямому тексту
         * resolveFieldValue и настройке портала «Финал обнуляет даты».
         */
    }

    /**
     * Считается ли ось «следующего звонка» политикой. Требуется И настройка
     * портала, И присланный фреймом список дел: без списка ось пуста, и
     * расчёт стёр бы дату, которую отчёт просто не видит.
     */
    private get isNextCallAxisCalculated(): boolean {
        return (
            this.ctx.fieldPolicySettings.calculatedNextEvent &&
            this.ctx.clientEventAxis !== null
        );
    }

    /**
     * То же для «даты назначенной презентации», НО не на pres-сделке.
     *
     * Pres-сделка — сам «элемент презентации», и поле на ней означает дату
     * ЕЁ презентации, а не ближайшей по клиенту (та же причина, по которой
     * у неё особые `pres_count` и отметка проведения). Клиентские носители
     * — компания, лид, основная/ХО/ТМЦ сделки — считают по оси.
     */
    private get isNextPresentationAxisCalculated(): boolean {
        return this.isNextCallAxisCalculated && !this.isPresentationCarrier;
    }

    /** Носитель — сделка-презентация (роль `presentation`). */
    private get isPresentationCarrier(): boolean {
        return (
            this.entityType === EEventReportEntityType.DEAL &&
            this.dealOptions?.role === EDealRole.PRESENTATION
        );
    }

    /**
     * Запись поля оси «следующего звонка» ПЛАНОМ — только когда ось не
     * считается политикой. Иначе план не имеет права перебивать расчёт:
     * запланированное событие уже учтено на оси и победит там, где оно
     * действительно ближайшее.
     */
    private setNextCallAxis(
        out: EntityFieldsMap,
        code: 'call_next_date' | 'call_next_name',
        value: EntityFieldValue,
    ): void {
        if (this.isNextCallAxisCalculated) return;
        this.setScalar(out, code, value);
    }

    /** То же для «даты назначенной презентации». */
    private setNextPresentationAxis(
        out: EntityFieldsMap,
        value: EntityFieldValue,
    ): void {
        if (this.isNextPresentationAxisCalculated) return;
        this.setScalar(out, 'next_pres_plan_date', value);
    }

    /**
     * Применить политику: резолвер решает, что писать, модель — куда.
     * `POLICY_KEEP` («не трогать») и `null` («обнулить») различаются
     * принципиально, поэтому проверка именно на `undefined`.
     */
    private applyPolicy(
        out: EntityFieldsMap,
        policy: FieldPolicy,
        input: Partial<FieldPolicyInput>,
    ): void {
        const value = resolveFieldValue(policy, {
            events: input.events ?? [],
            isFinal: input.isFinal ?? false,
            value: input.value,
            current: input.current,
        });
        if (value === POLICY_KEEP) return;
        /*
         * ОБНУЛЕНИЕ ПУСТОЙ СТРОКОЙ, А НЕ null.
         *
         * `resolveFieldValue` возвращает null со смыслом «обнулить» (правила
         * final / noOpenEvent). Но сборщик batch-команды бэка выбрасывает
         * null целиком (`if (value === undefined || value === null) return`
         * в libs/bitrix/.../batch-api.service.ts), поэтому поле просто не
         * уезжало — и настройка «Финал обнуляет даты следующего события»
         * (включена по умолчанию) на серверном пути НЕ РАБОТАЛА вовсе.
         *
         * Хуже того, пути расходились: в браузере во фрейме тот же null
         * превращался SDK в `ключ=` и поле ОЧИЩАЛ, а вне фрейма уезжала
         * литеральная строка «null». Одно действие — три разных исхода.
         *
         * Пустая строка — канон очистки в этом коде (прецеденты:
         * `set('op_xo_revive_queued_at', '')`, `clearDealAssignedAt`).
         */
        this.setScalar(out, policy.code, value === null ? '' : value);
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
     * `call_next_date` считается по оси открытых дел клиента
     * ({@link applyNextEventAxis}) — галка в задаче ничего к ней не
     * добавляет.
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
            this.isPresentationCarrier &&
            !this.dealOptions?.presentationHappenedHere
        );
    }

    private applyPlannedFields(out: EntityFieldsMap): void {
        this.setNextCallAxis(out, 'call_next_date', this.planDeadlineCrm());
        this.setNextCallAxis(out, 'call_next_name', this.ctx.planEventName);
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
                // «Последняя НАЗНАЧЕННАЯ презентация» — штамп момента, когда
                // её назначили. Слепая запись здесь верна: назначили сейчас.
                this.setScalar(out, 'last_pres_plan_date', this.nowCrmDate());
                this.setScalar(
                    out,
                    'last_pres_plan_responsible',
                    this.ctx.planResponsibleId,
                );
                this.setNextPresentationAxis(out, this.planDeadlineCrm());
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
                this.setNextPresentationAxis(out, this.planDeadlineCrm());
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

        // Стратегия `increment` из таблицы политик: «текущее + шаг».
        const value = resolveFieldValue(PRES_COUNT_POLICY, {
            events: [],
            isFinal: false,
            current: this.readNumber(this.entityRecord(), field),
        });
        if (value === POLICY_KEEP) return;
        out[this.bitrixKey(field)] = value;
    }

    /**
     * ФОЛБЭК-перенос анкеты после презентации: ответы «последней
     * проведённой» с ЛИДА → на pres-сделку и основную сделку.
     *
     * Источник анкеты №1 — PAYLOAD отчёта ({@link
     * applyPresentationSurveyAnswers}). Лид остаётся источником только для
     * ЛЕГАСИ-ПУТИ: старый React-фронт шлёт анкету отдельным запросом в
     * ручку /presentation-survey, та пишет ответы в лид, и в payload
     * положить ничего не может. Ответ, пришедший в payload, отсюда НЕ
     * копируется вовсе (см. гейт в цикле): свежая правда этого отчёта не
     * нуждается в перечитанной сущности, а копия ниже её только
     * дублировала бы.
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

        // Ответы ЭТОГО отчёта: их пишет applyPresentationSurveyAnswers,
        // и перенос с лида для них не нужен (см. докблок).
        const fromPayload = presentationSurveyAnswersByCode(
            this.ctx.presentationSurvey,
        );

        for (const code of PRESENTATION_SURVEY_FIELD_CODES) {
            if (fromPayload.has(code)) continue;
            const leadField = this.portal.getEntityFieldByCode('lead', code);
            if (!leadField) continue;
            const raw = lead[this.bitrixKey(leadField)];
            const value = typeof raw === 'string' ? raw.trim() : '';
            if (!value) continue;
            /*
             * setScalar сам резолвит поле на ЦЕЛЕВОЙ сущности и молча
             * пропускает неустановленное (детальные «5К» на сделке).
             *
             * Экранирование — toBatchSafeText, ТО ЖЕ, что у setSurveyField:
             * значение уезжает в ТОТ ЖЕ объект `out`, то есть ОДНОЙ
             * командой `deal.update` рядом с ответами из payload. Слабый
             * вариант рвал бы не только себя: один скопированный с лида
             * ответ с `&` («Гарант & КонсультантПлюс») обрезал бы всю
             * остальную часть команды — историю, статусы и счётчики того же
             * отчёта. На лиде значение хранится с настоящими переносами и
             * сырыми `&`/`+`/`%` (Битрикс декодировал их при записи),
             * поэтому экранирование здесь первое, а не повторное.
             */
            this.setScalar(out, code, toBatchSafeText(value));
        }
    }

    /**
     * ЗАПИСЬ анкеты «5К/Хвост» ИЗ PAYLOAD отчёта — основным потоком, тем же
     * батчем, что и сам отчёт.
     *
     * Состав по целям — ровно как у легаси-ручки (общий whitelist кодов из
     * `shared/presentation-survey`):
     *  - ЛИД и СДЕЛКИ (контекстная/базовая и презентационные) — весь
     *    состав: девять детальных «5К», шесть «Разговора» и оба сводных;
     *    лид получает его и тогда, когда владелец отчёта — компания или
     *    сделка: отдельной командой зеркала
     *    (`EventReportEntityFlowService.queueLeadSurveyMirror` поверх
     *    {@link toPresentationSurveyFields}), иначе состав был бы уже
     *    легаси-ручки;
     *  - КОМПАНИЯ — только сводные («Хвост», «Пять К»). Детальные «5К» на
     *    компании реестром не заведены (`company: ''` у всех `op_5k_*`) —
     *    там они означали бы «последний ответ по любой из сделок». Шесть
     *    `op_talk_*` на компании реестром, наоборот, ЗАВЕДЕНЫ, и установщик
     *    их создаёт — но писателя у них нет ни здесь, ни в легаси-ручке:
     *    открытый вопрос владельцу «писать или снять из реестра»
     *    (`front/docs/event-sales-0109.md`, раздел 9.5).
     * ХО/ТМЦ-сделки к презентации отношения не имеют и остаются вне записи.
     *
     * ГЕЙТ — проведённая презентация (`ctx.isPresentationDone`), как у
     * соседей `copyPresentationSurvey`/`bumpPresCount`/штампа проведения.
     * Он стоит ЗДЕСЬ, а не на месте вызова: метод зовут два входа —
     * `toFields()` и `toPresentationSurveyFields()` (зеркало лида), и
     * условие «анкета есть только у состоявшейся презентации» обязано
     * действовать на оба. DTO блок при непроведённой презентации слать не
     * обязан, но и не запрещает — контракт держит поток, а не фрейм.
     *
     * Плановая pres-сделка, создаваемая ЭТИМ ЖЕ отчётом, ответов не
     * получает: у каждой презентации своя анкета, а у будущей её ещё нет
     * (тот же гейт, что у `pres_count` и штампа проведения). Спонтанная
     * pres-сделка — получает: её создаёт сам поток, уже держа ответы в
     * руках, и никакого rendezvous с hook'ом для этого не нужно.
     *
     * Ответов в payload нет — метод не добавляет НИ ОДНОГО поля: старые
     * сборки фрейма блок не шлют, и поток обязан вести себя как раньше.
     */
    private applyPresentationSurveyAnswers(out: EntityFieldsMap): void {
        if (!this.ctx.isPresentationDone) return;
        const survey = this.ctx.presentationSurvey;
        if (isPresentationSurveyEmpty(survey)) return;

        if (this.entityType === EEventReportEntityType.COMPANY) {
            this.appendSurveySummary(out, survey);
            return;
        }
        if (this.entityType === EEventReportEntityType.DEAL) {
            const role = this.dealOptions?.role;
            if (role !== EDealRole.BASE && role !== EDealRole.PRESENTATION) {
                return;
            }
            if (this.isPresentationDealWithoutPresentation()) return;
        }

        for (const [code, value] of survey.fiveK) {
            this.setSurveyField(out, code, value);
        }
        for (const [code, value] of survey.talk) {
            this.setSurveyField(out, code, value);
        }
        this.appendSurveySummary(out, survey);
    }

    /** Сводные ответы анкеты — единственное, что едет ещё и в компанию. */
    private appendSurveySummary(
        out: EntityFieldsMap,
        survey: PresentationSurveyValues,
    ): void {
        this.setSurveyField(
            out,
            PRESENTATION_SURVEY_SUMMARY_CODES.xvost,
            survey.xvost,
        );
        this.setSurveyField(
            out,
            PRESENTATION_SURVEY_SUMMARY_CODES.fiveKSummary,
            survey.fiveKSummary,
        );
    }

    /**
     * Один ответ анкеты в поле ЦЕЛЕВОЙ сущности.
     *
     * Резолв — существующей механикой по слепку портала; поле не
     * установлено (детальные «5К» на компании, реестр без op_talk_*) —
     * warning и пропуск: мягкая деградация, как везде в event-report,
     * остальные ответы при этом пишутся.
     *
     * Экранирование — `toBatchSafeText`, строгий вариант: ответ анкеты
     * это СВОБОДНЫЙ текст менеджера, целиком уезжающий ОДНИМ значением
     * batch-команды, а значения вклеиваются в query-строку `cmd` сырыми.
     * Переносов мало (ответы многострочны ПО ПОСТРОЕНИЮ, и сырой перенос
     * доехал бы до карточки подчёркиванием) — строку рвут ещё три
     * символа: `&` («Гарант & КонсультантПлюс» оборвался бы на
     * амперсанде, а хвост уехал бы мусорным параметром команды), `+`
     * («тел. +7 900…» доезжает пробелом вместо плюса) и `%` («скидка
     * 50%» съедает начало следующей escape-последовательности). Поток
     * пишет ПОСЛЕ фрейма, поэтому испорченное значение ПЕРЕЗАТЁРЛО БЫ
     * чистое, записанное фреймом напрямую (не батчем).
     */
    private setSurveyField(
        out: EntityFieldsMap,
        code: string,
        value: string | null,
    ): void {
        if (!value) return;
        const field = this.portal.getEntityFieldByCode(this.entityType, code);
        if (!field) {
            this.logger.warn(
                `анкета презентации: поле ${code} не установлено на ` +
                    `${this.entityType} — ответ пропущен`,
            );
            return;
        }
        out[this.bitrixKey(field)] = toBatchSafeText(value);
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
            /*
             * Проверка на falsy сохранена ровно как была: пустая строка, 0,
             * false, null/undefined по-прежнему дают '' и поле пропускается
             * (см. `if (!value) continue` ниже). Изменился только способ
             * привести непустое значение к тексту — см. {@link scalarToText}.
             */
            const value =
                typeof raw === 'string'
                    ? raw.trim()
                    : raw
                      ? scalarToText(raw)
                      : '';
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
        /*
         * Запись множественного поля — ВСЕГДА одна строка: батч уходит
         * JSON-телом, %0A декодируется в настоящий 
, а грид multiple-поля
         * рисует внутренние переносы подчёркиванием (инцидент 31.08,
         * «ОП История» в _). Разделитель частей — видимое « — ».
         */
        /*
         * ЭКРАНИРУЕТ ЗДЕСЬ, И ТОЛЬКО ЗДЕСЬ.
         *
         * Значения уезжают внутри query-строки `cmd`, где `&`, `+` и `%`
         * рвут разбор: всё после `&` уедет отдельным мусорным полем, и
         * вместе с комментарием потеряется ВЕСЬ остаток команды — история,
         * статусы и счётчики ТОГО ЖЕ отчёта. Свободный текст менеджера
         * («Иванов & Партнёры», «скидка 50%», «+7 900…») попадает сюда
         * напрямую, поэтому строители выше отдают ПЛОСКИЙ текст, а
         * экранирование живёт в одном месте — правило «экранирование есть
         * свойство транспорта, а не текста».
         *
         * previous тоже экранируется: он прочитан из карточки уже
         * ДЕКОДИРОВАННЫМ, и на запись обязан ехать той же функцией, что и
         * новая строка. Без этого чужая старая запись с `&` ломала команду
         * при каждом следующем отчёте.
         */
        /*
         * Лимит и по числу, и по суммарной длине (todo0209 №1): колонка
         * UTS — 64 КБ, и тридцать записей по 4000 символов кириллицы в неё
         * не входят — update падал целиком. Считаем по экранированным
         * записям: они длиннее сырых, оценка консервативна.
         */
        const next = fitMultipleEntries(
            [
                toBatchSafeText(toMultiFieldEntryText(line)),
                ...previous.map(entry => toBatchSafeText(entry)),
            ],
            limit,
        );
        out[key] = next;
    }

    private appendHistory(out: EntityFieldsMap): void {
        const limit = this.ctx.isGsirk
            ? HISTORY_LIMIT_GSIRK
            : HISTORY_LIMIT_DEFAULT;
        /*
         * Запись — ОДНОЙ строкой с разделителем « — »: значения этих полей
         * уезжают batch-командой JSON-телом, где и сырой `\n`, и `%0A`
         * (декодируется сервером) доезжают до карточки настоящим переносом,
         * а грид полей карточки рисует его ПОДЧЁРКИВАНИЕМ (инцидент 31.08:
         * «ОП История» вся в `_`). См. toMultiFieldEntryText. Формат частей
         * (склонение типов, без слова «Отчёт») — buildEventHistoryParts;
         * первым — когда событие произошло.
         */
        const line = toMultiFieldEntryText(
            [this.nowCrmDate(), ...buildEventHistoryParts(this.ctx)].join(
                ' — ',
            ),
        );
        this.appendMultiple(out, 'op_mhistory', line, limit);
        this.appendScalarHistory(out, line);
    }

    /**
     * `op_history` — скаляр: новая запись ВПЕРЁД прошлого значения через
     * « | », в лимит на всё поле (todo0209 №1; раньше поле перезаписывалось,
     * и «история» показывала одну последнюю запись). Прошлое значение
     * читается из карточки уже декодированным и экранируется вместе с новой
     * строкой — тем же toBatchSafeText, что и записи multiple-лент.
     */
    private appendScalarHistory(out: EntityFieldsMap, line: string): void {
        const field = this.portal.getEntityFieldByCode(
            this.entityType,
            'op_history',
        );
        if (!field) return;
        const raw = this.entityRecord()?.[this.bitrixKey(field)];
        const previous = typeof raw === 'string' ? raw : '';
        out[this.bitrixKey(field)] = toBatchSafeText(
            joinScalarHistory(line, previous),
        );
    }

    private statusText(prefix: string): string {
        return this.ctx.planEventName
            ? `${prefix}: ${this.ctx.planEventName}`
            : prefix;
    }

    private presentationPlanComment(): string {
        return `${this.nowCrmDate()} Запланирована презентация: ${this.ctx.planEventName}`;
    }
    /**
     * Запись «Презентация состоялась» в ленте `pres_comments`.
     *
     * К комментарию отчёта дописывается «Хвост» — договорённость о следующем
     * шаге, которую менеджер оставляет в анкете. Раньше он жил ТОЛЬКО в поле
     * `op_presentation_xvost` (одно на клиента, перезатирается следующей
     * презентацией), и в ленте — единственном месте, где видно ИСТОРИЮ
     * презентаций, — договорённости не было вовсе: читаешь «Презентация
     * состоялась: ООО Ромашка» и не знаешь, о чём договорились.
     *
     * Хвост многострочный по построению, поэтому и разделитель, и сам текст
     * идут через batch-экранирование: поля сущностей уезжают batch-командой,
     * где сырой `\n` доезжает до карточки подчёркиванием.
     *
     * Лимит ленты (PRES_COMMENTS_LIMIT) не меняется: запись остаётся ОДНОЙ,
     * просто перестала терять половину смысла.
     */
    private presentationDoneComment(): string {
        const head = `${this.nowCrmDate()} Презентация состоялась: ${this.ctx.reportEventName}`;
        const xvost = this.presentationXvost();
        if (!xvost) return head;
        return `${head} — Хвост: ${toMultiFieldEntryText(xvost, ' — ')}`;
    }

    /**
     * Текст анкеты «Хвост» для ленты презентаций.
     *
     * Источник №1 — PAYLOAD отчёта: ответ этой самой презентации приехал
     * вместе с ней, и он свежее любого снимка сущности. Фолбэк — ЛИД, где
     * его оставляет фрейм СТАРОЙ сборки (на компании поля нет вовсе, а на
     * сделке лежит снимок ПРОШЛОЙ презентации, который этот же отчёт
     * только собирается перезаписать). Ни там, ни там нет — пусто, и
     * запись ленты остаётся прежней.
     */
    private presentationXvost(): string {
        const fromPayload = this.ctx.presentationSurvey.xvost;
        if (fromPayload) return fromPayload;
        const lead = this.ctx.lead as unknown as Record<string, unknown> | null;
        if (!lead) return '';
        const field = this.portal.getEntityFieldByCode(
            'lead',
            'op_presentation_xvost',
        );
        if (!field) return '';
        const raw = lead[this.bitrixKey(field)];
        return typeof raw === 'string' ? raw.trim() : '';
    }
    private presentationExpiredComment(): string {
        return `${this.nowCrmDate()} Перенос презентации: ${this.ctx.planEventName}`;
    }
    private failComment(): string {
        /*
         * ПЛОСКИЙ текст: переносы схлопнёт, а спецсимволы экранирует
         * единственный писатель — appendMultiple. Раньше здесь стоял
         * toBatchText, который знает только про переносы: комментарий
         * «Ушли к Иванов & Партнёры» рвал команду, и вместе с ним пропадали
         * история и статусы того же отчёта.
         */
        const label = this.ctx.isNotCa ? 'Не ЦА' : 'Отказ';
        return `${this.nowCrmDate()} ${label}: ${this.ctx.reportComment}`;
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
