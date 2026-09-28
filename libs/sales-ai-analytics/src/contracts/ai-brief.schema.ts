/**
 * Строгая JSON-схема ответа модели для AI-резюме (версия 2: группы
 * буллетов и ссылки). Вынесена из `ai-brief.contract.ts` по лимиту
 * 300 строк; потребитель — `VibeCodeClient.structuredCompletionWithUsage`
 * (`Record<string, unknown>`).
 *
 * Модель пишет заголовок и буллеты двух групп — изменения и фокус.
 * Действия в схему не входят: их выводят правила из пакета фактов.
 * Дополнительные поля запрещены — всё, что не описано, отбрасывается
 * `validateBriefPayload`. Только константы — без DI.
 */
import {
    AI_BRIEF_LIMITS,
    AI_BRIEF_MODEL_GROUPS,
    AI_BRIEF_TONES,
} from './ai-brief.contract';

/** Буллетов в ответе модели: сумма лимитов её групп. */
export const AI_BRIEF_MODEL_BULLETS =
    AI_BRIEF_LIMITS.groups.change + AI_BRIEF_LIMITS.groups.focus;

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
                            'норма или план).',
                    },
                    group: {
                        type: 'string',
                        enum: [...AI_BRIEF_MODEL_GROUPS],
                        description:
                            'Группа: change — что изменилось, focus — на ' +
                            'кого смотреть.',
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
