/**
 * Группы шаблонного резюме версии 2 «что изменилось и что делать»:
 * изменения к прошлому периоду, фокус на менеджерах из «Внимания» и
 * заголовок. Действия недели — в `brief-actions.ts` (они общие для
 * шаблона и резюме нейросети) и реэкспортируются отсюда.
 *
 * Все числа берутся из фактов теми же функциями форматирования, поэтому
 * буллеты шаблона проходят факт-чек (`factCheckBullets`); фразы без чисел
 * (сравнения нет, действий не требуется) написаны словами без цифр.
 * Вынесено из `brief-template.ts` по лимиту 300 строк.
 */
import {
    AI_BRIEF_LIMITS,
    type AiBriefBullet,
    type AiBriefFact,
    type AiEvidencePack,
} from '../contracts/ai-brief.contract';
import {
    AI_BRIEF_ACTION_CODES,
    AI_BRIEF_COMPARE_TEXTS,
    AI_BRIEF_FOCUS_CODES,
    AI_BRIEF_HEADLINE_TEXTS,
} from '../contracts/ai-brief.rules';
import { bulletOf } from './brief-bullet.util';
import {
    changeWeight,
    describeChange,
    isCompared,
    strongestChange,
} from './brief-delta';
import { buildFactText } from './brief-pack';
import { formatRuDateRange } from './iso-week.util';

export { actionBullets } from './brief-actions';
export { limitWords } from './brief-bullet.util';

const FOCUS_CODES: ReadonlySet<string> = new Set(AI_BRIEF_FOCUS_CODES);

/** Коды фактов, которые служат действиям, а не «изменениям». */
const ACTION_ONLY_CODES: ReadonlySet<string> = new Set([
    AI_BRIEF_ACTION_CODES.alertsUnhandled,
    AI_BRIEF_ACTION_CODES.agenda,
    AI_BRIEF_ACTION_CODES.funnelGap,
]);

/** Факты группы «что изменилось»: не фокус, не действия, не качество данных. */
export function changeFacts(pack: AiEvidencePack): AiBriefFact[] {
    const facts = pack.facts.filter(
        fact =>
            fact.kind !== 'data-quality' &&
            !FOCUS_CODES.has(fact.code) &&
            !ACTION_ONLY_CODES.has(fact.code),
    );

    return facts
        .map((fact, index) => ({
            fact,
            index,
            weight: changeWeight(pack, fact),
        }))
        .sort((a, b) => b.weight - a.weight || a.index - b.index)
        .map(item => item.fact);
}

/**
 * Фраза факта без сравнения. Если у пакета сравнения нет, а факт всё же
 * несёт прошлое значение, печатается только подпись и число — чтобы
 * «было …» не спорило с фразой «сравнения нет».
 */
function plainText(fact: AiBriefFact): string {
    return fact.comparable ? buildFactText(fact) : fact.text;
}

/**
 * Изменения: сравнимые факты сильнее всего вперёд; при отсутствии
 * сравнения — одна фраза о причине первым пунктом, дальше факты без дельт.
 */
export function changeBullets(pack: AiEvidencePack): AiBriefBullet[] {
    const facts = changeFacts(pack);
    if (facts.length === 0) return [];
    const bullets: AiBriefBullet[] = [];
    const reason = pack.compare.reason;
    if (reason !== null) {
        bullets.push({
            text: AI_BRIEF_COMPARE_TEXTS[reason],
            group: 'change',
            factRefs: [],
        });
    }
    for (const fact of facts) {
        if (bullets.length >= AI_BRIEF_LIMITS.groups.change) break;
        bullets.push(
            isCompared(pack, fact)
                ? bulletOf(fact, 'change', describeChange(fact), fact.delta)
                : bulletOf(fact, 'change', plainText(fact)),
        );
    }

    return bullets;
}

/** Фокус: факты карточек «Внимания» по рангу, фраза факта как есть. */
export function focusBullets(pack: AiEvidencePack): AiBriefBullet[] {
    return pack.facts
        .filter(fact => FOCUS_CODES.has(fact.code))
        .slice(0, AI_BRIEF_LIMITS.groups.focus)
        .map(fact => bulletOf(fact, 'focus', fact.text));
}

/** Хвост заголовка, когда самого сильного изменения нет. */
function headlineTail(pack: AiEvidencePack): string {
    if (pack.facts.length === 0) return AI_BRIEF_HEADLINE_TEXTS.noData;
    if (pack.compare.reason !== null) return AI_BRIEF_HEADLINE_TEXTS.noCompare;

    return pack.facts.some(fact => isCompared(pack, fact))
        ? AI_BRIEF_HEADLINE_TEXTS.noChange
        : '';
}

/**
 * Заголовок шаблона: самое сильное изменение одной фразой; без него —
 * сводка за период словами («за 1–28 сентября 2026») с пометкой: данных
 * нет, сравнения с прошлым периодом нет либо показатели не изменились.
 */
export function templateHeadline(
    pack: AiEvidencePack,
    from: string,
    to: string,
): string {
    const strongest = strongestChange(pack);
    if (strongest !== null) {
        return describeChange(strongest).slice(0, AI_BRIEF_LIMITS.headline);
    }
    const tail = headlineTail(pack);
    const base = `${AI_BRIEF_HEADLINE_TEXTS.summary} ${formatRuDateRange(from, to)}`;

    return (tail === '' ? base : `${base}: ${tail}`).slice(
        0,
        AI_BRIEF_LIMITS.headline,
    );
}
