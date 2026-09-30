/**
 * Блок `pool` сохранения настроек (Фаза 4): согласие портала на
 * обезличенный пул порталов. Пишется отдельными ключами app-settings
 * (`ai_analytics_pool_opt_in` / `ai_analytics_pool_consent_at`) через
 * `AiAnalyticsSettingsStore.savePool`, а не JSON-блоками настроек, поэтому
 * в сравнение «рвёт ли правка ряд» не входит: согласие не меняет формул,
 * пул подмешивается только через оценки следующего пересчёта.
 *
 * Дата согласия — день портала при включении и пустая строка при
 * выключении: пул берёт портал только с датированным согласием. Повторное
 * «включить» при уже данном согласии дату не сдвигает.
 *
 * Выдача и отзыв согласия попадают в аудит сохранения отдельным изменением
 * (`poolConsentChangeOf`): кто и когда включил портал в пул или вывел из
 * него — видно по записи аудита, а не только по логу.
 */
import type { AiSettingsChange } from '@lib/sales-ai-analytics/settings/ai-settings.series';

/** Код изменения согласия на пул в аудите настроек. */
export const AI_POOL_CONSENT_AUDIT_CODE = 'ai_analytics_pool_consent' as const;

/** Значение согласия для записи в настройки портала. */
export interface AiPoolConsentValue {
    readonly optIn: boolean;
    /** 'YYYY-MM-DD' при согласии; '' — согласия нет. */
    readonly consentAt: string;
}

/** Блок запроса: включить или выключить участие в пуле. */
export interface AiPoolConsentClaim {
    readonly optIn: boolean;
}

/** Кто умеет записать согласие (стор настроек портала). */
export interface AiPoolConsentWriter {
    savePool(domain: string, value: AiPoolConsentValue): Promise<unknown>;
}

/** Текущее согласие портала (из настроек). */
export interface AiPoolConsentCurrent {
    readonly optIn: boolean;
    /** Дата согласия; null — не задана. */
    readonly consentAt: string | null;
}

/** 'YYYY-MM-DD' из даты или ISO-строки; иначе null. */
const dayOf = (value: string | null | undefined): string | null => {
    const day = value?.trim().slice(0, 10) ?? '';

    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
};

/** Значение согласия по блоку запроса; блока нет — null (не трогаем). */
export function poolConsentOf(
    pool: AiPoolConsentClaim | undefined,
    today: string,
    current?: AiPoolConsentCurrent,
): AiPoolConsentValue | null {
    if (pool === undefined) return null;
    if (!pool.optIn) return { optIn: false, consentAt: '' };
    const since = current?.optIn === true ? dayOf(current.consentAt) : null;

    return { optIn: true, consentAt: since ?? today };
}

/**
 * Изменение согласия для аудита: было/стало (`optIn`, `consentAt`), ряд не
 * рвёт. Блока не было или значение не изменилось — null.
 */
export function poolConsentChangeOf(
    current: AiPoolConsentCurrent,
    value: AiPoolConsentValue | null,
): AiSettingsChange | null {
    if (value === null) return null;
    const before = JSON.stringify({
        optIn: current.optIn,
        consentAt: dayOf(current.consentAt) ?? '',
    });
    const after = JSON.stringify({
        optIn: value.optIn,
        consentAt: value.consentAt,
    });

    return before === after
        ? null
        : {
              code: AI_POOL_CONSENT_AUDIT_CODE,
              before,
              after,
              breaksSeries: false,
          };
}

/**
 * Записать согласие, если блок пришёл. Возвращает записанное значение
 * (null — блока не было, запись не делалась).
 */
export async function savePoolConsent(
    writer: AiPoolConsentWriter,
    domain: string,
    pool: AiPoolConsentClaim | undefined,
    today: string,
    current?: AiPoolConsentCurrent,
): Promise<AiPoolConsentValue | null> {
    const value = poolConsentOf(pool, today, current);
    if (value === null) return null;
    await writer.savePool(domain, value);

    return value;
}
