import { CALL_REPORT_CALL_TYPE_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    CHECKPOINT_EVIDENCE_KINDS,
    METHODOLOGY_CAP_TARGETS,
    METHODOLOGY_CONDITION_OPS,
    METHODOLOGY_FACT_FIELDS,
    METHODOLOGY_FACT_TITLES,
    METHODOLOGY_OP_TITLES,
} from '@lib/call-lib/call-report/methodology';

/**
 * Контракт помощника брифа: strict-схема черновика методики (тот же состав,
 * что у валидатора call-lib) и системный промпт с каталогом фактов и
 * операций, чтобы модель раскладывала документ по нашим полям, а не
 * сочиняла свои.
 */

export const METHODOLOGY_ASSIST_SCHEMA_NAME = 'methodology_brief';

const nullable = (type: string): Record<string, unknown> => ({
    type: [type, 'null'],
});

const CONDITION_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        op: { type: 'string', enum: [...METHODOLOGY_CONDITION_OPS] },
        field: {
            type: ['string', 'null'],
            enum: [...METHODOLOGY_FACT_FIELDS, null],
        },
        value: { type: ['boolean', 'number', 'string', 'null'] },
        checkpoint: nullable('string'),
    },
    required: ['op', 'field', 'value', 'checkpoint'],
    additionalProperties: false,
};

const TYPES_SCHEMA: Record<string, unknown> = {
    type: 'array',
    items: { type: 'string', enum: [...CALL_REPORT_CALL_TYPE_CODES] },
};

export const METHODOLOGY_ASSIST_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        code: { type: 'string' },
        title: { type: 'string' },
        types: TYPES_SCHEMA,
        principles: { type: 'array', items: { type: 'string' } },
        checkpoints: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    code: { type: 'string' },
                    title: { type: 'string' },
                    types: TYPES_SCHEMA,
                    evidence: {
                        type: 'string',
                        enum: [...CHECKPOINT_EVIDENCE_KINDS],
                    },
                    mandatory: { type: 'boolean' },
                    hint: nullable('string'),
                },
                required: [
                    'code',
                    'title',
                    'types',
                    'evidence',
                    'mandatory',
                    'hint',
                ],
                additionalProperties: false,
            },
        },
        caps: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    code: { type: 'string' },
                    title: { type: 'string' },
                    types: TYPES_SCHEMA,
                    when: { type: 'array', items: CONDITION_SCHEMA },
                    target: {
                        type: 'string',
                        enum: [...METHODOLOGY_CAP_TARGETS],
                    },
                    max: { type: 'integer', minimum: 1, maximum: 10 },
                },
                required: ['code', 'title', 'types', 'when', 'target', 'max'],
                additionalProperties: false,
            },
        },
        spirals: {
            type: 'object',
            properties: {
                enabled: { type: 'boolean' },
                minFull: { type: 'integer', minimum: 0, maximum: 10 },
                types: TYPES_SCHEMA,
            },
            required: ['enabled', 'minFull', 'types'],
            additionalProperties: false,
        },
    },
    required: [
        'code',
        'title',
        'types',
        'principles',
        'checkpoints',
        'caps',
        'spirals',
    ],
    additionalProperties: false,
};

const factsCatalog = (): string =>
    METHODOLOGY_FACT_FIELDS.map(
        field => `- ${field} — ${METHODOLOGY_FACT_TITLES[field]}`,
    ).join('\n');

const opsCatalog = (): string =>
    METHODOLOGY_CONDITION_OPS.map(
        op => `- ${op} — ${METHODOLOGY_OP_TITLES[op]}`,
    ).join('\n');

