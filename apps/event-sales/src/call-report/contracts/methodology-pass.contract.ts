import {
    CHECKPOINT_STATUSES,
    checkpointsForType,
    type CheckpointStatus,
    type Methodology,
    type MethodologyCheckpoint,
    type MethodologyPassRaw,
    type SpiralResult,
} from '@lib/call-lib';
import { DEEP_ANALYSIS_CORE_RULES } from './call-deep-analysis.contract';

/**
 * Контракт прохода «МЕТОДИКА» (этап 1 плана методики Полянского): отдельный
 * strict-вызов поверх трёх фокусов — пункты методики со статусом и цитатой
 * и спирали презентации. Проход идёт только на порталах с выбранной
 * методикой и только для её типов звонков; ядро разбора он не меняет.
 */

export const METHODOLOGY_PASS_SCHEMA_NAME = 'call_focus_methodology';

/** Пункты, которые спрашиваем у модели: без правила кода. */
export const modelCheckpointsFor = (
    methodology: Methodology,
    callType: string | null,
): MethodologyCheckpoint[] =>
    checkpointsForType(methodology, callType).filter(
        checkpoint => checkpoint.rule === undefined,
    );

/** Спирали считаются, если включены и тип звонка в их списке. */
export const spiralsEnabledFor = (
    methodology: Methodology,
    callType: string | null,
): boolean =>
    methodology.spirals.enabled &&
    callType !== null &&
    (methodology.spirals.types as readonly string[]).includes(callType);

const SPIRAL_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        need: { type: ['string', 'null'] },
        feature: { type: ['string', 'null'] },
        link: { type: ['string', 'null'] },
        benefit: { type: ['string', 'null'] },
        question: { type: ['string', 'null'] },
        clientAnswer: { type: ['string', 'null'] },
    },
    required: [
        'need',
        'feature',
        'link',
        'benefit',
        'question',
        'clientAnswer',
    ],
    additionalProperties: false,
};

/** Схема ответа прохода; null — модели нечего спрашивать (нет пунктов и спиралей). */
export function buildMethodologyPassSchema(
    methodology: Methodology,
    callType: string | null,
): Record<string, unknown> | null {
    const checkpoints = modelCheckpointsFor(methodology, callType);
    const spirals = spiralsEnabledFor(methodology, callType);
    if (checkpoints.length === 0 && !spirals) return null;
    return {
        type: 'object',
        properties: {
            checkpoints: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        code: {
                            type: 'string',
                            enum: checkpoints.map(
                                checkpoint => checkpoint.code,
                            ),
                        },
                        status: {
                            type: 'string',
                            enum: [...CHECKPOINT_STATUSES],
                        },
                        quote: { type: ['string', 'null'] },
                        startSec: { type: ['integer', 'null'], minimum: 0 },
                        endSec: { type: ['integer', 'null'], minimum: 0 },
                    },
                    required: ['code', 'status', 'quote', 'startSec', 'endSec'],
                    additionalProperties: false,
                },
            },
            spirals: spirals
                ? { type: ['array', 'null'], items: SPIRAL_SCHEMA }
                : { type: 'null' },
        },
        required: ['checkpoints', 'spirals'],
        additionalProperties: false,
    };
}

const SPIRALS_SPEC = `СПИРАЛИ ПРЕЗЕНТАЦИИ (spirals) — каждый показанный блок одной записью:
- need — потребность клиента, под которую показан блок; null, если блок показан
  без связи с потребностью.
- feature — что показали или назвали: инструмент, возможность.
- link — связка «что это даёт именно вам».
- benefit — выгода для клиента словами менеджера.
- question — вопрос клиенту после блока; null, если вопроса не было.
- clientAnswer — что ответил клиент; null, если не отвечал.
Полный виток (все пять звеньев: потребность, свойство, связка, выгода,
вопрос) считает код — не оценивай полноту сам. Показа не было — пустой
массив [].`;

const evidenceNote = (checkpoint: MethodologyCheckpoint): string =>
    checkpoint.evidence === 'quote'
        ? '[нужна дословная цитата]'
        : '[факт разговора, цитата по возможности]';

