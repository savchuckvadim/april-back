/**
 * Фикстуры прогноза «от презентаций» (метод presentations-v2): подбор
 * портала и вход менеджера с известными числами — q = 0,03, сдвиг по
 * умолчанию (ρ = 0,5, K = 6), 20 презентаций в месяц.
 */
import { lagKernel, type PresentationFlowFit } from '@lib/sales-ai-analytics';
import type {
    ForecastFlowManagerInput,
    PortalFlow,
} from '../../domain/assembler/forecast-flow.types';

/** Подбор портала: сдвиг по умолчанию, доля 0,03. */
export function portalFlowFixture(
    overrides: Partial<PresentationFlowFit> = {},
): PortalFlow {
    return {
        fit: {
            status: 'default-lag',
            reason: 'lag-not-identified',
            entry: 'presentation-uniq',
            q: 0.03,
            rho: 0.5,
            kernel: lagKernel(0.5, 6),
            exposure: 'lagged',
            weights: [],
            fitMonths: 12,
            sales: 86.4,
            presentations: 2880,
            deviance: 0,
            ...overrides,
        },
        keys: [],
        qKappa: 300,
    };
}

/** Вход менеджера: 20 презентаций в месяц, полмесяца — 10, доля 0,03. */
export function managerFlowFixture(
    overrides: Partial<ForecastFlowManagerInput> = {},
): ForecastFlowManagerInput {
    return {
        source: 'presentations',
        presentationsDone: 10,
        presentationsRate: 1,
        pastPresentations: [20, 20, 20, 20, 20, 20],
        salesPerPresentation: 0.03,
        ownShare: 0.5,
        salesMean: 0.6,
        ...overrides,
    };
}
