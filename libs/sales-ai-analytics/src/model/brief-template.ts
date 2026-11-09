/**
 * Шаблонное резюме без LLM и сборка резюме из ответа модели (план §8,
 * версия 2 «что изменилось и что делать»).
 *
 * Шаблон — штатная деградация и гарантированный путь: нет ключа
 * нейросети, исчерпана квота, ответ не разобрался или после факт-чека
 * осталось меньше двух буллетов. Три группы буллетов (изменения, фокус,
 * действия) собираются в `brief-template.groups.ts`; числа шаблона
 * берутся из пакета фактов теми же функциями форматирования, поэтому
 * шаблонное резюме само проходит факт-чек.
 *
 * Резюме нейросети — её изменения после факт-чека плюс фокус и действия
 * тех же правил, что и в шаблоне: фокус — заголовки карточек «Внимания»
 * как есть (решение 09.11.2026: пересказ моделью искажал смысл), действия
 * всегда стоят на фактах пакета. Заголовок нейросети с числом не из
 * пакета или с числом словами заменяется шаблонным.
 */
import {
    AI_BRIEF_BULLET_GROUPS,
    AI_BRIEF_DROP_REASONS,
    AI_BRIEF_PROMPT_VERSION,
    AI_BRIEF_LIMITS,
    AI_BRIEF_TEMPLATE_REASONS,
    type AiBriefBullet,
    type AiBriefResult,
    type AiBriefTone,
    type AiEvidencePack,
} from '../contracts/ai-brief.contract';
import { AI_BRIEF_FOCUS_CODES } from '../contracts/ai-brief.rules';
import { isCompared } from './brief-delta';
import {
    factCheckBullets,
    findAlienNumber,
    findNumberWord,
    packNumberKeys,
    type BriefDroppedBullet,
} from './brief-factcheck';
import { findFact } from './brief-pack';
import { validateBriefPayload } from './brief-payload';
import {
    actionBullets,
    changeBullets,
    changeFacts,
    focusBullets,
    templateHeadline,
} from './brief-template.groups';

export { limitWords } from './brief-template.groups';

/** Код нарушения: в заголовке нейросети число не из пакета фактов. */
export const AI_BRIEF_HEADLINE_NUMBER_ERROR = 'headline-number-not-in-pack';

/** Код нарушения: в заголовке нейросети число написано словами. */
export const AI_BRIEF_HEADLINE_NUMBER_WORDS_ERROR = 'headline-numbers-in-words';

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

const FOCUS_CODES: ReadonlySet<string> = new Set(AI_BRIEF_FOCUS_CODES);

/**
 * Тон по составу пакета: есть сигналы риска — тревожно, есть отклонения
 * — внимание. Факт с нулём («сигналов риска: 0») тон не поднимает;
 * факт фокуса — карточка «Внимания» — поднимает всегда.
 */
export function toneForPack(pack: AiEvidencePack): AiBriefTone {
    const active = pack.facts.filter(
        fact =>
            FOCUS_CODES.has(fact.code) ||
            (fact.value !== null && fact.value !== 0),
    );
    if (active.some(fact => fact.kind === 'alert')) {
        return 'alarm';
    }

    return active.some(fact => fact.kind === 'deviation')
        ? 'attention'
        : 'calm';
}

/**
 * Шаблонное резюме: изменения → фокус → действия, по группам в лимитах,
 * без единого числа вне пакета.
 */
export function buildTemplateBrief(
    pack: AiEvidencePack,
    ctx: BriefContext,
    reason: string,
): AiBriefResult {
    const bullets =
        pack.facts.length === 0
            ? []
            : [
                  ...changeBullets(pack),
                  ...focusBullets(pack),
                  ...actionBullets(pack),
              ].slice(0, AI_BRIEF_LIMITS.bullets);

    return {
        headline: templateHeadline(pack, ctx.from, ctx.to),
        bullets,
        tone: toneForPack(pack),
        source: 'template',
        packHash: pack.hash,
        generatedAt: ctx.generatedAt,
        promptVersion: ctx.promptVersion ?? AI_BRIEF_PROMPT_VERSION,
        reason,
    };
}

