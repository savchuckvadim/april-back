import { BadRequestException } from '@nestjs/common';
import {
    DeferredFlowStepDto,
    DeferredFlowStepKind,
    DeferredSideFlow,
    DeferredStepOutcomeDto,
    EnumDeferredFlowStepKind,
    EnumDeferredStepStatus,
    EventReportDeferredRequestDto,
    EventReportDeferredResultDto,
} from '../dto/event-report-deferred.dto';

/**
 * Один запланированный шаг: что исполнять, под каким ключом дедупа и куда
 * писать исход. `outcome` — ЖИВАЯ ссылка на строку ответа: исполнители
 * правят её на месте, порядок шагов в ответе совпадает с присланным.
 */
export interface DeferredStepEntry {
    kind: DeferredFlowStepKind;
    flow?: DeferredSideFlow;
    /** id план-задачи, созданной прямым батчем браузера (side-flow). */
    addedTaskId: number | null;
    /** id pres-сделки, созданной прямым батчем браузера (side-flow). */
    createdPresDealId: number | null;
    /** Ключ дедупа: вид шага, а у сайд-flow — вид плюс поток. */
    key: string;
    outcome: DeferredStepOutcomeDto;
}

/**
 * Ключ дедупа шага. Сайд-flow различает потоки: ЗПР и «Презентации» —
 * разные очереди, разные элементы смартов, и общий ключ гасил бы второй
 * поток как мнимый дубль.
 */
export function deferredStepKey(
    kind: DeferredFlowStepKind,
    flow?: DeferredSideFlow,
): string {
    return kind === EnumDeferredFlowStepKind.sideFlow
        ? `${kind}:${flow}`
        : kind;
}

/**
 * Разбор присланных шагов в план исполнения.
 *
 * Два повторяющихся шага в ОДНОМ запросе — не ошибка клиента, а лишняя
 * работа: второй сразу помечается `duplicate` и до Битрикса не доходит
 * (иначе дедуп Redis отдал бы тот же вердикт, но уже после похода в
 * портал).
 *
 * `side-flow` без потока — битый шаг: поток решает, в какую очередь и в
 * какой смарт уедет элемент, угадать его нечем. Это 400: фронт таких шагов
 * не строит, и молча проглотить их значило бы потерять хвост.
 */
export function planDeferredSteps(
    steps: ReadonlyArray<DeferredFlowStepDto>,
): DeferredStepEntry[] {
    const seen = new Set<string>();

    return steps.map(step => {
        if (step.kind === EnumDeferredFlowStepKind.sideFlow && !step.flow) {
            throw new BadRequestException(
                'Шаг side-flow без поля flow: непонятно, в какой смарт ' +
                    '(zpr | pres) досылать элемент.',
            );
        }

        const key = deferredStepKey(step.kind, step.flow);
        const repeated = seen.has(key);
        seen.add(key);

        const outcome: DeferredStepOutcomeDto = {
            kind: step.kind,
            ...(step.flow ? { flow: step.flow } : {}),
            status: repeated
                ? EnumDeferredStepStatus.duplicate
                : EnumDeferredStepStatus.failed,
            ...(repeated
                ? { detail: 'шаг повторяется в этом же запросе' }
                : {}),
        };

        return {
            kind: step.kind,
            flow: step.flow,
            addedTaskId: step.addedTaskId ?? null,
            createdPresDealId: step.createdPresDealId ?? null,
            key,
            outcome,
        };
    });
}

/**
 * Шаги, которые предстоит исполнить: всё, что ещё не получило терминальный
 * исход (`duplicate`) на этапе планирования или резервирования.
 *
 * Стартовый статус шага — `failed` ОСОЗНАННО: «не исполнен, пока не доказано
 * обратное». Свались запрос где угодно между планированием и исполнением —
 * фронт увидит шаг в `pending` и повторит его, а не сочтёт доставленным.
 */
export function pendingSteps(
    entries: ReadonlyArray<DeferredStepEntry>,
): DeferredStepEntry[] {
    return entries.filter(
        entry => entry.outcome.status === EnumDeferredStepStatus.failed,
    );
}

/**
 * Расхождения запроса и payload, которые ослабляют идемпотентность.
 *
 * `jobId` сайд-джоба строится из `payload.operationId` (так его строит
 * координатор обычного flow), а отметка дедупа — из `operationId` запроса.
 * Разъехались — очередь перестаёт узнавать повтор; нет вовсе — `jobId` не
 * проставляется, и защита остаётся только у Redis-отметки. Молчать об этом
 * нельзя: снаружи это выглядит как «иногда двоятся элементы смартов».
 */
export function collectPayloadWarnings(
    dto: EventReportDeferredRequestDto,
): string[] {
    const warnings: string[] = [];
    const payloadOperationId = dto.payload?.operationId;
    if (!payloadOperationId) {
        warnings.push(
            'payload без operationId — jobId сайд-джобов не ' +
                'проставляется, дедуп очереди не работает',
        );
    } else if (payloadOperationId !== dto.operationId) {
        warnings.push(
            `operationId запроса (${dto.operationId}) и payload ` +
                `(${payloadOperationId}) различаются — дедуп сайд-джобов ` +
                'работает по payload',
        );
    }
    if (dto.payload?.domain && dto.payload.domain !== dto.domain) {
        warnings.push(
            `домен запроса (${dto.domain}) и payload ` +
                `(${dto.payload.domain}) различаются — портал взят из запроса`,
        );
    }
    return warnings;
}

/**
 * Ответ ручки. `pending` — ровно те шаги, которые фронт обязан оставить в
 * конверте: всё, что не `executed` и не `duplicate`.
 */
export function buildDeferredResult(
    dto: EventReportDeferredRequestDto,
    entries: ReadonlyArray<DeferredStepEntry>,
    commandsCount: number,
    warnings: string[],
): EventReportDeferredResultDto {
    const pending = entries
        .filter(entry => entry.outcome.status === EnumDeferredStepStatus.failed)
        .map(entry => entry.key);

    return {
        accepted: true,
        operationId: dto.operationId,
        steps: entries.map(entry => entry.outcome),
        completed: pending.length === 0,
        pending,
        commandsCount,
        warnings,
    };
}
