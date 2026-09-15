import {
    COMPLECT_VARIANT_FINAL_STAGES,
    resolveComplectVariantStageCode,
} from '@lib/portal-lib/pbx/pbx-complect-variant-smart';

/** Вариант в том виде, в каком он нужен отбору: только стадия элемента. */
export interface VariantStageCandidate {
    stageId?: string | null;
}

/**
 * Итог по варианту уже подведён: «Успех» (уехал в поставку в прошлый раз),
 * «Отклонён» (менеджер сказал «нет») или «Не состоялся» (не выбрали).
 *
 * Такие варианты не едут никуда и не переоцениваются: иначе наборы прошлых
 * периодов копились бы в каждой новой сервисной сделке, а робот затирал бы
 * ручное решение менеджера.
 */
export const isFinalVariantStage = (stageId?: string | null): boolean => {
    const code = resolveComplectVariantStageCode(stageId);
    return code !== null && COMPLECT_VARIANT_FINAL_STAGES.includes(code);
};

/**
 * Какие варианты комплекта переезжают вместе со сделкой: все, по которым ещё
 * не подведён итог.
 *
 * Раньше здесь было ещё правило «есть помеченные „Текущий“ — едут только
 * они». Его пришлось убрать: конструктор теперь ставит «Текущий»
 * АВТОМАТИЧЕСКИ тому варианту, который менеджер открыл на экране. С прежним
 * правилом робот увозил бы в сервисную сделку один открытый набор, а
 * менеджер, отправляя поставку, видел бы в заявке все свои варианты.
 *
 * Накопление наборов прошлых периодов лечит не это правило, а финальные
 * стадии: уехавшие помечаются «Успех», не уехавшие — «Не состоялся»
 * (ComplectVariantLifecycleService), и в следующий раз они уже не поедут.
 *
 * Зеркало правила на фронте — `selectParticipants` в
 * `front/konstructor/src/modules/modules/complect-variant/lib/complect-variant-participants.ts`.
 */
export const selectVariantsToCopy = <T extends VariantStageCandidate>(
    candidates: readonly T[],
): T[] =>
    candidates.filter(candidate => !isFinalVariantStage(candidate.stageId));
