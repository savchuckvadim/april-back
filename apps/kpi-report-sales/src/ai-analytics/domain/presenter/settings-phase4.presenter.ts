/**
 * Поля ответа `settings/get` Фазы 4: гипотеза «качество → объём» в том
 * виде, в каком её сохраняет витрина, и согласие на пул порталов.
 * Чистые функции.
 */
import type { AiQualityHypothesis } from '@lib/sales-ai-analytics/settings/ai-settings.types';
import type { AiHypothesisDto } from '../../dto/ai-settings-scoring.dto';
import type { AiSettingsPoolStateDto } from '../../dto/ai-settings-pool.dto';
import type { AiAnalyticsPortalSettings } from '../loaders/settings.loader';

/** Поля ответа настроек Фазы 4. */
export interface AiSettingsPhase4Fields {
    /** Гипотеза портала; null — не задана. */
    hypothesis: AiHypothesisDto | null;
    pool: AiSettingsPoolStateDto;
}

/** Гипотеза настроек → DTO: пустые дата и автор не отдаются. */
export function toHypothesisDto(
    hypothesis: AiQualityHypothesis | null,
): AiHypothesisDto | null {
    if (hypothesis === null) return null;

    return {
        pairs: hypothesis.pairs.map(pair => ({ s: pair.s, n: pair.n })),
        ...(hypothesis.since.trim() === '' ? {} : { since: hypothesis.since }),
        ...(hypothesis.author.trim() === ''
            ? {}
            : { author: hypothesis.author }),
    };
}

/** Гипотеза и согласие на пул для ответа `settings/get`. */
export function settingsPhase4FieldsOf(
    settings: Pick<
        AiAnalyticsPortalSettings,
        'hypothesis' | 'poolOptIn' | 'poolConsentAt'
    >,
): AiSettingsPhase4Fields {
    return {
        hypothesis: toHypothesisDto(settings.hypothesis),
        pool: {
            optIn: settings.poolOptIn,
            consentAt: settings.poolConsentAt,
        },
    };
}
