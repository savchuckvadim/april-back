/**
 * Шаблонное резюме без LLM и сборка резюме из ответа модели (план §8).
 *
 * Шаблон — штатная деградация: нет ключа VibeCode, исчерпана квота,
 * ответ не разобрался или после факт-чека осталось меньше двух буллетов.
 * Числа шаблона берутся из пакета фактов теми же функциями форматирования,
 * поэтому шаблонное резюме само проходит факт-чек.
 */
import {
    AI_BRIEF_LIMITS,
    AI_BRIEF_PROMPT_VERSION,
    AI_BRIEF_TEMPLATE_REASONS,
    type AiBriefBullet,
    type AiBriefFact,
    type AiBriefResult,
    type AiBriefTone,
    type AiEvidencePack,
} from '../contracts/ai-brief.contract';
import {
    factCheckBullets,
    validateBriefPayload,
    type BriefDroppedBullet,
} from './brief-factcheck';

/** Период и момент сборки резюме; время приходит параметром, не из часов. */
export interface BriefContext {
    /** Начало периода 'YYYY-MM-DD'. */
    from: string;
    /** Конец периода 'YYYY-MM-DD'. */
    to: string;
    /** Момент сборки в ISO. */
    generatedAt: string;
    /** Версия промпта; по умолчанию AI_BRIEF_PROMPT_VERSION. */
    promptVersion?: string;
}

/** Итог сборки резюме вместе с наблюдаемостью факт-чека. */
export interface BriefBuildOutcome {
    brief: AiBriefResult;
    /** Доля буллетов модели, прошедших факт-чек, %. */
    passRatePct: number;
    dropped: BriefDroppedBullet[];
    /** Коды нарушений схемы ответа. */
    errors: string[];
}

/** Обрезка текста до лимита слов (без «…» — фраза факта самодостаточна). */
export function limitWords(text: string, maxWords: number): string {
    const words = text.trim().split(/\s+/);

    return words.length <= maxWords
        ? text.trim()
        : words.slice(0, maxWords).join(' ');
}

/** Тон по составу пакета: алерты — тревожно, отклонения — внимание. */
export function toneForPack(pack: AiEvidencePack): AiBriefTone {
    if (pack.facts.some(fact => fact.kind === 'alert')) {
        return 'alarm';
    }

    return pack.facts.some(fact => fact.kind === 'deviation')
        ? 'attention'
        : 'calm';
}

/** Буллет шаблона из факта: фраза факта и ссылка на него. */
function bulletOf(fact: AiBriefFact): AiBriefBullet {
    return {
        text: limitWords(fact.text, AI_BRIEF_LIMITS.bulletWords),
        factRefs: [fact.code],
        ...(fact.managerId === undefined ? {} : { managerId: fact.managerId }),
        ...(fact.callType === undefined ? {} : { callType: fact.callType }),
    };
}

/** Заголовок шаблона: период и число фактов не смешиваются с числами буллетов. */
function templateHeadline(pack: AiEvidencePack, ctx: BriefContext): string {
    const headline =
        pack.facts.length === 0
            ? `Сводка отдела продаж за ${ctx.from} — ${ctx.to}: данных нет`
            : `Сводка отдела продаж за ${ctx.from} — ${ctx.to}`;

    return headline.slice(0, AI_BRIEF_LIMITS.headline);
}

/**
 * Шаблонное резюме: первые факты пакета в порядке приоритета, по одному
 * буллету на факт, без единого числа вне пакета.
 */
export function buildTemplateBrief(
    pack: AiEvidencePack,
    ctx: BriefContext,
    reason: string,
): AiBriefResult {
    return {
        headline: templateHeadline(pack, ctx),
        bullets: pack.facts.slice(0, AI_BRIEF_LIMITS.bullets).map(bulletOf),
        tone: toneForPack(pack),
        source: 'template',
        packHash: pack.hash,
        generatedAt: ctx.generatedAt,
        promptVersion: ctx.promptVersion ?? AI_BRIEF_PROMPT_VERSION,
        reason,
    };
}

/**
 * Резюме из ответа модели: строгая схема → факт-чек → шаблон, если после
 * проверки осталось меньше `AI_BRIEF_LIMITS.minBullets` буллетов.
 */
export function buildBriefFromLlm(
    raw: unknown,
    pack: AiEvidencePack,
    ctx: BriefContext,
): BriefBuildOutcome {
    const validation = validateBriefPayload(raw, pack);
    if (validation.payload === null) {
        return {
            brief: buildTemplateBrief(
                pack,
                ctx,
                AI_BRIEF_TEMPLATE_REASONS.invalidPayload,
            ),
            passRatePct: 0,
            dropped: validation.dropped,
            errors: validation.errors,
        };
    }
    const checked = factCheckBullets(validation.payload.bullets, pack);
    const dropped = [...validation.dropped, ...checked.dropped];
    if (checked.kept.length < AI_BRIEF_LIMITS.minBullets) {
        return {
            brief: buildTemplateBrief(
                pack,
                ctx,
                AI_BRIEF_TEMPLATE_REASONS.factcheckFailed,
            ),
            passRatePct: checked.passRatePct,
            dropped,
            errors: validation.errors,
        };
    }

    return {
        brief: {
            headline: validation.payload.headline,
            bullets: checked.kept,
            tone: validation.payload.tone,
            source: 'llm',
            packHash: pack.hash,
            generatedAt: ctx.generatedAt,
            promptVersion: ctx.promptVersion ?? AI_BRIEF_PROMPT_VERSION,
            reason: null,
        },
        passRatePct: checked.passRatePct,
        dropped,
        errors: validation.errors,
    };
}
