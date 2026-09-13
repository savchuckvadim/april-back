import {
    COMPLECT_VARIANT_STAGE,
    resolveComplectVariantStageCode,
} from '@lib/portal-lib/pbx/pbx-complect-variant-smart';

/** Вариант в том виде, в каком он нужен отбору: только стадия элемента. */
export interface VariantStageCandidate {
    stageId?: string | null;
}

/**
 * Какие варианты комплекта переезжают вместе со сделкой.
 *
 * Правило:
 *  1. отклонённые не едут никогда — менеджер уже сказал «нет»;
 *  2. если хоть один вариант помечен «Текущий», едут только текущие: выбор
 *     сделан явно, и тащить за ним черновики незачем;
 *  3. иначе едут все оставшиеся — менеджер стадий не трогал, и отбирать за
 *     него мы не вправе.
 *
 * Пункт 2 заодно лечит накопление: сделка живёт годами, и без него в каждое
 * перезаключение уезжали бы наборы всех прошлых периодов.
 */
export const selectVariantsToCopy = <T extends VariantStageCandidate>(
    candidates: readonly T[],
): T[] => {
    const alive = candidates.filter(
        candidate =>
            resolveComplectVariantStageCode(candidate.stageId) !==
            COMPLECT_VARIANT_STAGE.REJECTED,
    );

    const current = alive.filter(
        candidate =>
            resolveComplectVariantStageCode(candidate.stageId) ===
            COMPLECT_VARIANT_STAGE.CURRENT,
    );

    return current.length ? current : alive;
};
