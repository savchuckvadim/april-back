import { DealAuditRunResult } from '../types/deal-audit.types';

/** Сколько предупреждений портала показывать в сообщении. */
const MAX_WARNINGS = 3;
/** Длинные тексты ошибок режем: сообщение в Telegram должно читаться. */
const MAX_TEXT = 200;

/** Режим портала, как его видит владелец в настройках. */
export interface DealAuditPortalMode {
    /** Настройка «Только считать» (а не итог записи из результата). */
    readonly countOnly: boolean;
    readonly hasRecipients: boolean;
}

/** Чем закончился прогон одного портала в тике крона. */
export type DealAuditDomainOutcome =
    | ({
          readonly kind: 'ran';
          readonly domain: string;
          readonly result: DealAuditRunResult;
      } & DealAuditPortalMode)
    | { readonly kind: 'waiting'; readonly domain: string }
    | {
          readonly kind: 'failed';
          readonly domain: string;
          readonly error: string;
      };

/** Портал с включённым аудитом — строка отчёта при старте. */
export interface DealAuditRosterEntry extends DealAuditPortalMode {
    readonly domain: string;
    readonly intervalMinutes: number;
}

/**
 * Слать ли итог тика в Telegram. Тик каждые 30 минут, а портал
 * аудируется раз в интервал: тик, где все порталы ждут интервала, —
 * шум, его хватает в обычном логе.
 */
export const shouldNotifyDealAuditTick = (
    outcomes: readonly DealAuditDomainOutcome[],
): boolean => outcomes.some(outcome => outcome.kind !== 'waiting');

/** Короткий итог тика: по строке на портал + причины тишины. */
export const formatDealAuditTick = (
    outcomes: readonly DealAuditDomainOutcome[],
): string => {
    const lines = ['🧹 Аудит сделок — прогон'];
    let waiting = 0;
    for (const outcome of outcomes) {
        if (outcome.kind === 'ran') lines.push(...formatRan(outcome));
        if (outcome.kind === 'failed') {
            lines.push(`❌ ${outcome.domain}: ошибка — ${clip(outcome.error)}`);
        }
        if (outcome.kind === 'waiting') waiting += 1;
    }
    if (waiting) lines.push(`⏳ ждут своего интервала: ${waiting}`);
    return lines.join('\n');
};

/** Что крон увидит на старте: где аудит включён и в каком режиме. */
export const formatDealAuditRoster = (
    entries: readonly DealAuditRosterEntry[],
): string => {
    if (!entries.length) {
        return (
            '🧹 Аудит сделок не включён ни на одном портале — крон ' +
            'работает вхолостую (настройка «Аудит сделок: включён»)'
        );
    }
    return [
        `🧹 Аудит сделок включён на порталах: ${entries.length}`,
        ...entries.map(
            entry =>
                `• ${entry.domain} — ${describeMode(entry)}, ` +
                `раз в ${formatInterval(entry.intervalMinutes)}`,
        ),
    ].join('\n');
};

const formatRan = (
    outcome: Extract<DealAuditDomainOutcome, { kind: 'ran' }>,
): string[] => {
    const { result } = outcome;
    const lines = [
        `${outcome.countOnly ? '⏸' : '✅'} ${outcome.domain}: ` +
            `сделок ${result.scanned}, забытых ${result.flagged}, ` +
            `размечено ${result.written}, сводок ${result.digestSent}`,
    ];
    if (outcome.countOnly || !outcome.hasRecipients) {
        lines.push(`   ${describeMode(outcome)}`);
    }
    for (const warning of result.warnings.slice(0, MAX_WARNINGS)) {
        lines.push(`   ⚠ ${clip(warning)}`);
    }
    const hidden = result.warnings.length - MAX_WARNINGS;
    if (hidden > 0) lines.push(`   … и ещё предупреждений: ${hidden}`);
    return lines;
};

const describeMode = (mode: DealAuditPortalMode): string => {
    if (mode.countOnly) {
        return 'только считать — ничего не пишет и не рассылает';
    }
    if (!mode.hasRecipients) return 'получатели сводки не заданы';
    return 'сводки рассылаются';
};

const formatInterval = (minutes: number): string =>
    minutes % 60 === 0 ? `${minutes / 60} ч` : `${minutes} мин`;

const clip = (text: string): string =>
    text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
