/**
 * Факт-чек AI-резюме (план §8): разбор ответа модели по строгой схеме и
 * проверка каждого буллета.
 *
 * Правила: каждое число буллета обязано быть в пакете фактов, каждая
 * ссылка `factRefs` — существовать, буллет не длиннее 30 слов, без
 * стоп-слов («значимо» — до Фазы 3) и без каузальных формулировок.
 * Числа сверяются нормализованными ключами `model/brief-numbers.ts` —
 * той же функцией, которой presenter печатает числа в пакет.
 */
import {
    AI_BRIEF_CAUSAL,
    AI_BRIEF_DROP_REASONS,
    AI_BRIEF_FORBIDDEN,
    AI_BRIEF_LIMITS,
    AI_BRIEF_TONES,
    type AiBriefBullet,
    type AiBriefDropReason,
    type AiBriefFact,
    type AiBriefPayload,
    type AiBriefTone,
    type AiEvidencePack,
} from '../contracts/ai-brief.contract';
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

/** Итог разбора ответа модели по строгой схеме. */
export interface BriefPayloadValidation {
    /** null — ответ негоден целиком, нужен шаблон. */
    payload: AiBriefPayload | null;
    /** Коды нарушений схемы и лимитов. */
    errors: string[];
    dropped: BriefDroppedBullet[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isTone = (value: unknown): value is AiBriefTone =>
    typeof value === 'string' &&
    (AI_BRIEF_TONES as readonly string[]).includes(value);

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

/** Допустимые числовые ключи одного факта: значение, n и числа фразы. */
export function factNumberKeys(fact: AiBriefFact): string[] {
    const keys: string[] = [];
    if (fact.value !== null) {
        keys.push(...factValueKeys(fact.value, fact.unit));
    }
    if (typeof fact.n === 'number') {
        keys.push(...numberKeys(fact.n));
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

/** Первая причина, по которой буллет не проходит проверку; null — прошёл. */
function checkBullet(
    bullet: AiBriefBullet,
    codes: ReadonlySet<string>,
    allowed: ReadonlySet<string>,
): BriefDroppedBullet | null {
    if (bullet.text.trim() === '') {
        return { text: bullet.text, reason: AI_BRIEF_DROP_REASONS.empty };
    }
    if (wordCount(bullet.text) > AI_BRIEF_LIMITS.bulletWords) {
        return {
            text: bullet.text,
            reason: AI_BRIEF_DROP_REASONS.tooManyWords,
        };
    }
    if (bullet.factRefs.length === 0) {
        return { text: bullet.text, reason: AI_BRIEF_DROP_REASONS.noFactRefs };
    }
    const unknownRef = bullet.factRefs.find(ref => !codes.has(ref));
    if (unknownRef !== undefined) {
        return {
            text: bullet.text,
            reason: AI_BRIEF_DROP_REASONS.unknownFactRef,
            detail: unknownRef,
        };
    }
    const forbidden = findForbidden(bullet.text);
    if (forbidden !== null) {
        return {
            text: bullet.text,
            reason: AI_BRIEF_DROP_REASONS.forbiddenWord,
            detail: forbidden,
        };
    }
    const causal = findCausal(bullet.text);
    if (causal !== null) {
        return {
            text: bullet.text,
            reason: AI_BRIEF_DROP_REASONS.causal,
            detail: causal,
        };
    }
    const alien = extractNumbers(bullet.text).find(
        value => !allowed.has(numberKey(value)),
    );

    return alien === undefined
        ? null
        : {
              text: bullet.text,
              reason: AI_BRIEF_DROP_REASONS.numberNotInPack,
              detail: numberKey(alien),
          };
}

/**
 * Факт-чек буллетов: остаются только те, где каждое число есть в пакете,
 * каждая ссылка на факт существует и нет запрещённых формулировок.
 */
export function factCheckBullets(
    bullets: readonly AiBriefBullet[],
    pack: AiEvidencePack,
): BriefFactCheckResult {
    const allowed = packNumberKeys(pack);
    const codes = new Set(pack.facts.map(fact => fact.code));
    const kept: AiBriefBullet[] = [];
    const dropped: BriefDroppedBullet[] = [];
    for (const bullet of bullets) {
        const failure = checkBullet(bullet, codes, allowed);
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

/** Буллет ответа модели в типизированном виде; null — форма битая. */
function parseBullet(raw: unknown): AiBriefBullet | null {
    if (!isRecord(raw) || typeof raw.text !== 'string') {
        return null;
    }
    const refs = Array.isArray(raw.factRefs)
        ? raw.factRefs.filter(
              (ref): ref is string => typeof ref === 'string' && ref !== '',
          )
        : [];

    return {
        text: raw.text,
        factRefs: refs,
        ...(typeof raw.managerId === 'string'
            ? { managerId: raw.managerId }
            : {}),
        ...(typeof raw.callType === 'string' ? { callType: raw.callType } : {}),
    };
}

/** Заголовок: непустой, в лимите символов и без запрещённых оборотов. */
function headlineError(raw: unknown): string | null {
    if (typeof raw !== 'string' || raw.trim() === '') {
        return 'headline-missing';
    }
    if (raw.length > AI_BRIEF_LIMITS.headline) {
        return 'headline-too-long';
    }
    if (findForbidden(raw) !== null) {
        return 'headline-forbidden-word';
    }

    return findCausal(raw) === null ? null : 'headline-causal-claim';
}

/**
 * Разбор ответа модели по строгой схеме: заголовок ≤ 140 символов,
 * ≤ 5 буллетов, буллет ≤ 30 слов. Лишние и битые буллеты отбрасываются,
 * негодный заголовок делает ответ непригодным целиком (тогда — шаблон).
 */
export function validateBriefPayload(
    raw: unknown,
    pack: AiEvidencePack,
): BriefPayloadValidation {
    const errors: string[] = [];
    const dropped: BriefDroppedBullet[] = [];
    if (!isRecord(raw)) {
        return { payload: null, errors: ['payload-not-object'], dropped };
    }
    if (pack.facts.length === 0) {
        // Пустой пакет: сверять числа не с чем — резюме собирает шаблон.
        return { payload: null, errors: ['empty-pack'], dropped };
    }
    const headlineIssue = headlineError(raw.headline);
    if (headlineIssue !== null) {
        return { payload: null, errors: [headlineIssue], dropped };
    }
    const tone: AiBriefTone = isTone(raw.tone) ? raw.tone : 'calm';
    if (!isTone(raw.tone)) {
        errors.push('tone-unknown');
    }
    const rawBullets = Array.isArray(raw.bullets) ? raw.bullets : [];
    if (!Array.isArray(raw.bullets)) {
        errors.push('bullets-not-array');
    }
    const bullets: AiBriefBullet[] = [];
    for (const item of rawBullets) {
        const bullet = parseBullet(item);
        if (bullet === null) {
            dropped.push({ text: '', reason: AI_BRIEF_DROP_REASONS.malformed });
            continue;
        }
        if (bullets.length >= AI_BRIEF_LIMITS.bullets) {
            dropped.push({
                text: bullet.text,
                reason: AI_BRIEF_DROP_REASONS.overLimit,
            });
            continue;
        }
        if (wordCount(bullet.text) > AI_BRIEF_LIMITS.bulletWords) {
            dropped.push({
                text: bullet.text,
                reason: AI_BRIEF_DROP_REASONS.tooManyWords,
            });
            continue;
        }
        bullets.push(bullet);
    }
    if (bullets.length === 0) {
        errors.push('bullets-empty');

        return { payload: null, errors, dropped };
    }
    const headline = String(raw.headline);

    return { payload: { headline, bullets, tone }, errors, dropped };
}
