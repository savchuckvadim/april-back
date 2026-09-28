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
 * Резюме нейросети — её изменения и фокус после факт-чека плюс действия
 * тех же правил, что и в шаблоне: действия всегда стоят на фактах пакета.
 * Заголовок нейросети с числом не из пакета заменяется шаблонным.
 */
import {
    AI_BRIEF_BULLET_GROUPS,
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
    packNumberKeys,
    type BriefDroppedBullet,
} from './brief-factcheck';
import { findFact } from './brief-pack';
import { validateBriefPayload } from './brief-payload';
import {
    actionBullets,
    changeBullets,
    focusBullets,
    templateHeadline,
} from './brief-template.groups';

export { limitWords } from './brief-template.groups';

/** Код нарушения: в заголовке нейросети число не из пакета фактов. */
export const AI_BRIEF_HEADLINE_NUMBER_ERROR = 'headline-number-not-in-pack';

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

/**
 * Резюме из ответа модели: строгая схема → факт-чек → шаблон, если после
 * проверки осталось меньше `AI_BRIEF_LIMITS.minBullets` буллетов. К
 * прошедшим буллетам модели добавляются действия правил пакета.
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
    const headlineOk =
        findAlienNumber(validation.payload.headline, packNumberKeys(pack)) ===
        null;

    return {
        brief: {
            headline: headlineOk
                ? validation.payload.headline
                : templateHeadline(pack, ctx.from, ctx.to),
            bullets: [
                ...byGroupOrder(
                    checked.kept.map(bullet => withFactDelta(bullet, pack)),
                ),
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
        errors: headlineOk
            ? validation.errors
            : [...validation.errors, AI_BRIEF_HEADLINE_NUMBER_ERROR],
    };
}
