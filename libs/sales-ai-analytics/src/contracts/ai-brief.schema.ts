/**
 * Строгая JSON-схема ответа модели для AI-резюме (версия 2: группы
 * буллетов и ссылки). Вынесена из `ai-brief.contract.ts` по лимиту
 * 300 строк; потребитель — `VibeCodeClient.structuredCompletionWithUsage`
 * (`Record<string, unknown>`).
 *
 * Модель пишет заголовок и буллеты одной группы — изменения. Фокус «на
 * кого смотреть» и действия в схему не входят: их выводят правила из
 * пакета фактов (фокус — заголовок карточки «Внимания» как есть).
 * Дополнительные поля запрещены — всё, что не описано, отбрасывается
 * `validateBriefPayload`. Только константы — без DI.
 */
import {
    AI_BRIEF_LIMITS,
    AI_BRIEF_MODEL_GROUPS,
    AI_BRIEF_TONES,
} from './ai-brief.contract';

/** Буллетов в ответе модели: сумма лимитов её групп (сейчас — изменения). */
export const AI_BRIEF_MODEL_BULLETS = AI_BRIEF_MODEL_GROUPS.reduce(
    (sum, group) => sum + AI_BRIEF_LIMITS.groups[group],
    0,
);

export const AI_BRIEF_JSON_SCHEMA: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    required: ['headline', 'bullets', 'tone'],
    properties: {
        headline: {
            type: 'string',
            maxLength: AI_BRIEF_LIMITS.headline,
            description:
                'Заголовок резюме — самое сильное изменение одной фразой, ' +
                'до 140 символов, без причинности; числа — только из пакета.',
        },
        tone: {
            type: 'string',
            enum: [...AI_BRIEF_TONES],
            description: 'Тон резюме: calm | attention | alarm.',
        },
        bullets: {
            type: 'array',
            minItems: 1,
            maxItems: AI_BRIEF_MODEL_BULLETS,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['text', 'group', 'factRefs'],
                properties: {
                    text: {
                        type: 'string',
                        description:
                            'Буллет до 30 слов; каждое число — из пакета ' +
                            'фактов (значение, прошлый период, изменение, ' +
                            'норма или план) и пишется цифрами, как в ' +
                            'пакете; числа словами не допускаются.',
                    },
                    group: {
                        type: 'string',
                        enum: [...AI_BRIEF_MODEL_GROUPS],
                        description:
                            'Группа: change — что изменилось. «На кого ' +
                            'смотреть» и действия добавляются отдельно по ' +
                            'фактам пакета — их не писать.',
                    },
                    managerId: {
                        type: 'string',
                        description: 'Bitrix-id менеджера факта, если он один.',
                    },
                    callType: {
                        type: 'string',
                        description: 'Код типа звонка, если буллет про тип.',
                    },
                    link: {
                        type: 'string',
                        description:
                            'Ссылка из факта пакета (карточка разбора); ' +
                            'только та, что есть у факта.',
                    },
                    factRefs: {
                        type: 'array',
                        minItems: 1,
                        items: { type: 'string' },
                        description: 'Коды фактов пакета, на которых буллет.',
                    },
                },
            },
        },
    },
};

/** Имя схемы для strict-JSON вызова модели. */
export const AI_BRIEF_SCHEMA_NAME = 'ai_analytics_brief';
