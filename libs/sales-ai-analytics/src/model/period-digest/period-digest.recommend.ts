import {
    DIGEST_FALLBACK_MODULE,
    DIGEST_PRIMARY_MODULES,
    DigestDetection,
    DigestModule,
    DigestModuleContext,
} from './modules';
import {
    digestAnchorDirection,
    digestAnchorUnit,
    measureDigestAnchor,
} from './period-digest.anchors';
import {
    DIGEST_DIRECTION,
    DIGEST_READINESS,
    DIGEST_TEXT_SOURCE,
    DigestReadiness,
    DigestRecommendationCode,
} from './period-digest.codes';
import {
    carryDigestRecommendations,
    digestTargetOf,
    mergeDigestRecommendations,
    newDigestRecommendation,
} from './period-digest.status';
import { digestShiftOf } from './period-digest.thresholds';
import type { DigestRecommendation } from './period-digest.types';

/**
 * ВЫБОР РЕКОМЕНДАЦИЙ карточки: перенесённые с прошлой карточки того же
 * вида оцениваются первыми, новые добирают свободные места до лимита
 * активных (3 у месяца, 2 своих у недели) в порядке приоритета модулей.
 * У карточек «мало данных» и «нет звонков» новых нет. Чистые функции.
 */

export interface DigestRecommendInput {
    readonly periodKey: string;
    readonly readiness: DigestReadiness;
    readonly context: DigestModuleContext;
    /** Рекомендации прошлой карточки того же вида. */
    readonly previous: readonly DigestRecommendation[];
    readonly maxActive: number;
    /** Коды, которые новыми не выдаются (у недели — активные месячные). */
    readonly excludedCodes?: ReadonlySet<DigestRecommendationCode>;
}

const EPSILON = 1e-9;

/** Цель лучше базы хотя бы на порог сдвига: иначе рекомендацию нечем мерить. */
function reachableTarget(
    detection: DigestDetection,
    context: DigestModuleContext,
): number | null {
    const target = digestTargetOf(detection.anchor, detection.baseline.value, {
        shift: context.shift,
        norm: detection.norm,
    });
    const sign =
        digestAnchorDirection(detection.anchor) === DIGEST_DIRECTION.up
            ? 1
            : -1;
    const gain = (target - detection.baseline.value) * sign;
    const threshold = digestShiftOf(
        digestAnchorUnit(detection.anchor),
        context.shift,
    );
    return gain >= threshold - EPSILON ? target : null;
}

function issue(
    module: DigestModule,
    detection: DigestDetection,
    context: DigestModuleContext,
    periodKey: string,
): DigestRecommendation | null {
    const target = reachableTarget(detection, context);
    if (target === null) return null;
    return newDigestRecommendation({
        code: module.code,
        text: module.template(detection, target, context),
        source: DIGEST_TEXT_SOURCE.template,
        anchor: detection.anchor,
        periodKey,
        baseline: detection.baseline,
        target,
        evidence: detection.evidence,
    });
}

/**
 * Новые рекомендации по модулям в порядке приоритета. Худший раздел — только
 * когда основные модули молчат; исключённые коды не выдаются.
 */
export function detectDigestRecommendations(
    context: DigestModuleContext,
    periodKey: string,
    excludedCodes: ReadonlySet<DigestRecommendationCode> = new Set(),
): DigestRecommendation[] {
    const detect = (modules: readonly DigestModule[]) =>
        modules.flatMap(module => {
            const detection = module.detect(context);
            return detection ? [{ module, detection }] : [];
        });
    const primary = detect(DIGEST_PRIMARY_MODULES);
    const fired = primary.length ? primary : detect([DIGEST_FALLBACK_MODULE]);
    return fired
        .filter(item => !excludedCodes.has(item.module.code))
        .flatMap(item => {
            const recommendation = issue(
                item.module,
                item.detection,
                context,
                periodKey,
            );
            return recommendation ? [recommendation] : [];
        });
}

/** Рекомендации карточки: перенесённые, затем новые на свободные места. */
export function recommendDigest(
    input: DigestRecommendInput,
): DigestRecommendation[] {
    const { context } = input;
    const carried = carryDigestRecommendations(
        input.previous,
        anchor =>
            measureDigestAnchor(anchor, context.rows, {
                lowScoreCallMax: context.rules.lowScoreCallMax,
            }),
        input.periodKey,
        { minN: context.minN, shift: context.shift },
    );
    const fresh =
        input.readiness === DIGEST_READINESS.ok
            ? detectDigestRecommendations(
                  context,
                  input.periodKey,
                  input.excludedCodes,
              )
            : [];
    return mergeDigestRecommendations(carried, fresh, input.maxActive);
}