/**
 * Изменение буллета модели: дельта первого сравнимого факта из его
 * ссылок — модель дельту не пишет, витрина берёт её из пакета.
 */
function withFactDelta(
    bullet: AiBriefBullet,
    pack: AiEvidencePack,
): AiBriefBullet {
    if (bullet.group !== 'change') return bullet;
    for (const code of bullet.factRefs) {
        const fact = findFact(pack, code);
        if (fact && isCompared(pack, fact) && typeof fact.delta === 'number') {
            return { ...bullet, delta: fact.delta };
        }
    }

    return bullet;
}

/** Буллеты в порядке групп витрины; внутри группы порядок сохраняется. */
function byGroupOrder(bullets: readonly AiBriefBullet[]): AiBriefBullet[] {
    return AI_BRIEF_BULLET_GROUPS.flatMap(group =>
        bullets.filter(bullet => bullet.group === group),
    );
}

/** Буллет модели целиком о фактах фокуса — карточка и так идёт в focus. */
function isFocusOnly(bullet: AiBriefBullet): boolean {
    return (
        bullet.factRefs.length > 0 &&
        bullet.factRefs.every(ref => FOCUS_CODES.has(ref))
    );
}

/**
 * Сколько буллетов модели нужно для резюме: `minBullets`, но не больше,
 * чем фактов «что изменилось» в пакете (модель пишет только их; при одном
 * таком факте требовать два пункта — отправлять резюме в шаблон зря).
 */
function requiredBullets(pack: AiEvidencePack): number {
    return Math.max(
        1,
        Math.min(AI_BRIEF_LIMITS.minBullets, changeFacts(pack).length),
    );
}

/**
 * Резюме из ответа модели: строгая схема → факт-чек → шаблон, если после
 * проверки осталось меньше нужного числа буллетов (`requiredBullets`). К
 * прошедшим буллетам модели добавляются фокус и действия правил пакета;
 * буллеты модели целиком о фактах фокуса отбрасываются — иначе карточка
 * «Внимания» появлялась бы дважды.
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
    const focusOnly = validation.payload.bullets.filter(isFocusOnly);
    const checked = factCheckBullets(
        validation.payload.bullets.filter(bullet => !isFocusOnly(bullet)),
        pack,
    );
    const dropped: BriefDroppedBullet[] = [
        ...validation.dropped,
        ...focusOnly.map(bullet => ({
            text: bullet.text,
            reason: AI_BRIEF_DROP_REASONS.focusFactAsChange,
        })),
        ...checked.dropped,
    ];
    if (checked.kept.length < requiredBullets(pack)) {
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
    const headlineErrors = headlineIssues(validation.payload.headline, pack);

    return {
        brief: {
            headline:
                headlineErrors.length === 0
                    ? validation.payload.headline
                    : templateHeadline(pack, ctx.from, ctx.to),
            bullets: [
                ...byGroupOrder(
                    checked.kept.map(bullet => withFactDelta(bullet, pack)),
                ),
                ...focusBullets(pack),
                ...actionBullets(pack),
            ],
            tone: validation.payload.tone,
            source: 'llm',
            packHash: pack.hash,
            generatedAt: ctx.generatedAt,
            promptVersion: ctx.promptVersion ?? AI_BRIEF_PROMPT_VERSION,
            reason: null,
        },
        passRatePct: checked.passRatePct,
        dropped,
        errors: [...validation.errors, ...headlineErrors],
    };
}

/** Заголовок модели: число не из пакета или словами — замена шаблонным. */
function headlineIssues(headline: string, pack: AiEvidencePack): string[] {
    const issues: string[] = [];
    if (findAlienNumber(headline, packNumberKeys(pack)) !== null) {
        issues.push(AI_BRIEF_HEADLINE_NUMBER_ERROR);
    }
    if (findNumberWord(headline) !== null) {
        issues.push(AI_BRIEF_HEADLINE_NUMBER_WORDS_ERROR);
    }

    return issues;
}
