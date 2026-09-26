/**
 * Секция «надёжность оценщика» блока «Как считаем» (Фаза 3, П7): последний
 * отчёт согласия портала (`ai-analytics-golden-report`) → DTO. Порог
 * надёжности поля — `golden_kappa_min` реестра со слоями портала; чисел,
 * написанных руками, нет.
 *
 * Отчёта нет или форма чужая — секция `null`: витрина честно молчит, а не
 * показывает нули (§5.4).
 *
 * Чистая функция: без DI и `new Date()`.
 */
import {
    isGoldenReportLike,
    registryDefault,
    resolveNumberParam,
    type ParamContext,
} from '@lib/sales-ai-analytics';
import type { AiAboutReliabilityDto } from '../dto/ai-about-reliability.dto';

/** Отчёт согласия на входе: нагрузка записи и момент формирования. */
export interface AiAboutGoldenSource {
    readonly payload: unknown;
    readonly generatedAt: string;
}

/** Секция надёжности; null — отчёта нет либо форма чужая. */
export function buildAboutReliability(
    source: AiAboutGoldenSource | null | undefined,
    registry: ParamContext,
): AiAboutReliabilityDto | null {
    if (!source || !isGoldenReportLike(source.payload)) return null;
    const report = source.payload;
    const kappaMin =
        resolveNumberParam('golden_kappa_min', registry) ??
        registryDefault('golden_kappa_min');

    return {
        promptVersion: report.promptVersion,
        pairs: report.pairs,
        withinQuota: report.budget.withinQuota,
        sigmaLlm: {
            value: report.sigmaLlm.value,
            source: report.sigmaLlm.source,
            measured: report.sigmaLlm.measured,
            n: report.sigmaLlm.n,
            minPairs: report.sigmaLlm.minPairs,
        },
        kappaMin,
        categories: report.categories.map(category => ({
            code: category.code,
            n: category.n,
            kappa: category.nominal.kappa,
            reliable:
                category.nominal.kappa === null
                    ? null
                    : category.nominal.kappa >= kappaMin,
        })),
        objectionsF1: report.objections.micro.f1,
        generatedAt: source.generatedAt,
    };
}