/** Системный промпт прохода: правила ядра, правила методики, пункты, статусы, спирали. */
export function buildMethodologyPassPrompt(
    methodology: Methodology,
    callType: string | null,
): string {
    const checkpoints = modelCheckpointsFor(methodology, callType);
    const lines = checkpoints
        .map(
            checkpoint =>
                `- ${checkpoint.code} — ${checkpoint.title} ${evidenceNote(checkpoint)}` +
                (checkpoint.hint ? ` (${checkpoint.hint})` : ''),
        )
        .join('\n');
    const principles = methodology.principles.length
        ? `\n\nПРАВИЛА МЕТОДИКИ (по ним судятся пункты):\n${methodology.principles
              .map(principle => `- ${principle}`)
              .join('\n')}`
        : '';
    const checkpointsBlock = checkpoints.length
        ? `

ПУНКТЫ ДЛЯ ПРОВЕРКИ — каждый ровно одной записью в checkpoints, код из списка:
${lines}

СТАТУСЫ
- done — пункт выполнен. Для пунктов с пометкой «нужна дословная цитата»
  обязательна цитата менеджера из расшифровки и таймкоды startSec/endSec по
  меткам [mm:ss]; без цитаты пункт выполненным не считается.
- missed — менеджер мог выполнить пункт в этом разговоре и не выполнил.
  Цитата по возможности: что прозвучало вместо этого.
- not_applicable — выполнить пункт было невозможно: разговор до него не дошёл
  (недозвон, секретарь, автоответчик) или тема по ситуации не нужна. Не прячь
  пропуски за «неприменимо»: дошёл до этапа и пропустил шаг — это missed.`
        : '\n\nПунктов для проверки у этого типа звонка нет — верни checkpoints: [].';
    const spiralsBlock = spiralsEnabledFor(methodology, callType)
        ? `\n\n${SPIRALS_SPEC}`
        : '\n\nspirals — верни null: для этого типа звонка спирали не считаются.';
    return `${DEEP_ANALYSIS_CORE_RULES}

ТВОЙ ФОКУС В ЭТОМ ЗАПРОСЕ — ПРОВЕРКА ПО МЕТОДИКЕ «${methodology.title}». Не
оценивай разделы и не ставь оценок: этим занимаются другие проходы разбора.
Твоя задача — по каждому пункту методики сказать, выполнен ли он в ЭТОМ
разговоре, и доказать цитатой.${principles}${checkpointsBlock}${spiralsBlock}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const textOrNull = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const secOrNull = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? Math.round(value)
        : null;

/**
 * Ответ модели → сырой результат прохода: чужие коды и неизвестные статусы
 * отбрасываются, дубли кода — первый, полнота витка считается кодом.
 * Ответа нет или он не объект — null.
 */
export function parseMethodologyPass(
    result: unknown,
    allowedCodes: readonly string[],
): MethodologyPassRaw | null {
    if (!isRecord(result)) return null;
    const seen = new Set<string>();
    const checkpoints: MethodologyPassRaw['checkpoints'] = [];
    for (const item of Array.isArray(result.checkpoints)
        ? result.checkpoints
        : []) {
        if (!isRecord(item)) continue;
        const code = typeof item.code === 'string' ? item.code : '';
        const status = typeof item.status === 'string' ? item.status : '';
        if (!allowedCodes.includes(code) || seen.has(code)) continue;
        if (!(CHECKPOINT_STATUSES as readonly string[]).includes(status))
            continue;
        seen.add(code);
        checkpoints.push({
            code,
            status: status as CheckpointStatus,
            quote: textOrNull(item.quote),
            startSec: secOrNull(item.startSec),
            endSec: secOrNull(item.endSec),
        });
    }
    const spirals = Array.isArray(result.spirals)
        ? result.spirals.filter(isRecord).map(toSpiral)
        : null;
    return { checkpoints, spirals };
}

function toSpiral(item: Record<string, unknown>): SpiralResult {
    const spiral = {
        need: textOrNull(item.need),
        feature: textOrNull(item.feature),
        link: textOrNull(item.link),
        benefit: textOrNull(item.benefit),
        question: textOrNull(item.question),
        clientAnswer: textOrNull(item.clientAnswer),
    };
    return {
        ...spiral,
        full:
            spiral.need !== null &&
            spiral.feature !== null &&
            spiral.link !== null &&
            spiral.benefit !== null &&
            spiral.question !== null,
    };
}
