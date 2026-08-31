import { Logger } from '@nestjs/common';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { findBatchResult } from '../../../shared/bitrix/prepare-batch-results.util';
import { QuestionnaireCatalog } from '@lib/portal-lib/store/questionnaires';
import {
    buildQuestionnaireSmartAnswers,
    QuestionnaireAnswerLike,
    QuestionnaireAnswerPurpose,
    QuestionnaireSmartAnswer,
} from '../../../shared/questionnaire-answers';
import { EventReportContext } from '../context/event-report.context';
import { DealFlowResult } from '../deal/event-report-deal-flow.service';
import { EEventReportEntityType } from '../init/event-report-init.types';
import { SmartKpiRowRef, SmartKpiRowRefs } from '../../../shared/side-flow';

export { SmartKpiRowRef, SmartKpiRowRefs };

/**
 * Общий слой сборки сайд-джобов: всё, что одинаково у ЗПР и презентаций.
 *
 * Специфика потоков живёт в соседних файлах (`zpr-flow-job.builder.ts` и
 * `presentation-flow-job.builder.ts`): правка одного потока не заставляет
 * читать второй, а общий контракт «оба потока получают ОДИН И ТОТ ЖЕ снимок
 * контекста» остаётся ровно в одном месте и разъезжается заметно.
 */

/**
 * Логгер модульного уровня: сборка джобов — чистые функции без состояния,
 * заводить ради одного warning класс незачем. Сам `Logger` состояния не
 * держит, поэтому делить его между порталами безопасно (в отличие от
 * инстанса bitrix, см. CLAUDE.md).
 *
 * Имя контекста осталось прежним (`SideFlowJobBuilder`) намеренно: по нему
 * ищут в логах, и разрез файлов — не повод менять то, что видит дежурный.
 */
export const logger = new Logger('SideFlowJobBuilder');

/** Назначение джоба потока: план создаёт элемент, отчёт закрывает. */
export type SideFlowJobKind = 'plan' | 'report';

/**
 * Всё, что нужно, чтобы разложить ответы портальных анкет по потокам:
 * состав вопросов, сами ответы и выключатель по типам события.
 * Читается ОДИН раз на отчёт и только когда ответы вообще пришли.
 */
export interface QuestionnaireSmartContext {
    catalog: QuestionnaireCatalog;
    answers: QuestionnaireAnswerLike[];
    disabledEventTypes: string[];
}

/** Сценарии строк, в которые дописывается ПЛАНОВЫЙ элемент смарта. */
const KPI_PLAN_SCENARIOS = new Set(['plan', 'unplanned_presentation_plan']);
/** Сценарии строк, в которые дописывается ОТЧЁТНЫЙ элемент смарта. */
const KPI_REPORT_SCENARIOS = new Set(['report', 'presentation_done']);

/**
 * cmd созданных строк → реальные id из ответа батча, разложенные по
 * назначению. Механика та же, что у planTaskId: `lists.element.add` уже
 * выполнен, его результат (числовой id строки) лежит в ответе под ключом
 * команды. Не нашли/чанк упал/поля crm на списке нет — строка молча
 * выпадает: обратная ссылка — украшение, а не инвариант.
 */
export function resolveKpiRowRefs(
    rows: ReadonlyArray<{
        scenario: string | null;
        iblockId: number;
        crmFieldId: string | null;
        cmd: string;
    }>,
    batchResults: IBitrixBatchResponseResult[],
): SmartKpiRowRefs {
    const refs: SmartKpiRowRefs = { plan: [], report: [] };
    for (const row of rows) {
        if (!row.crmFieldId) continue;
        const scenario = row.scenario ?? '';
        const bucket = KPI_PLAN_SCENARIOS.has(scenario)
            ? refs.plan
            : KPI_REPORT_SCENARIOS.has(scenario)
              ? refs.report
              : null;
        if (!bucket) continue;
        const elementId = Number(findBatchResult(batchResults, row.cmd));
        if (!Number.isFinite(elementId) || elementId <= 0) continue;
        bucket.push({
            iblockId: row.iblockId,
            elementId,
            crmFieldId: row.crmFieldId,
        });
    }
    return refs;
}

/**
 * Реальный id сделки, созданной батч-командой `crm.deal.add`
 * (set_pres_deal / set_unplanned_pres_deal): ответ — голое число либо
 * строка с числом. Невалидное → null.
 */
export function parseCreatedDealId(raw: unknown): number | null {
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
}

