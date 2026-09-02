import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { ETaskPriority } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { IBXChecklistItem } from '@/modules/bitrix/domain/tasks/checklist-item';
import { mergeTaskCrmBindings } from '@/modules/bitrix/domain/tasks/task/lib/task-crm-binding.util';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { toBatchSafeText } from '@lib/bitrix/consts/batch.consts';
import { EventReportContext } from '../context/event-report.context';
import {
    clipTaskTitle,
    clipText,
    TASK_COMMENT_MAX_LENGTH,
} from './event-task-title';
import {
    buildEventTaskChecklist,
    formatChecklistOutcomeLine,
    hasChecklistResults,
    matchEventTaskChecklist,
} from './event-task-checklist.catalog';
import {
    buildEventTaskDescription,
    EventTaskDescriptionDeal,
} from './event-task-description.builder';
import {
    COLD_EVENT_TYPE_TO_WORK_KIND,
    EVENT_REPORT_EVENT_TYPE_NAME,
    isColdEventType,
} from '../../types/event-report.event-codes';
import {
    coldTaskTypeName,
    LEAD_WORK_KIND,
    LeadWorkKind,
} from '../../../shared/event-title';
import { EEventReportEntityType } from '../init/event-report-init.types';
import { DealFlowResult } from '../deal/event-report-deal-flow.service';

/**
 * Эмодзи-маркеры «важных» планов (legacy `isPlannedImportant`).
 * Добавляются перед русским названием типа события — фронт парсит TITLE
 * по подстроке («Презентация», «Звонок», «Холодный обзвон», ...) и по этому
 * вычисляет `task.eventType`. Любая правка формата ломает фронт.
 */
const TITLE_EMOJI_BY_PLAN_TYPE: Record<string, string> = {
    presentation: '⚡',
    hot: '🔥',
    moneyAwait: '💎',
    refine: '🔧',
};

/**
 * «Важные» планы — задача ставится с HIGH-приоритетом. Отдельно от эмодзи:
 * у доработки СВОЙ значок в TITLE, но приоритет обычный (MEDIUM) — она
 * не горящий шаг воронки, а фоновая работа с клиентом.
 */
const IMPORTANT_PLAN_TYPES = new Set(['presentation', 'hot', 'moneyAwait']);

/** Cold/xo — фиксированное русское название (legacy `$stringType`). */
const COLD_TASK_TYPE_NAME = 'Холодный обзвон';

/**
 * Ключ batch-команды создания задачи. Пункты чек-листа ссылаются на её
 * результат (`$result[add_task][task][id]` — форма ответа `tasks.task.add`:
 * `{ result: { task: { id } } }`), поэтому ключ вынесен в константу: разъедься
 * он с ссылкой — чек-лист молча уехал бы в никуда.
 */
export const ADD_TASK_CMD = 'add_task';
const NEW_TASK_ID_REF = `$result[${ADD_TASK_CMD}][task][id]`;

/**
 * Разбирает результат команды {@link ADD_TASK_CMD} (`tasks.task.add`) в
 * числовой id созданной задачи.
 *
 * Форма ответа — `{ task: { id } }`: ссылка `$result[add_task][task][id]`
 * индексирует `[task][id]` уже ПОСЛЕ ключа команды, то есть значением по ключу
 * `add_task` лежит именно `{ task: { id } }`. Благодаря этому id план-задачи
 * достаётся из ответа того же батча — без единого лишнего запроса в Битрикс.
 *
 * Битрикс отдаёт id то строкой, то числом, поэтому приводим к числу. Всё, что
 * не разобралось (команда упала, ключа не было, форма другая), даёт `null`:
 * вызывающий просто не делает привязку, вместо того чтобы уронить отчёт.
 */
