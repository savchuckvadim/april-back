/**
 * Факт-чек AI-резюме (план §8, версия 2): проверка каждого буллета.
 *
 * Правила: каждое число буллета обязано быть в пакете фактов (значение,
 * прошлый период, изменение, норма, план, объём или число готовой фразы),
 * каждая ссылка `factRefs` — существовать, буллет не длиннее 30 слов, без
 * стоп-слов («значимо» — до Фазы 3) и без каузальных формулировок; группа
 * буллета известна; ссылка `link` совпадает со ссылкой факта пакета;
 * менеджер буллета фокуса принадлежит одному из его фактов. Без ссылок на
 * факты проходят только служебные пункты шаблона — «сравнения с прошлым
 * периодом нет» и «действий не требуется»: придуманное действие без
 * факта за ним не проходит.
 *
 * Числа сверяются нормализованными ключами `model/brief-numbers.ts` —
 * той же функцией, которой presenter печатает числа в пакет. Разбор
 * ответа модели по строгой схеме — в `brief-payload.ts`.
 */
import {
    AI_BRIEF_BULLET_GROUPS,
    AI_BRIEF_CAUSAL,
    AI_BRIEF_DROP_REASONS,
    AI_BRIEF_FORBIDDEN,
    AI_BRIEF_LIMITS,
    type AiBriefBullet,
    type AiBriefBulletGroup,
    type AiBriefDropReason,
    type AiBriefFact,
    type AiBriefFactUnit,
    type AiEvidencePack,
} from '../contracts/ai-brief.contract';
import {
    AI_BRIEF_COMPARE_TEXTS,
    AI_BRIEF_NO_ACTIONS_TEXT,
} from '../contracts/ai-brief.rules';
import {
    extractNumbers,
    factValueKeys,
    normalizeBriefText,
    numberKey,
    numberKeys,
} from './brief-numbers';

/** Отбракованный буллет: текст, код причины и уточнение. */
export interface BriefDroppedBullet {
    text: string;
    reason: AiBriefDropReason;
    /** Что именно не сошлось: число, код факта, стоп-слово. */
    detail?: string;
}

/** Итог факт-чека: что осталось, что выброшено и доля прошедших. */
export interface BriefFactCheckResult {
    kept: AiBriefBullet[];
    dropped: BriefDroppedBullet[];
    /** Доля прошедших буллетов, %; при пустом входе 0. */
    passRatePct: number;
}

/** Группа буллета из перечня контракта. */
export function isBulletGroup(value: unknown): value is AiBriefBulletGroup {
    return (
        typeof value === 'string' &&
        (AI_BRIEF_BULLET_GROUPS as readonly string[]).includes(value)
    );
}