/** Вход сборки: контекст отчёта плюс то, что дочитал координатор. */
export interface SideFlowJobBuildInput {
    ctx: EventReportContext;
    deals: DealFlowResult;
    /**
     * id задачи, СОЗДАННОЙ этим отчётом (прочитан из ответа того же батча);
     * null — плана не было либо команда создания не удалась.
     */
    planTaskId: number | null;
    /**
     * Реальный id pres-сделки, СОЗДАННОЙ этим отчётом (из ответа батча);
     * фолбэк для `presDealId`, когда в контексте она была `$result[...]`.
     * ЗПР, запланированный вместе с презентацией, получает связь сразу.
     */
    createdPresDealId?: number | null;
    /** Строки KPI/History этого отчёта — адреса обратных ссылок смартов. */
    kpiRowRefs?: SmartKpiRowRefs;
    questionnaire: QuestionnaireSmartContext | null;
    socketId?: string;
}

/**
 * Поля джоба, одинаковые у обоих потоков. Объявлены явно, а не выведены
 * пересечением двух DTO: это КОНТРАКТ «оба потока получают один и тот же
 * снимок контекста», и разъехаться он должен заметно — ошибкой компиляции
 * в `satisfies` конкретного потока, а не молча.
 */
export interface SideFlowJobBase {
    domain: string;
    operationId?: string;
    socketId?: string;
    baseDealId: number | null;
    presDealId: number | null;
    companyId: number | null;
    leadId: number | null;
    contactId: number | null;
    responsibleId: number;
    taskId?: number | null;
    planTaskId?: number | null;
    taskCrmBindings?: string[];
    planDeadline: string | null;
    planName: string | null;
    planComment: string | null;
    reportComment: string | null;
    isResult: boolean;
    answers?: QuestionnaireSmartAnswer[];
}

/**
 * Назначения анкет, которые ДОЕДУТ до элемента смарта.
 *
 * Обычно джоб несёт своё назначение — план в плановый элемент, отчёт в
 * отчётный. Исключение одно: ПЕРЕНОС. План-джоб на нём не ставится (он
 * завёл бы второй открытый элемент), а элемент один и на отчёт, и на
 * новый план — поэтому report-джоб переноса несёт оба назначения, ровно
 * так же, как их раскладывает поток. Всё, что сюда не попало, записать
 * некуда, и об этом обязан быть warning.
 */
export const coveredAnswerPurposes = (
    kinds: ReadonlyArray<SideFlowJobKind>,
    isMove: boolean,
): ReadonlySet<QuestionnaireAnswerPurpose> => {
    const covered = new Set<QuestionnaireAnswerPurpose>(kinds);
    if (isMove && kinds.includes('report')) covered.add('plan');
    return covered;
};

/**
 * Ответы анкеты для ОДНОГО смарта: снимок собирается по каталогу,
 * а не по payload — портал не должен уметь записать произвольное
 * поле произвольного смарта.
 */
export const buildSmartAnswers = (
    questionnaire: QuestionnaireSmartContext | null,
    smartKind: string | undefined,
): QuestionnaireSmartAnswer[] => {
    if (!questionnaire || !smartKind) return [];
    return buildQuestionnaireSmartAnswers({
        catalog: questionnaire.catalog,
        answers: questionnaire.answers,
        smartKind,
        disabledEventTypes: questionnaire.disabledEventTypes,
    });
};

/**
 * Ответы, которые НЕ ПОНЕСЁТ ни один джоб потока.
 *
 * Путей два, и молчать нельзя ни на одном. Первый: поток элемент не
 * трогает вовсе (сорванная презентация понижается до звонка уже во
 * фрейме) — джобов нет, сироты все ответы. Второй: джобы есть, а
 * анкету ОДНОГО назначения нести некому — плановую анкету показало
 * условие, не связанное с типом плана, а план-джоб отчёт не ставит.
 * Менеджер ответил, ответа нигде нет, и объяснить это было бы нечем.
 */
export const warnOrphanAnswers = (
    flow: string,
    ctx: EventReportContext,
    answers: QuestionnaireSmartAnswer[],
    covered: ReadonlySet<QuestionnaireAnswerPurpose>,
): void => {
    const orphans = answers.filter(answer => !covered.has(answer.purpose));
    if (!orphans.length) return;
    const purposes = [...new Set(orphans.map(answer => answer.purpose))].join(
        ', ',
    );
    logger.warn(
        `[${flow}] ${ctx.domain}: анкету назначения «${purposes}» ` +
            `этим отчётом нести некому — ${orphans.length} ответ(ов) ` +
            `записать некуда: ` +
            orphans.map(answer => `${answer.key}=${answer.value}`).join('; '),
    );
};

