import {
    ZprSmartInfo,
    ZprSmartStageCode,
} from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { ZprFlowRun } from '../types/zpr-flow-run.type';

/**
 * ВСЁ ПРО СТАДИИ элемента ЗПР — в одном месте.
 *
 * Ремонтируешь «не в ту стадию уехал» / «не считается открытым» /
 * «закрывающая выбрана неверно» — идти сюда, больше стадии нигде не
 * решаются: writer и lookup только спрашивают этот модуль.
 */

/**
 * Полный stageId стадии ЗПР по её коду; `undefined` — стадии нет на портале.
 *
 * ЗАЧЕМ ФУНКЦИЯ, А НЕ ПРЯМАЯ ИНДЕКСАЦИЯ `info.stageIdByCode['zpr_plan']`:
 * в корневом tsconfig стоит `noImplicitAny: false`, и при нём индексация
 * объекта неизвестным строковым ключом НЕ ошибка — TypeScript молча отдаёт
 * `any`. То есть опечатка `stageIdByCode['zpr_pendin']` компилируется и
 * доезжает до рантайма как `undefined`. Параметр функции проверяется
 * всегда, независимо от этого флага, поэтому опечатка здесь — ошибка
 * компиляции, а редактор подсказывает список стадий. Ровно тем же приёмом
 * защищены поля — см. zprUfKey.
 */
export function zprStageId(
    info: ZprSmartInfo,
    code: ZprSmartStageCode,
): string | undefined {
    return info.stageIdByCode[code];
}

/**
 * Стадии, в которых элемент считается ОТКРЫТЫМ (план и перенос): среди них
 * lookup ищет «тот самый» элемент отчёта. Закрывающие стадии сюда не
 * входят — отработанный звонок закончен и закрывается заново не должен.
 */
export function zprOpenStageIds(info: ZprSmartInfo): string[] {
    return [
        zprStageId(info, 'zpr_plan'),
        zprStageId(info, 'zpr_pending'),
    ].filter((stage): stage is string => Boolean(stage));
}

/** Стадийные решения одного прогона джоба. */
export class ZprStageResolver {
    constructor(private readonly run: ZprFlowRun) {}

    /** Полный stageId стадии; пусто — стадии нет на портале. */
    stageId(code: ZprSmartStageCode): string | undefined {
        return zprStageId(this.run.info, code);
    }

    /**
     * Стадия закрытия звонка (правило владельца 26.08):
     *  - не дозвонились → «Не состоялся»;
     *  - дозвонились, и клиент отказал этим же отчётом → «Состоялся: отказ»
     *    (дозвон состоялся — это не то же самое, что недозвон);
     *  - дозвонились, работа продолжается → «Состоялся: в работе».
     * Что случится со сделкой дальше (продажа, отказ, «не ЦА») читается по
     * самой сделке — элемент привязан к ней родителем.
     *
     * Стадии «Состоялся: отказ» может не быть на портале со СТАРОЙ
     * установкой смарта — тогда честный фолбэк на «Состоялся», а не
     * запись в несуществующую стадию.
     *
     * `undefined` — целевой стадии на портале нет вовсе (смарт установлен
     * не полностью). Вызывающий пишет отчёт БЕЗ смены стадии, а не теряет
     * его целиком (раньше в Битрикс молча уезжал `stageId: undefined`).
     */
    resolveClosingStage(): string | undefined {
        const { job } = this.run;
        if (!job.isResult) return this.stageId('zpr_noresult');
        if (job.isFail) {
            return (
                this.stageId('zpr_result_fail') ?? this.stageId('zpr_success')
            );
        }
        return this.stageId('zpr_success');
    }
}
