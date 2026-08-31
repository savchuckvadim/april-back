import { Logger } from '@nestjs/common';
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

/** Вход сборки: контекст отчёта плюс то, что дочитал координатор. */
export interface SideFlowJobBuildInput {
    ctx: EventReportContext;
    deals: DealFlowResult;
    /**
     * id задачи, СОЗДАННОЙ этим отчётом (прочитан из ответа того же батча);
     * null — плана не было либо команда создания не удалась.
     */
    planTaskId: number | null;
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
    const { ctx, deals, planTaskId, socketId } = input;

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
        presDealId: Number(ctx.currentPresDeal?.ID) || null,
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