/**
 * Детерминированный id сайд-джоба — дешёвая защита от двойной
 * ПОСТАНОВКИ (повторный прогон основного отчёта, ретрай контроллера):
 * Bull молча не примет второй джоб с тем же id, пока первый в
 * очереди. Защита от повторной ДОСТАВКИ живёт в воркере
 * (SideFlowGuardService) — это разные беды.
 *
 * Нет operationId (легаси-клиент) — нет и id: поведение прежнее.
 */
export function sideJobId(
    operationId: string | undefined,
    flow: string,
    kind: SideFlowJobKind,
): string | undefined {
    return operationId ? `${operationId}:${flow}:${kind}` : undefined;
}

/**
 * Снимок контекста, общий для обоих потоков. Собирается ОДИН раз: раньше
 * эти два десятка полей были побайтово продублированы в двух методах
 * use-case, и любая правка (новое поле, новый источник id) требовала
 * помнить про вторую копию.
 */
/**
 * Сырые привязки UF_CRM_TASK текущей задачи — как их прислал фронт.
 *
 * tasks.* отдаёт camelCase (`ufCrmTask`), легаси-формы — UPPER; терпим оба.
 * Нестроковые значения отбрасываем: дальше эти строки парсит
 * `parseSmartElementIdsFromTaskBindings`, и мусор ему не нужен.
 */
function readTaskCrmBindings(currentTask: unknown): string[] | undefined {
    const task = currentTask as Record<string, unknown> | null | undefined;
    const raw = task?.ufCrmTask ?? task?.UF_CRM_TASK;
    if (!Array.isArray(raw)) return undefined;
    const bindings = raw.filter(
        (value): value is string => typeof value === 'string',
    );
    return bindings.length ? bindings : undefined;
}

export function buildSideFlowJobBase(
    input: SideFlowJobBuildInput,
    answers: QuestionnaireSmartAnswer[],
): SideFlowJobBase {
    const { ctx, deals, planTaskId, createdPresDealId, socketId } = input;

    // Ссылка `$result[...]` на создаваемую этим же отчётом сделку в джоб
    // не годится — batch уже отправлен, но числового id у нас нет.
    const numericBaseDealId = Number(
        ctx.currentBaseDeal?.ID ?? deals.baseDealId,
    );
    const baseDealId =
        Number.isFinite(numericBaseDealId) && numericBaseDealId > 0
            ? numericBaseDealId
            : null;

    return {
        domain: ctx.domain,
        operationId: ctx.dto.operationId,
        socketId,
        baseDealId,
        // Существующая pres-сделка отчёта, а не нашлась — созданная ЭТИМ
        // отчётом (реальный id из ответа батча): ЗПР «вместе с презентацией»
        // и элемент unplanned-презентации получают связь сразу.
        presDealId:
            Number(ctx.currentPresDeal?.ID) || createdPresDealId || null,
        companyId:
            ctx.entityType === EEventReportEntityType.COMPANY
                ? ctx.entityId
                : Number(ctx.company?.ID) || null,
        leadId: Number(ctx.lead?.ID) || null,
        contactId:
            Number(ctx.dto.plan?.contact?.ID ?? ctx.dto.report?.contact?.ID) ||
            null,
        responsibleId: ctx.planResponsibleId,
        // Задача, ПО КОТОРОЙ отчитываемся: элемент привяжется к ней в
        // UF_CRM_TASK (`T{hex}_{id}`) по завершении джоба.
        taskId: Number(ctx.currentTask?.id) || null,
        // Её же привязки — точный указатель, КАКОЙ элемент смарта закрывать:
        // у клиента может быть несколько запланированных звонков, и искать
        // «свежий открытый по клиенту» — значит закрыть не тот (инцидент
        // 31.08). Терпим оба регистра ключа: tasks.* отдаёт camelCase.
        taskCrmBindings: readTaskCrmBindings(ctx.currentTask),
        // Задача, СОЗДАННАЯ этим отчётом: её id уже лежит в ответе батча,
        // поэтому плановый элемент получает привязку сразу, а не «когда-нибудь
        // при своём закрытии следующим отчётом».
        planTaskId,
        planDeadline: ctx.planDeadline?.toCrmDateTime() ?? null,
        planName: ctx.planEventName || null,
        planComment: ctx.reportComment || null,
        reportComment: ctx.reportComment || null,
        isResult: ctx.isResult,
        // Ответы портальной анкеты: пусто — поля нет вовсе, джоб
        // старой формы читается ровно так же.
        answers: answers.length ? answers : undefined,
    };
}
