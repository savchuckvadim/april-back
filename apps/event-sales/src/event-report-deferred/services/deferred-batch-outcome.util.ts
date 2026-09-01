import {
    IBitrixBatchError,
    IBitrixBatchResponseResult,
} from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import {
    DeferredFlowStepKind,
    EnumDeferredFlowStepKind,
} from '../dto/event-report-deferred.dto';

/** Упавшая команда батча: ключ команды + ошибка Битрикса. */
export interface DeferredCommandFailure {
    cmd: string;
    error: IBitrixBatchError;
}

/**
 * `halt=0` у Битрикса: батч исполняет что может, а упавшие команды видны
 * ТОЛЬКО в `result_error`. Пустой PHP-массив сериализуется как `[]` и
 * означает «ошибок нет» — отсюда проверка на массив.
 *
 * Разбор идёт по ОБОИМ источникам склейки (флаши группового буфера +
 * хвостовой вызов): взять один значило бы объявить исполненным шаг, чьи
 * команды на самом деле упали.
 */
export function collectDeferredBatchErrors(
    results: ReadonlyArray<IBitrixBatchResponseResult>,
): DeferredCommandFailure[] {
    const failures: DeferredCommandFailure[] = [];
    for (const chunk of results) {
        const chunkErrors = chunk?.result_error;
        if (!chunkErrors || Array.isArray(chunkErrors)) continue;
        for (const [cmd, error] of Object.entries(chunkErrors)) {
            failures.push({ cmd, error });
        }
    }
    return failures;
}

/** Число выполненных команд в склеенном ответе батча. */
export function countBatchCommands(
    results: ReadonlyArray<IBitrixBatchResponseResult>,
): number {
    return results.reduce(
        (sum, chunk) => sum + Object.keys(chunk?.result ?? {}).length,
        0,
    );
}

/**
 * Соответствие «ключ команды → шаг досылки, которому она принадлежит».
 *
 * Зеркало карты `OPTIONAL_GROUP_DEFERRED_KINDS` фронтового пакета: там она
 * решает, какой шаг ОТЛОЖИТЬ при `ACCESS_DENIED`, здесь — какой шаг считать
 * УПАВШИМ, когда его команда вернула ошибку. Обе стороны обязаны понимать
 * одни и те же ключи, иначе исход шага в ответе врёт.
 *
 * База/ТМЦ/счётчик переносов собственного вида не имеют: их представление —
 * ПАРА шагов (`pres-deals` + `xo-deals`), потому что deal-композит связан
 * `$result`-чейнингом base → pres → tmc и раскроить его по воронкам нельзя.
 */
const STEP_CMD_MATCHERS: ReadonlyArray<{
    matches: (cmd: string) => boolean;
    kinds: ReadonlyArray<DeferredFlowStepKind>;
}> = [
    {
        // Строки KPI/History (KpiListFlowService поверх группового буфера).
        matches: cmd =>
            cmd.startsWith('add_list_item_') ||
            cmd.startsWith('upd_list_item_'),
        kinds: [EnumDeferredFlowStepKind.kpi],
    },
    {
        // Воронка «ОП Презентации» (sales-presentation-deal.service).
        matches: cmd =>
            cmd === 'set_pres_deal' ||
            cmd === 'set_unplanned_pres_deal' ||
            cmd.startsWith('update_pres_deal_') ||
            cmd.startsWith('cancel_pres_deal_'),
        kinds: [EnumDeferredFlowStepKind.presDeals],
    },
    {
        // Воронка «ОП Холодные» (sales-xo-deal.service).
        matches: cmd => cmd.startsWith('update_xo_deal_'),
        kinds: [EnumDeferredFlowStepKind.xoDeals],
    },
    {
        // Остальной deal-композит: база, ТМЦ, счётчик переносов.
        matches: cmd =>
            cmd === 'set_base_deal' ||
            cmd.startsWith('update_base_deal_') ||
            cmd.startsWith('update_tmc_to_pres_') ||
            cmd.startsWith('close_tmc_') ||
            cmd.startsWith('move_count_deal_'),
        kinds: [
            EnumDeferredFlowStepKind.presDeals,
            EnumDeferredFlowStepKind.xoDeals,
        ],
    },
];

/** Шаги, которым принадлежит команда; пусто — команда ничья. */
export function resolveStepKindsForCmd(
    cmd: string,
): ReadonlyArray<DeferredFlowStepKind> {
    return STEP_CMD_MATCHERS.find(group => group.matches(cmd))?.kinds ?? [];
}

/**
 * Первая ошибка КАЖДОГО шага — по ней шаг помечается `failed` и его отметка
 * дедупа снимается (фронт вправе повторить именно его). Ошибки чужих команд
 * шага не касаются: один упавший шаг не роняет остальные.
 */
export function mapFailuresToSteps(
    failures: ReadonlyArray<DeferredCommandFailure>,
): Map<DeferredFlowStepKind, DeferredCommandFailure> {
    const byStep = new Map<DeferredFlowStepKind, DeferredCommandFailure>();
    for (const failure of failures) {
        for (const kind of resolveStepKindsForCmd(failure.cmd)) {
            if (!byStep.has(kind)) byStep.set(kind, failure);
        }
    }
    return byStep;
}

/** Человекочитаемая причина падения для ответа фронту. */
export function describeFailure(failure: DeferredCommandFailure): string {
    const { cmd, error } = failure;
    const code = error?.error ?? 'ERROR';
    const description = error?.error_description ?? '';
    return description ? `${cmd}: ${code} — ${description}` : `${cmd}: ${code}`;
}
