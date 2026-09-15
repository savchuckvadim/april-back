/**
 * Чистые преобразования джобы резюме: расход вызова модели, нагрузка
 * снапшота `ai-analytics-brief` и DTO ответа.
 *
 * Вынесено из `brief-job.use-case.ts` по лимиту 300 строк: здесь нет ни
 * DI, ни времени, ни случайности — всё считается из аргументов, поэтому
 * учёт токенов и цены проверяется формулой, а не прогоном джобы.
 */
import type {
    AiBriefBullet,
    AiBriefResult,
    AiEvidencePack,
    BriefSnapshot,
    BriefSnapshotBullet,
} from '@lib/sales-ai-analytics';
import {
    AI_BRIEF_CHARS_PER_TOKEN,
    AI_BRIEF_PRICE_DECIMALS,
    AI_BRIEF_TEMPLATE_REASON_TEXTS,
} from '../../constants/ai-brief.const';
import type { AiBriefLlmUsage } from '../../brief/ai-brief-llm.port';
import type { AiBriefDto, AiBriefJobData } from '../../dto/ai-brief.dto';

/** Расход вызова в том виде, в каком он едет в снапшот и в DTO. */
export interface BriefUsageFacts {
    /** Токенов вызова; null — модель не вызывали. */
    tokens: number | null;
    /** Стоимость, ₽; null — модель не вызывали. */
    price: number | null;
    /** Токены или цена — оценка, а не факт провайдера. */
    estimated: boolean;
    /** Модель из ответа провайдера; null — вызова не было или не вернул. */
    model: string | null;
}

/** Округление до знаков после запятой без плавающего хвоста. */
function round(value: number, decimals: number): number {
    const factor = 10 ** decimals;

    return Math.round(value * factor) / factor;
}

/**
 * Токены и цена вызова (решение §9 вопрос 5): токены — из `usage`
 * провайдера, а если он их не вернул — оценка по длине промпта и ответа
 * (`AI_BRIEF_CHARS_PER_TOKEN` символов на токен). Цена —
 * `токены / 1000 × llm_price_per_1k`; при нулевой цене реестра расход
 * остаётся в токенах, а `estimated` прямо говорит, что цена не задана.
 */
export function briefUsage(
    usage: AiBriefLlmUsage | null,
    pricePerThousand: number,
): BriefUsageFacts {
    if (usage === null) {
        return { tokens: null, price: null, estimated: false, model: null };
    }
    const byLength = Math.ceil(
        (usage.promptChars + usage.completionChars) / AI_BRIEF_CHARS_PER_TOKEN,
    );
    const tokens = usage.totalTokens ?? byLength;
    const price = round(
        (tokens / 1000) * Math.max(pricePerThousand, 0),
        AI_BRIEF_PRICE_DECIMALS,
    );

    return {
        tokens,
        price,
        estimated: usage.totalTokens === null || pricePerThousand <= 0,
        model: usage.model,
    };
}

/** Буллет резюме → буллет снапшота: без undefined, поля всегда на месте. */
function toSnapshotBullet(bullet: AiBriefBullet): BriefSnapshotBullet {
    return {
        text: bullet.text,
        managerId: bullet.managerId ?? null,
        callType: bullet.callType ?? null,
        factRefs: [...bullet.factRefs],
    };
}

/** Нагрузка снапшота резюме: текст, состав пакета и расход вызова. */
export function toBriefSnapshot(
    data: AiBriefJobData,
    brief: AiBriefResult,
    pack: AiEvidencePack,
    facts: { usage: BriefUsageFacts; passRatePct: number },
): BriefSnapshot {
    return {
        from: data.from,
        to: data.to,
        packHash: pack.hash,
        headline: brief.headline,
        bullets: brief.bullets.map(toSnapshotBullet),
        tone: brief.tone,
        source: brief.source,
        reason: brief.reason,
        promptVersion: brief.promptVersion,
        tokensCount: facts.usage.tokens,
        price: facts.usage.price,
        estimated: facts.usage.estimated,
        model: facts.usage.model,
        factCodes: pack.facts.map(fact => fact.code),
        droppedCodes: [...pack.droppedCodes],
        passRatePct: facts.passRatePct,
        managerIds: data.managerIds.map(String),
    };
}

/** Подпись причины шаблона для витрины; null — резюме собрала модель. */
export function briefReasonText(reason: string | null): string | null {
    if (reason === null) return null;

    return (
        AI_BRIEF_TEMPLATE_REASON_TEXTS[
            reason as keyof typeof AI_BRIEF_TEMPLATE_REASON_TEXTS
        ] ?? reason
    );
}

/** Резюме и расход вызова → DTO ответа ручки. */
export function toBriefDto(
    brief: AiBriefResult,
    usage: BriefUsageFacts,
): AiBriefDto {
    return {
        headline: brief.headline,
        bullets: brief.bullets.map(bullet => ({
            text: bullet.text,
            ...(bullet.managerId === undefined
                ? {}
                : { managerId: bullet.managerId }),
            ...(bullet.callType === undefined
                ? {}
                : { callType: bullet.callType }),
            factRefs: [...bullet.factRefs],
        })),
        tone: brief.tone,
        source: brief.source,
        packHash: brief.packHash,
        generatedAt: brief.generatedAt,
        promptVersion: brief.promptVersion,
        reason: briefReasonText(brief.reason),
        ...(usage.tokens === null
            ? {}
            : {
                  usage: {
                      tokens: usage.tokens,
                      price: usage.price,
                      estimated: usage.estimated,
                  },
              }),
    };
}