/** Слов в тексте (лимит буллета — 30). */
export function wordCount(text: string): number {
    const trimmed = text.trim();

    return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

/** Стоп-слово текста в нижнем регистре; null — чисто. */
export function findForbidden(text: string): string | null {
    const normalized = normalizeBriefText(text);

    return AI_BRIEF_FORBIDDEN.find(word => normalized.includes(word)) ?? null;
}

/** Каузальный оборот текста; null — утверждений о причинах нет. */
export function findCausal(text: string): string | null {
    const normalized = normalizeBriefText(text);

    return AI_BRIEF_CAUSAL.find(word => normalized.includes(word)) ?? null;
}

/** Служебные пункты шаблона по группам — единственные без ссылок на факты. */
const SERVICE_TEXTS: Readonly<Record<AiBriefBulletGroup, ReadonlySet<string>>> =
    {
        change: new Set(
            Object.values(AI_BRIEF_COMPARE_TEXTS).map(normalizeBriefText),
        ),
        focus: new Set<string>(),
        action: new Set([normalizeBriefText(AI_BRIEF_NO_ACTIONS_TEXT)]),
    };

/** Служебный пункт своей группы: «сравнения нет», «действий не требуется». */
export function isServiceBullet(bullet: AiBriefBullet): boolean {
    return (
        isBulletGroup(bullet.group) &&
        SERVICE_TEXTS[bullet.group].has(normalizeBriefText(bullet.text))
    );
}

/**
 * Ключи числа факта с единицей и знаком: «отстаём на 6 %» пишется без
 * минуса, поэтому модуль значения тоже считается числом пакета.
 */
function unitKeys(
    value: number | null | undefined,
    unit: AiBriefFactUnit,
): string[] {
    if (value === null || value === undefined) return [];

    return [...factValueKeys(value, unit), ...factValueKeys(-value, unit)];
}

/**
 * Допустимые числовые ключи одного факта: значение, прошлый период,
 * изменение (и в процентах), норма, план, объём n и числа готовой фразы.
 */
export function factNumberKeys(fact: AiBriefFact): string[] {
    const keys: string[] = [
        ...unitKeys(fact.value, fact.unit),
        ...unitKeys(fact.prev, fact.unit),
        ...unitKeys(fact.delta, fact.unit),
        ...unitKeys(fact.norm, fact.unit),
        ...unitKeys(fact.plan, fact.unit),
    ];
    if (typeof fact.n === 'number') {
        keys.push(...numberKeys(fact.n));
    }
    if (typeof fact.deltaPct === 'number') {
        keys.push(...numberKeys(fact.deltaPct), ...numberKeys(-fact.deltaPct));
    }
    for (const value of extractNumbers(fact.text)) {
        keys.push(...numberKeys(value));
    }

    return keys;
}

/** Все числа, которые модели разрешено называть в этом резюме. */
export function packNumberKeys(pack: AiEvidencePack): Set<string> {
    const keys = new Set<string>();
    for (const fact of pack.facts) {
        for (const key of factNumberKeys(fact)) {
            keys.add(key);
        }
    }

    return keys;
}

/**
 * Первое число текста, которого нет среди допустимых (ключом для лога);
 * null — все числа текста из пакета. Им же проверяется заголовок модели.
 */
export function findAlienNumber(
    text: string,
    allowed: ReadonlySet<string>,
): string | null {
    const alien = extractNumbers(text).find(
        value => !allowed.has(numberKey(value)),
    );

    return alien === undefined ? null : numberKey(alien);
}

/** Ссылки фактов пакета — единственные, которые вправе нести буллет. */
export function packLinks(pack: AiEvidencePack): Set<string> {
    const links = new Set<string>();
    for (const fact of pack.facts) {
        if (typeof fact.link === 'string' && fact.link !== '') {
            links.add(fact.link);
        }
    }

    return links;
}

/** Всё, с чем сверяется буллет: коды, числа, ссылки и менеджеры фактов. */
interface CheckContext {
    codes: ReadonlySet<string>;
    allowed: ReadonlySet<string>;
    links: ReadonlySet<string>;
    managerOf: ReadonlyMap<string, string | undefined>;
}

function contextOf(pack: AiEvidencePack): CheckContext {
    return {
        codes: new Set(pack.facts.map(fact => fact.code)),
        allowed: packNumberKeys(pack),
        links: packLinks(pack),
        managerOf: new Map(pack.facts.map(fact => [fact.code, fact.managerId])),
    };
}

const drop = (
    bullet: AiBriefBullet,
    reason: AiBriefDropReason,
    detail?: string,
): BriefDroppedBullet => ({
    text: bullet.text,
    reason,
    ...(detail === undefined ? {} : { detail }),
});

/** Первая причина, по которой буллет не проходит проверку; null — прошёл. */
function checkBullet(
    bullet: AiBriefBullet,
    ctx: CheckContext,
): BriefDroppedBullet | null {
    if (bullet.text.trim() === '') {
        return drop(bullet, AI_BRIEF_DROP_REASONS.empty);
    }
    if (wordCount(bullet.text) > AI_BRIEF_LIMITS.bulletWords) {
        return drop(bullet, AI_BRIEF_DROP_REASONS.tooManyWords);
    }
    if (!isBulletGroup(bullet.group)) {
        return drop(bullet, AI_BRIEF_DROP_REASONS.groupUnknown);
    }
    if (bullet.factRefs.length === 0 && !isServiceBullet(bullet)) {
        return drop(bullet, AI_BRIEF_DROP_REASONS.noFactRefs);
    }
    const unknownRef = bullet.factRefs.find(ref => !ctx.codes.has(ref));
    if (unknownRef !== undefined) {
        return drop(bullet, AI_BRIEF_DROP_REASONS.unknownFactRef, unknownRef);
    }
    const forbidden = findForbidden(bullet.text);
    if (forbidden !== null) {
        return drop(bullet, AI_BRIEF_DROP_REASONS.forbiddenWord, forbidden);
    }
    const causal = findCausal(bullet.text);
    if (causal !== null) {
        return drop(bullet, AI_BRIEF_DROP_REASONS.causal, causal);
    }
    if (
        typeof bullet.link === 'string' &&
        bullet.link !== '' &&
        !ctx.links.has(bullet.link)
    ) {
        return drop(bullet, AI_BRIEF_DROP_REASONS.unknownLink, bullet.link);
    }
    if (
        bullet.group === 'focus' &&
        bullet.managerId !== undefined &&
        !bullet.factRefs.some(
            ref => ctx.managerOf.get(ref) === bullet.managerId,
        )
    ) {
        return drop(
            bullet,
            AI_BRIEF_DROP_REASONS.managerNotInRefs,
            bullet.managerId,
        );
    }
    const alien = findAlienNumber(bullet.text, ctx.allowed);

    return alien === null
        ? null
        : drop(bullet, AI_BRIEF_DROP_REASONS.numberNotInPack, alien);
}

/**
 * Факт-чек буллетов: остаются только те, где каждое число есть в пакете,
 * каждая ссылка на факт существует и нет запрещённых формулировок.
 */
export function factCheckBullets(
    bullets: readonly AiBriefBullet[],
    pack: AiEvidencePack,
): BriefFactCheckResult {
    const ctx = contextOf(pack);
    const kept: AiBriefBullet[] = [];
    const dropped: BriefDroppedBullet[] = [];
    for (const bullet of bullets) {
        const failure = checkBullet(bullet, ctx);
        if (failure === null) {
            kept.push(bullet);
        } else {
            dropped.push(failure);
        }
    }
    const total = bullets.length;

    return {
        kept,
        dropped,
        passRatePct:
            total === 0 ? 0 : Math.round((kept.length / total) * 1000) / 10,
    };
}