export function parseAddedTaskId(raw: unknown): number | null {
    if (!raw || typeof raw !== 'object') return null;

    const task = (raw as { task?: unknown }).task;
    if (!task || typeof task !== 'object') return null;

    const id = (task as { id?: unknown }).id;
    if (typeof id !== 'string' && typeof id !== 'number') return null;

    const parsed = Number(id);
    // 0 и NaN — не id: пустая строка тоже даёт 0, поэтому отсекаем оба.
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Заголовок задачи из СЫРОГО ответа Битрикса (тип поля — `unknown`).
 *
 * Имя поля зависит от метода: `tasks.task.*` отдают camelCase `title`, старые
 * `task.item.*` и выборки по фильтру — `TITLE`, поэтому смотрим оба.
 *
 * Почему не `String(...)`: у объекта приведение молча даёт `[object Object]`,
 * и этот мусор уехал бы дальше по коду — в TITLE переносимой задачи и в текст
 * уведомления ответственному. Сужаем по `typeof`: строку берём как есть
 * (поведение прежнее), число печатаем штатно (Битрикс иногда отдаёт
 * числоподобные значения строкой, иногда числом), всё остальное считаем
 * отсутствующим заголовком — вызывающий на пустую строку уже рассчитывает.
 */
function readTaskTitle(task: Record<string, unknown> | null): string {
    const raw = task?.title ?? task?.TITLE;
    if (typeof raw === 'string') return raw.trim();
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
    return '';
}

/**
 * Task flow event-report (legacy `BitrixTaskService::getCreateTaskBatchCommands`
 * + `getUpdateTaskBatchCommand`).
 *
 * Маршрутизация:
 *  - `isExpired && currentTask` (ПЕРЕНОС: отчёт не результативный, план не
 *    выключен) → `update` ТОЙ ЖЕ задачи: дедлайн и — если менеджер переписал
 *    название — TITLE. Тип события и привязки не трогаем: задача та же.
 *    Ответственному дополнительно уходит сообщение в чат
 *    ({@link notifyTransfer} — вызывается use-case'ом ПОСЛЕ батча).
 *  - иначе:
 *      • если есть `currentTask`, `!isNew` и отчёт НЕ «Не очень» →
 *        `complete(currentTask)`;
 *      • если `isPlanned` → `add(newTask)`.
 *
 * «Не очень» (`isNoResult`) задачу не закрывает: разговор не состоялся,
 * работа не сделана. Либо её переносят на новую дату (ветка выше), либо не
 * трогают вовсе — недозвон фиксируется только в полях, истории и стадиях.
 * Исключение — финальный статус: «Отказ»/«Продажа» по недозвонной цепочке
 * означают, что работа окончена, и задача обязана закрыться.
 *
 * Поле комментария — `UF_TASK_EVENT_COMMENT` (legacy имя).
 *
 * TITLE формат (legacy):
 *   `<typeName>  <eventName>  <contactName?>`  (двойные пробелы между).
 * `typeName` — `plan.type.current.name` из DTO (русское), для cold/xo
 * перетирается на «Холодный обзвон»; для presentation/hot/moneyAwait
 * добавляется эмодзи спереди.
 *
 * DESCRIPTION (todo2508 §13) — BB-код: ссылки на компанию/основную сделку/
 * контакт и телефоны всех доступных сущностей. Собирает
 * {@link buildEventTaskDescription}, стиль — одна константа
 * `EVENT_TASK_DESCRIPTION_STYLE`.
 *
 * ЧЕК-ЛИСТ (гейт `task_checklist_enabled`): состав — по типу планируемого
 * события ({@link buildEventTaskChecklist}); при закрытии задачи её пункты
 * читаются ({@link EventReportTaskFlowService.readClosingChecklist}) и итог
 * уходит в историю карточки и комментарий задачи.
 */
export class EventReportTaskFlowService {
    private readonly logger = new Logger(EventReportTaskFlowService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
        /**
         * Гейт чек-листов (`task_checklist_enabled` портала). Выключено —
         * задача создаётся ровно как раньше, чтение при закрытии не идёт.
         */
        private readonly checklistEnabled: boolean = false,
    ) {}

    /**
     * Читает чек-лист ЗАКРЫВАЕМОЙ задачи и кладёт итог в контекст.
     *
     * Почему отдельным вызовом ДО общего batch: batch уезжает одной волной в
     * самом конце use-case, а итог нужен раньше — историю карточки собирает
     * entity-flow, первый в цепочке. Здесь ровно один прямой `getlist`
     * (batch-аккумулятор не трогаем — как `KpiListFlowService.flowDedup`).
     *
     * Тихая деградация: настройка выключена, задачи нет, задача не
     * закрывается, метод не поддержан порталом — итог остаётся null, отчёт
     * идёт как обычно.
     */
    async readClosingChecklist(ctx: EventReportContext): Promise<void> {
        if (!this.checklistEnabled) return;
        const taskId = this.closingTaskId(ctx);
        if (!taskId) return;

        try {
            const response = await this.bitrix.checklistItem.getList({
                TASKID: taskId,
                ORDER: { SORT_INDEX: 'asc' },
            });
            const rawItems = response?.result;
            if (!Array.isArray(rawItems)) return;

            const outcome = matchEventTaskChecklist(
                taskId,
                rawItems as IBXChecklistItem[],
            );
            ctx.setTaskChecklist(hasChecklistResults(outcome) ? outcome : null);
        } catch (error) {
            this.logger.warn(
                `task-flow: чек-лист задачи ${taskId} не прочитан — ` +
                    `итог не записан (${(error as Error).message})`,
            );
        }
    }

    queue(ctx: EventReportContext, deals: DealFlowResult): void {
        const currentTaskId = ctx.currentTask?.id
            ? Number(ctx.currentTask.id)
            : null;

        if (ctx.isExpired && currentTaskId) {
            const fields: Record<string, string> = {};
            // Bitrix хранит DEADLINE задач в server-time (Москва) — сырую
            // строку плана слать нельзя, на не-московском портале время уедет.
            if (ctx.planDeadline) {
                fields.DEADLINE = ctx.planDeadline.toTaskDeadline();
                fields.ALLOW_CHANGE_DEADLINE = 'Y';
            }
            const nextTitle = this.buildRenamedTitle(ctx);
            if (nextTitle) fields.TITLE = nextTitle;

            if (Object.keys(fields).length) {
                this.bitrix.batch.task.update(
                    `update_task_${currentTaskId}`,
                    currentTaskId,
                    fields,
                );
            }
            return;
        }

        const closingTaskId = this.closingTaskId(ctx);
        if (closingTaskId) {
            // Итог чек-листа — комментарием в самой задаче ДО закрытия:
            // в закрытой задаче менеджер видит, что именно он подтвердил.
            this.queueChecklistSummaryComment(ctx, closingTaskId);
            this.bitrix.batch.task.complete(
                `complete_task_${closingTaskId}`,
                closingTaskId,
            );
        }

        if (ctx.isPlanned) {
            const description = buildEventTaskDescription({
                domain: ctx.domain,
                company: ctx.company,
                lead: ctx.lead,
                contacts: [ctx.planContact, ctx.reportContact],
                baseDeal: this.resolveBaseDeal(ctx, deals),
                comment: ctx.reportComment,
            });

            this.bitrix.batch.task.add(ADD_TASK_CMD, {
                TITLE: this.buildTitle(ctx),
                RESPONSIBLE_ID: ctx.planResponsibleId,
                CREATED_BY: ctx.planCreatedById || ctx.planResponsibleId,
                DEADLINE: ctx.planDeadline?.toTaskDeadline() ?? '',
                ALLOW_CHANGE_DEADLINE: 'Y',
                PRIORITY: this.isPlannedImportant(ctx)
                    ? ETaskPriority.HIGH
                    : ETaskPriority.MEDIUM,
                GROUP_ID: this.portal.getSalesTaskGroupId(),
                UF_CRM_TASK: this.buildCrmTaskLinks(ctx, deals),
                // Свободный текст менеджера одним значением batch-команды:
                // строгое экранирование (`&`/`+`/`%` рвут разбор cmd) и
                // лимит фрейма — payload мимо фрейма не должен ронять
                // создание задачи (todo0209 №2).
                UF_TASK_EVENT_COMMENT: toBatchSafeText(
                    clipText(ctx.reportComment, TASK_COMMENT_MAX_LENGTH),
                ),
                // Пустое описание не шлём вовсе: перезаписывать нечем, а
                // пустая строка стёрла бы дефолтное оформление задачи.
                ...(description
                    ? {
                          DESCRIPTION: toBatchSafeText(description),
                          DESCRIPTION_IN_BBCODE: 'Y',
                      }
                    : {}),
            });

            this.queueChecklistItems(ctx);
        }
    }

    /**
     * ID задачи, которую этот отчёт ЗАКРЫВАЕТ; null — закрывать нечего.
     * Один предикат на два места (чтение чек-листа и сам `complete`), иначе
     * они разъехались бы при первой же правке правил закрытия.
     */
    private closingTaskId(ctx: EventReportContext): number | null {
        const taskId = ctx.currentTask?.id ? Number(ctx.currentTask.id) : null;
        if (!taskId) return null;
        // Перенос — задача остаётся жить (ветка update выше).
        if (ctx.isExpired) return null;
        if (ctx.isNew) return null;
        const isFinalStatus = ctx.isFail || ctx.isSuccessSale;
        if (ctx.isNoResult && !isFinalStatus) return null;
        return taskId;
    }

    /**
     * Пункты чек-листа новой задачи — командами `task.checklistitem.add` в
     * ТОМ ЖЕ batch, по ссылке на результат `add_task`.
     *
     * PARENT_ID не передаём осознанно: Битрикс положит пункты в верхний
     * чек-лист задачи, а если его нет — заведёт сам (см. доку метода).
     *
     * Ограничение batch: `$result[...]` работает только внутри одной
     * HTTP-пачки (50 команд). Пунктов максимум четыре и уезжают они сразу
     * за `add_task` — но если общий поток когда-нибудь перевалит за 50
     * команд, чек-лист отвалится первым, и это будет видно в result_error.
     */
    private queueChecklistItems(ctx: EventReportContext): void {
        if (!this.checklistEnabled) return;
        const items = buildEventTaskChecklist(ctx.planEventType);
        if (!items.length) return;

        for (const item of items) {
            this.bitrix.batch.checklistItem.add(
                `add_task_checklist_${item.code}`,
                {
                    TASKID: NEW_TASK_ID_REF,
                    FIELDS: {
                        TITLE: item.title,
                        SORT_INDEX: item.sort,
                        IS_COMPLETE: 'N',
                    },
                },
            );
        }
    }

    /** Сводка чек-листа комментарием в закрываемой задаче. */
    private queueChecklistSummaryComment(
        ctx: EventReportContext,
        taskId: number,
    ): void {
        const line = formatChecklistOutcomeLine(ctx.taskChecklist);
        if (!line) return;

        const authorId = ctx.planResponsibleId || ctx.planCreatedById;
        if (!authorId) {
            this.logger.warn(
                `task-flow: сводка чек-листа задачи ${taskId} не записана — ` +
                    'нет автора комментария',
            );
            return;
        }

        this.bitrix.batch.task.commentAdd(
            `comment_task_checklist_${taskId}`,
            taskId,
            {
                AUTHOR_ID: authorId,
                POST_MESSAGE: toBatchSafeText(line),
            },
        );
    }

    /**
     * Основная (sales_base) сделка для ссылки в описании — ТОЛЬКО с реальным
     * id. `deals.baseDealId` бывает ссылкой `$result[...]` на сделку,
     * создаваемую этим же батчем: подставлять её в URL нельзя — не подставься
     * она, менеджер получил бы битую ссылку прямо в описании задачи.
     */
    private resolveBaseDeal(
        ctx: EventReportContext,
        deals: DealFlowResult,
    ): EventTaskDescriptionDeal | null {
        const base = ctx.currentBaseDeal;
        const id = Number(base?.ID ?? deals.baseDealId);
        if (!Number.isFinite(id) || id <= 0) return null;
        return { id, title: base?.TITLE ? String(base.TITLE) : undefined };
    }

    /**
     * Новый TITLE переносимой задачи; null — переименовывать не нужно.
     *
     * Название события — единственное, что менеджер может поправить при
     * переносе (`plan.name`): «о чём договорились» на новую дату бывает не
     * тем, что планировали раньше. Инвариант (todo2508-02 №4а): имя передали,
     * и в заголовке его ещё нет — оно ОБЯЗАНО оказаться в TITLE. Раньше
     * заголовок не нашего формата (легаси-задачи с одиночными пробелами,
     * ручные правки) молча пропускался — карточка обновлялась, а TITLE нет.
     *
     * Три ветки по убыванию бережности:
     *  1. Наш формат `<тип>  <имя>  <контакт?>` (двойные пробелы) — меняется
     *     ТОЛЬКО средняя часть: тип события при переносе тот же (задача та
     *     же), а фронт читает eventType по подстроке типа в TITLE.
     *  2. Формат не распознан, но тип определим из контекста отчёта —
     *     заголовок пересобирается целиком в наш формат `<тип>  <имя>`.
     *  3. Тип не определим — имя честно дописывается к текущему заголовку:
     *     терять его нельзя, а сочинять тип — ломать парсер фронта.
     */
    private buildRenamedTitle(ctx: EventReportContext): string | null {
        const nextName = ctx.planEventName?.trim();
        if (!nextName) return null;

        const task = ctx.currentTask as unknown as Record<
            string,
            unknown
        > | null;
        const currentTitle = readTaskTitle(task);
        if (!currentTitle) return null;

        // 1. Наш формат — замена средней части, хвост (контакт) сохраняется.
        const parts = currentTitle.split('  ');
        if (parts.length >= 2) {
            if (parts[1].trim() === nextName) return null;
            parts[1] = nextName;
            return parts.join('  ');
        }

        // Имя уже в заголовке (менеджер его не менял) — переименовывать
        // нечего: формат чужого заголовка нам неизвестен, лишний update
        // только сдвинул бы «кто изменил задачу».
        if (currentTitle.includes(nextName)) return null;

        // 2. Пересборка в наш формат — тип восстановим из контекста.
        const typeName = this.resolveTransferTypeName(ctx);
        if (typeName) return `${typeName}  ${nextName}`;

        // 3. Честный фолбэк: новое имя не может потеряться.
        return `${currentTitle}  ${nextName}`;
    }

    /**
     * Имя типа события для пересборки заголовка при переносе; null — тип не
     * определим. Тип берём из ОТЧЁТА (`currentTask.eventType` — задача та
     * же), план — фолбэк: при переносе тип обычно не перевыбирают и в DTO
     * его нет. Формат повторяет {@link resolveTypeName} для новой задачи:
     * холодные — «Холодный обзвон» со словом вида («. Заявка.» / «. Лид.»),
     * «важные» — эмодзи + русское имя; русские имена — из общего словаря
     * `EVENT_REPORT_EVENT_TYPE_NAME`, фразы которого фронт узнаёт в
     * `parseTaskTitle`.
     */
    private resolveTransferTypeName(ctx: EventReportContext): string | null {
        const type = ctx.reportEventType ?? ctx.planEventType;
        if (!type) return null;

        if (isColdEventType(type)) {
            return coldTaskTypeName(
                COLD_TASK_TYPE_NAME,
                COLD_EVENT_TYPE_TO_WORK_KIND[type],
            );
        }

        const name = EVENT_REPORT_EVENT_TYPE_NAME[type];
        if (!name) return null;
        const emoji = TITLE_EMOJI_BY_PLAN_TYPE[type];
        return emoji ? `${emoji} ${name}` : name;
    }

    /**
     * Сообщение ответственному о переносе (todo2508-02 №4б; legacy-паритет —
     * старое приложение при переносе слало сообщение в чат, менеджеры на
     * него ориентируются).
     *
     * Вызывается use-case'ом ПОСЛЕ основного батча отдельным вызовом:
     * `im.notify` не поддерживает batch-подстановки `$result[...]`, а
     * падение уведомления не должно ронять уже выполненный перенос —
     * ошибка гасится здесь (warn), наружу не выходит.
     *
     * Гейта «ответственный = автор переноса» осознанно НЕТ: владелец
     * переносит сам себе и ждёт сообщение — оно же и подтверждение, что
     * перенос доехал.
     */
    async notifyTransfer(ctx: EventReportContext): Promise<void> {
        const taskId = ctx.currentTask?.id ? Number(ctx.currentTask.id) : null;
        if (!ctx.isExpired || !taskId) return;

        const task = ctx.currentTask as unknown as Record<
            string,
            unknown
        > | null;
        const responsibleId =
            ctx.planResponsibleId || Number(task?.responsibleId ?? 0) || 0;
        if (!responsibleId) {
            this.logger.warn(
                `task-flow: перенос задачи ${taskId} — уведомление не ` +
                    'отправлено (не определён ответственный)',
            );
            return;
        }

        // Имя события: новое из плана; менеджер его не менял — имя текущей
        // задачи из отчёта; в крайнем случае — сырой TITLE.
        const eventName =
            ctx.planEventName?.trim() ||
            ctx.reportEventName?.trim() ||
            readTaskTitle(task) ||
            `задача ${taskId}`;
        const taskUrl =
            `https://${ctx.domain}/company/personal/user/${responsibleId}` +
            `/tasks/task/view/${taskId}/`;
        const deadlinePart = ctx.planDeadline
            ? `, новый срок ${ctx.planDeadline.toRuHumanDateTime()}`
            : '';
        const message = `Звонок перенесён: [URL=${taskUrl}]${eventName}[/URL]${deadlinePart}.`;

        try {
            await this.bitrix.imNotify.systemAdd({
                USER_ID: responsibleId,
                MESSAGE: message,
            });
        } catch (error) {
            this.logger.warn(
                `task-flow: уведомление о переносе задачи ${taskId} не ` +
                    `отправлено — ${(error as Error).message}`,
            );
        }
    }

    /**
     * TITLE = `<typeName>  <eventName>  <contactName?>` (двойной пробел между).
     */
    private buildTitle(ctx: EventReportContext): string {
        // В `varchar(250)`: длиннее — tasks.task.add отказывает целиком, и
        // задача не создаётся при «проведённом» отчёте (todo0209 №2).
        return clipTaskTitle({
            typeName: this.resolveTypeName(ctx),
            eventName: ctx.planEventName?.trim() ?? '',
            contactName: ctx.dto.plan?.contact?.NAME?.trim() ?? '',
        });
    }

    /**
     * Имя типа события для TITLE задачи.
     * - холодные типы → «Холодный обзвон» + слово вида («. Заявка.» / «. Лид.»);
     * - presentation/hot/moneyAwait → эмодзи + русское имя из DTO;
     * - остальные → русское имя из DTO как есть.
     */
    private resolveTypeName(ctx: EventReportContext): string {
        const coldKind = this.resolveColdKind(ctx);
        if (coldKind) return coldTaskTypeName(COLD_TASK_TYPE_NAME, coldKind);

        const dtoName = ctx.dto.plan?.type?.current?.name?.trim() ?? '';
        const prefix =
            ctx.planEventType && TITLE_EMOJI_BY_PLAN_TYPE[ctx.planEventType];
        if (prefix && dtoName) return `${prefix} ${dtoName}`;
        return dtoName;
    }

    /**
     * Вид холодной работы для следующей задачи; null — план не холодный.
     *
     * Почему смотрим и на ОТЧЁТ, а не только на план: справочник планов
     * (`EnumEventPlanCode`) знает единственный холодный код `cold`, поэтому
     * при планировании следующего звонка по ЗАЯВКЕ план приезжает как `xo`.
     * Если взять только его, слово «Заявка» из заголовка пропадёт — и фронт
     * прочитает следующую задачу как обычный холодный обзвон, а менеджер
     * настроится не на тот разговор. Поэтому вид наследуется от события,
     * по которому отчитались, пока план не скажет иное явно.
     */
    private resolveColdKind(ctx: EventReportContext): LeadWorkKind | null {
        if (!isColdEventType(ctx.planEventType)) return null;
        const planKind = COLD_EVENT_TYPE_TO_WORK_KIND[ctx.planEventType];
        if (planKind !== LEAD_WORK_KIND.cold) return planKind;
        return isColdEventType(ctx.reportEventType)
            ? COLD_EVENT_TYPE_TO_WORK_KIND[ctx.reportEventType]
            : LEAD_WORK_KIND.cold;
    }

    /**
     * HIGH-приоритет новой задачи: флаг «важная» из UI планирования ИЛИ
     * «важный» тип события. Флаг сильнее типа (todo2508-02 №10): менеджер
     * отметил задачу важной руками — верим, каким бы ни был тип.
     */
    private isPlannedImportant(ctx: EventReportContext): boolean {
        if (ctx.isPlanMarkedImportant) return true;
        return Boolean(
            ctx.planEventType && IMPORTANT_PLAN_TYPES.has(ctx.planEventType),
        );
    }

    /**
     * Порядок ссылок в `UF_CRM_TASK` повторяет legacy:
     *   L_<lead> → C_<planContact> → D_<владелец> → D_<base> →
     *   D_<plannedPres> → D_<unplannedPres> → CO_<company>.
     */
    private buildCrmTaskLinks(
        ctx: EventReportContext,
        deals: DealFlowResult,
    ): string[] {
        const links: string[] = [];

        if (ctx.entityType === EEventReportEntityType.LEAD && ctx.entityId) {
            links.push(`L_${ctx.entityId}`);
        }

        // Лид не должен теряться при работе из сделки/компании: следующая
        // задача наследует L_* текущей задачи и лиды-первоисточники сделки
        // (deal_from_lead_id / deal_joined_leads / LEAD_ID) — из лида видно,
        // что происходит с работой.
        links.push(...this.collectInheritedLeadLinks(ctx));

        // Заявка, с которой менеджер связал презентацию (модалка перед
        // отправкой) — следующая задача обязана нести её L_-привязку.
        const linkedLead = ctx.dto.leadSync?.presentationLink
            ? Number(ctx.dto.leadSync.leadId)
            : NaN;
        if (Number.isFinite(linkedLead) && linkedLead > 0) {
            links.push(`L_${linkedLead}`);
        }

        // Лиды, отмеченные менеджером при создании задачи из сделки/компании
        // без текущей задачи (чекбоксы «связано с этими заявками?»).
        for (const rawId of ctx.dto.plan?.relatedLeadIds ?? []) {
            const id = Number(rawId);
            if (Number.isFinite(id) && id > 0) {
                links.push(`L_${id}`);
            }
        }

        const planContactId = ctx.dto.plan?.contact?.ID;
        if (planContactId) {
            links.push(`C_${planContactId}`);
        }

        // Владелец-сделка: задача обязана ссылаться на неё — иначе кейс
        // «сделка без компании» оставит задачу вообще без CRM-привязки.
        if (ctx.entityType === EEventReportEntityType.DEAL && ctx.entityId) {
            links.push(`D_${ctx.entityId}`);
        }

        if (
            deals.baseDealId &&
            String(deals.baseDealId) !== String(ctx.entityId)
        ) {
            links.push(`D_${deals.baseDealId}`);
        }
        if (deals.newPlanPresDealId) {
            links.push(`D_${deals.newPlanPresDealId}`);
        }
        if (deals.newUnplannedPresDealId) {
            links.push(`D_${deals.newUnplannedPresDealId}`);
        }

        if (ctx.entityType === EEventReportEntityType.COMPANY && ctx.entityId) {
            links.push(`CO_${ctx.entityId}`);
        }

        // Дедуп с сохранением порядка первого вхождения (legacy-порядок цел).
        return mergeTaskCrmBindings(links, []);
    }

    /**
     * `L_*`-привязки, которые новая задача обязана унаследовать:
     *  1) из текущей задачи (UF_CRM_TASK) — лид уже был в цепочке;
     *  2) из сделки-владельца: deal_from_lead_id, deal_joined_leads (наши
     *     поля графа) и штатный LEAD_ID — работа началась ХО-хуком из лида.
     */
    private collectInheritedLeadLinks(ctx: EventReportContext): string[] {
        const leads: string[] = [];
        const push = (raw: unknown): void => {
            const values = Array.isArray(raw) ? raw : [raw];
            for (const value of values) {
                if (value == null) continue;
                const match = /^(?:L_)?(\d+)$/.exec(String(value).trim());
                if (match && Number(match[1]) > 0) {
                    leads.push(`L_${match[1]}`);
                }
            }
        };

        const task = ctx.currentTask as unknown as Record<
            string,
            unknown
        > | null;
        const taskBindings = task?.ufCrmTask ?? task?.UF_CRM_TASK;
        if (Array.isArray(taskBindings)) {
            for (const binding of taskBindings) {
                if (typeof binding === 'string' && binding.startsWith('L_')) {
                    push(binding);
                }
            }
        }

        const deal = ctx.ownerDeal as unknown as Record<string, unknown> | null;
        if (deal) {
            push(deal.LEAD_ID);
            for (const code of [
                PBX_SALES_EVENT_FIELD_CODES.deal_from_lead_id,
                PBX_SALES_EVENT_FIELD_CODES.deal_joined_leads,
            ]) {
                const field = this.portal.getEntityFieldByCode('deal', code);
                if (!field) continue;
                push(deal[this.portal.getFieldBitrixId(field)]);
            }
        }

        return leads;
    }
}
