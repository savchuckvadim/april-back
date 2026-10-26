import { LogAppStat, LogDomainStat, LogErrorPattern } from './log-query.types';

/** Ниже этого всплеск не считаем: пара ошибок — шум, а не событие. */
export const LOG_SPIKE_MIN_ERRORS = 10;
/** Во сколько раз больше предыдущего окна — уже всплеск. */
export const LOG_SPIKE_RATIO = 2;
/** Сколько частых ошибок и порталов называть в выводах. */
const TOP_IN_CONCLUSIONS = 3;
const SAMPLE_LENGTH = 140;

/** «24 ч», «7 дн.», «1 ч». */
export function formatLogWindow(hours: number): string {
    if (hours % 24 === 0 && hours >= 48) return `${hours / 24} дн.`;
    return `${hours} ч`;
}

const shorten = (text: string): string => {
    const line = text.replace(/\s+/g, ' ').trim();
    return line.length > SAMPLE_LENGTH
        ? `${line.slice(0, SAMPLE_LENGTH).trimEnd()}…`
        : line;
};

/** «1 раз», «2 раза», «5 раз», «12 раз», «22 раза». */
export function formatTimes(count: number): string {
    const last = count % 10;
    const lastTwo = count % 100;
    const few = last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14);
    return `${count} ${few ? 'раза' : 'раз'}`;
}

/** Шаблон ошибки как в SQL сводки: начало текста, числа — «#». */
const patternKey = (sample: string): string =>
    sample.slice(0, 160).replace(/[0-9]+/g, '#');

interface SharedErrorGroup {
    key: string;
    sample: string;
    apps: string[];
    count: number;
}

/**
 * Одна и та же ошибка в нескольких приложениях — почти всегда общая
 * причина (локальный 26.10.2026: «Redis ECONNREFUSED» в трёх приложениях),
 * а не три разные поломки.
 */
function sharedErrorGroups(
    patterns: readonly LogErrorPattern[],
): SharedErrorGroup[] {
    const groups = new Map<string, SharedErrorGroup>();
    for (const pattern of patterns) {
        const key = patternKey(pattern.sample);
        const group = groups.get(key) ?? {
            key,
            sample: pattern.sample,
            apps: [],
            count: 0,
        };
        if (!group.apps.includes(pattern.app)) group.apps.push(pattern.app);
        group.count += pattern.count;
        groups.set(key, group);
    }
    return [...groups.values()]
        .filter(group => group.apps.length > 1)
        .sort((left, right) => right.count - left.count);
}

const ratioText = (current: number, previous: number): string =>
    (current / previous).toFixed(1).replace('.', ',');

/**
 * Выводы по журналам словами: что произошло и куда смотреть. Правила, без
 * ИИ: общий счёт, всплески и новые ошибки по приложениям, приложения,
 * которые перестали писать журнал, частые ошибки и порталы с ошибками.
 */
export function buildLogConclusions(input: {
    hours: number;
    apps: readonly LogAppStat[];
    topErrors: readonly LogErrorPattern[];
    domains: readonly LogDomainStat[];
}): string[] {
    const window = formatLogWindow(input.hours);
    const conclusions: string[] = [];
    const errors = input.apps.reduce((sum, app) => sum + app.errors, 0);
    const warnings = input.apps.reduce((sum, app) => sum + app.warnings, 0);
    const active = input.apps.filter(app => app.total > 0).length;

    conclusions.push(
        errors || warnings
            ? `За ${window}: ошибок ${errors}, предупреждений ${warnings}, приложений с записями ${active}.`
            : `За ${window} ошибок и предупреждений нет.`,
    );

    for (const app of input.apps) {
        if (app.errors < LOG_SPIKE_MIN_ERRORS) continue;
        if (app.prevErrors === 0) {
            conclusions.push(
                `«${app.app}»: ${app.errors} ошибок, а за предыдущие ${window} не было ни одной.`,
            );
        } else if (app.errors >= app.prevErrors * LOG_SPIKE_RATIO) {
            conclusions.push(
                `«${app.app}»: ошибок ${app.errors} — в ${ratioText(app.errors, app.prevErrors)} раза больше, чем за предыдущие ${window}.`,
            );
        }
    }

    for (const app of input.apps) {
        if (app.total === 0 && app.prevTotal > 0) {
            conclusions.push(
                `«${app.app}» за последние ${window} не написал в журнал ни строки, а раньше писал — проверьте, работает ли.`,
            );
        }
    }

    const shared = sharedErrorGroups(input.topErrors);
    const sharedKeys = new Set(shared.map(group => group.key));
    for (const group of shared.slice(0, TOP_IN_CONCLUSIONS)) {
        conclusions.push(
            `Одна и та же ошибка в ${group.apps.length} приложениях (${group.apps.join(', ')}) — ${formatTimes(group.count)}: ` +
                `«${shorten(group.sample)}». Похоже на общую причину: сеть, Redis, база или Битрикс.`,
        );
    }

    const ownPatterns = input.topErrors.filter(
        pattern => !sharedKeys.has(patternKey(pattern.sample)),
    );
    for (const pattern of ownPatterns.slice(0, TOP_IN_CONCLUSIONS)) {
        const domains = pattern.domains.length
            ? `; порталы: ${pattern.domains.join(', ')}`
            : '';
        conclusions.push(
            `Чаще всего в «${pattern.app}» (${formatTimes(pattern.count)}${domains}): «${shorten(pattern.sample)}».`,
        );
    }

    const hotDomains = input.domains
        .filter(domain => domain.errors > 0)
        .slice(0, TOP_IN_CONCLUSIONS);
    if (hotDomains.length) {
        conclusions.push(
            `Больше всего ошибок у порталов: ${hotDomains
                .map(domain => `${domain.domain} (${domain.errors})`)
                .join(', ')}.`,
        );
    }

    return conclusions;
}