/** Системный промпт помощника: задача, каталоги, правила формулировок. */
export function buildAssistPrompt(hints: {
    code: string | null;
    title: string | null;
}): string {
    const naming = [
        hints.code
            ? `Код методики: ${hints.code}.`
            : 'Код методики придумай сам: латиница, цифры, дефис, 2–64 знака (например garant-voronezh).',
        hints.title
            ? `Название методики: ${hints.title}.`
            : 'Название методики — короткое, по-русски.',
    ].join(' ');
    return `Ты — методолог отдела продаж. Тебе дан документ методики продаж компании (скрипт, регламент, методичка). Разложи его в структурированный конфиг для автоматического разбора звонков.

ЧТО СОБРАТЬ
- types — типы звонков из каталога, к которым методика применяется: cold (холодный, выход на ЛПР), site_lead (заявка с сайта), call (звонок под презентацию), presentation (презентация), refine (доработка после презентации), decision (звонок по решению), payment (оплата), event_invite (приглашение на мероприятие).
- principles — 3–8 коротких правил методики одной фразой («Цену в холодном звонке не обсуждаем»).
- checkpoints — проверяемые ПУНКТЫ: что менеджер должен сделать в разговоре. Формулировка — глагол в прошедшем времени, как её увидит менеджер («Уточнил, кто принимает решение»), по-русски, без кодов и английских слов, до 120 знаков. У каждого пункта: code (латиница с точкой-разделителем, например pres.needs_confirmed), types (к каким типам звонков относится), evidence — quote (нужна дословная цитата) или fact (факт разговора), mandatory (входит ли в долю выполнения), hint — подсказка проверяющему или null. Пункты про поведение после звонка, обучение и действия руководителя не включай — только то, что слышно в разговоре.
- caps — ОГРАНИЧИТЕЛИ оценки: «если условие — оценка раздела или итог не выше N». Используй только факты и операции из каталога ниже; target — код раздела (GREETING, NEEDS, PRESENTATION, OBJECTIONS, PRICE, CLOSING, REFUSAL) или total; max — целое 1–10. Условия через checkpoint_missed / checkpoint_done ссылаются на code пункта из checkpoints. Ограничители добавляй только там, где документ прямо требует жёсткого следствия; нет — пустой массив.
- spirals — считать ли «спирали презентации» (потребность → свойство → связка → выгода → вопрос): enabled, minFull (минимум полных витков), types (обычно presentation). Если документ про это молчит — enabled false, minFull 0, types [].

КАТАЛОГ ФАКТОВ для условий (field):
${factsCatalog()}

КАТАЛОГ ОПЕРАЦИЙ (op):
${opsCatalog()}
Для операций над фактом field обязателен, checkpoint — null; для checkpoint_* — наоборот. value нужен только для is / not / lt / lte / gt / gte, иначе null.

${naming}
Опирайся только на документ: не добавляй пунктов, которых в нём нет. Разделы разговора (приветствие, потребности, презентация, возражения, цена, закрытие, отказы) оцениваются ядром всегда — пункты нужны для требований методики СВЕРХ этого.`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Ответ модели → черновик для валидатора: null-поля (hint, field,
 * checkpoint) убираются, пустые title/code отбрасываются с предупреждением,
 * версия 1.0.0, подсказанные код и название перекрывают ответ.
 */
export function cleanAssistDraft(
    result: unknown,
    hints: { code: string | null; title: string | null },
): { draft: Record<string, unknown> | null; warnings: string[] } {
    if (!isRecord(result))
        return { draft: null, warnings: ['Модель вернула не объект'] };
    const warnings: string[] = [];
    const checkpoints = (
        Array.isArray(result.checkpoints) ? result.checkpoints : []
    )
        .filter(isRecord)
        .filter(item => {
            const ok =
                typeof item.code === 'string' &&
                item.code.trim() !== '' &&
                typeof item.title === 'string' &&
                item.title.trim() !== '';
            if (!ok) warnings.push('Пункт без кода или формулировки отброшен');
            return ok;
        })
        .map(item => {
            const { hint, ...rest } = item;
            return typeof hint === 'string' && hint.trim()
                ? { ...rest, hint }
                : rest;
        });
    const caps = (Array.isArray(result.caps) ? result.caps : [])
        .filter(isRecord)
        .map(cap => ({
            ...cap,
            when: (Array.isArray(cap.when) ? cap.when : [])
                .filter(isRecord)
                .map(condition => {
                    const cleaned: Record<string, unknown> = {
                        op: condition.op,
                    };
                    if (typeof condition.field === 'string')
                        cleaned.field = condition.field;
                    if (typeof condition.checkpoint === 'string')
                        cleaned.checkpoint = condition.checkpoint;
                    if (
                        condition.value !== undefined &&
                        (condition.op === 'is' ||
                            condition.op === 'not' ||
                            condition.op === 'lt' ||
                            condition.op === 'lte' ||
                            condition.op === 'gt' ||
                            condition.op === 'gte')
                    ) {
                        cleaned.value = condition.value;
                    }
                    return cleaned;
                }),
        }));
    if (checkpoints.length === 0)
        warnings.push('Модель не нашла в документе проверяемых пунктов');
    return {
        draft: {
            ...result,
            code: hints.code ?? result.code,
            title: hints.title ?? result.title,
            version: '1.0.0',
            checkpoints,
            caps,
        },
        warnings,
    };
}
