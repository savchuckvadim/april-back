/**
 * Разбор ответа модели по строгой схеме резюме (версия 2): заголовок
 * ≤ 140 символов, буллеты двух групп нейросети (изменения и фокус) в
 * лимитах групп, буллет ≤ 30 слов, группа обязательна. Лишние и битые
 * буллеты отбрасываются, негодный заголовок делает ответ непригодным
 * целиком (тогда — шаблон). Действия из ответа модели не принимаются:
 * их выводят правила из пакета фактов.
 *
 * Вынесено из `brief-factcheck.ts` по лимиту 300 строк: здесь форма
 * ответа, там — проверка содержания буллетов.
 */
import {
    AI_BRIEF_DROP_REASONS,
    AI_BRIEF_LIMITS,
    AI_BRIEF_MODEL_GROUPS,
    AI_BRIEF_TONES,
    type AiBriefBullet,
    type AiBriefModelGroup,
    type AiBriefPayload,
    type AiBriefTone,
    type AiEvidencePack,
} from '../contracts/ai-brief.contract';
import {
    findCausal,
    findForbidden,
    wordCount,
    type BriefDroppedBullet,
} from './brief-factcheck';

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

/** Группа из тех, что пишет нейросеть: изменения или фокус. */
const isModelGroup = (value: unknown): value is AiBriefModelGroup =>
    typeof value === 'string' &&
    (AI_BRIEF_MODEL_GROUPS as readonly string[]).includes(value);

/** Буллет нейросети: группа — только из её перечня. */
type ModelBullet = AiBriefBullet & { group: AiBriefModelGroup };

type ParsedBullet =
    | { ok: true; bullet: ModelBullet }
    | { ok: false; dropped: BriefDroppedBullet };

/** Буллет ответа модели в типизированном виде; битая форма — причина. */
function parseBullet(raw: unknown): ParsedBullet {
    if (!isRecord(raw) || typeof raw.text !== 'string') {
        return {
            ok: false,
            dropped: { text: '', reason: AI_BRIEF_DROP_REASONS.malformed },
        };
    }
    if (!isModelGroup(raw.group)) {
        return {
            ok: false,
            dropped: {
                text: raw.text,
                reason: AI_BRIEF_DROP_REASONS.groupUnknown,
                ...(typeof raw.group === 'string' ? { detail: raw.group } : {}),
            },
        };
    }
    const refs = Array.isArray(raw.factRefs)
        ? raw.factRefs.filter(
              (ref): ref is string => typeof ref === 'string' && ref !== '',
          )
        : [];

    return {
        ok: true,
        bullet: {
            text: raw.text,
            group: raw.group,
            factRefs: refs,
            ...(typeof raw.managerId === 'string'
                ? { managerId: raw.managerId }
                : {}),
            ...(typeof raw.callType === 'string'
                ? { callType: raw.callType }
                : {}),
            ...(typeof raw.link === 'string' && raw.link !== ''
                ? { link: raw.link }
                : {}),
        },
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

/** Счётчик буллетов по группам нейросети — для лимита на группу. */
function emptyGroupCounts(): Record<AiBriefModelGroup, number> {
    return { change: 0, focus: 0 };
}

/**
 * Разбор ответа модели по строгой схеме. Пустой пакет фактов делает ответ
 * непригодным: сверять числа не с чем — резюме собирает шаблон.
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
    const perGroup = emptyGroupCounts();
    for (const item of rawBullets) {
        const parsed = parseBullet(item);
        if (!parsed.ok) {
            dropped.push(parsed.dropped);
            continue;
        }
        const { bullet } = parsed;
        if (perGroup[bullet.group] >= AI_BRIEF_LIMITS.groups[bullet.group]) {
            dropped.push({
                text: bullet.text,
                reason: AI_BRIEF_DROP_REASONS.groupOverLimit,
                detail: bullet.group,
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
        perGroup[bullet.group] += 1;
        bullets.push(bullet);
    }
    if (bullets.length === 0) {
        errors.push('bullets-empty');

        return { payload: null, errors, dropped };
    }
    const headline = String(raw.headline);

    return { payload: { headline, bullets, tone }, errors, dropped };
}
