/**
 * Правила планировщика push-контура в наступивший локальный слот портала:
 * ставить ли джобу рассылки, а если нет — стоит ли предупредить в логе.
 *
 * Предупреждение нужно, когда рассылка на портале частично настроена, но
 * не уйдёт: адресаты сводного дайджеста заданы, а AI-аналитика выключена;
 * личный дайджест включён без AI-аналитики или выключен при включённой.
 * Раньше такие пропуски были молчаливыми, и «дайджест не приходит»
 * нельзя было понять по логам (расследование 30.09.2026). Портал, где
 * рассылка не настроена вовсе, пропускается молча.
 *
 * Чистые функции: без DI, Bitrix и времени.
 */
import type { AiAnalyticsPushKind } from '../constants/ai-analytics.const';
import type { AiAnalyticsPortalSettings } from '../domain/loaders/settings.loader';

/** Флаги портала, от которых зависит постановка рассылки. */
export type PushSlotSettings = Pick<
    AiAnalyticsPortalSettings,
    'enabled' | 'digestEnabled' | 'digestAllUserIds' | 'ropUserIds'
>;

/** Пропуск слота: текст предупреждения или null — пропуск штатный. */
export interface PushSlotSkip {
    warning: string | null;
}

const quiet: PushSlotSkip = { warning: null };

const warn = (warning: string): PushSlotSkip => ({ warning });

/** Сводный дайджест: нужны AI-аналитика и непустой список адресатов. */
function digestAllSkip(
    domain: string,
    settings: PushSlotSettings,
): PushSlotSkip | null {
    if (settings.digestAllUserIds.length === 0) return quiet;
    if (!settings.enabled) {
        return warn(
            `Сводный дайджест ${domain}: адресаты заданы ` +
                '(ai_analytics_digest_all_user_ids), но AI-аналитика ' +
                'выключена (ai_analytics_enabled) — джоба не ставится',
        );
    }
    return null;
}

/** Личный дайджест: нужны AI-аналитика и ai_analytics_digest_enabled. */
function digestSkip(
    domain: string,
    settings: PushSlotSettings,
): PushSlotSkip | null {
    if (!settings.enabled) {
        return settings.digestEnabled
            ? warn(
                  `Личный дайджест ${domain}: включён ` +
                      '(ai_analytics_digest_enabled), но AI-аналитика ' +
                      'выключена (ai_analytics_enabled) — джоба не ставится',
              )
            : quiet;
    }
    if (!settings.digestEnabled) {
        return warn(
            `Личный дайджест ${domain}: выключен ` +
                '(ai_analytics_digest_enabled) при включённой AI-аналитике — ' +
                'джоба не ставится',
        );
    }
    return null;
}

/** Повестка: нужны AI-аналитика и заданные РОПы. */
function agendaSkip(
    domain: string,
    settings: PushSlotSettings,
): PushSlotSkip | null {
    if (!settings.enabled) return quiet;
    if (settings.ropUserIds.length === 0) {
        return warn(
            `Повестка ${domain}: AI-аналитика включена, но РОПы не заданы — ` +
                'джоба не ставится',
        );
    }
    return null;
}

/**
 * Решение в наступивший слот: null — ставить джобу; иначе пропуск с
 * предупреждением для лога (или без него, если рассылка не настроена).
 */
export function pushSlotSkip(
    kind: AiAnalyticsPushKind,
    domain: string,
    settings: PushSlotSettings,
): PushSlotSkip | null {
    switch (kind) {
        case 'digest_all':
            return digestAllSkip(domain, settings);
        case 'digest':
            return digestSkip(domain, settings);
        case 'agenda':
            return agendaSkip(domain, settings);
    }
}
