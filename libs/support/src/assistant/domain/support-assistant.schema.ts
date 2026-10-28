import { SUPPORT_REPLY_MAX_LENGTH } from '../../desk/domain/support-desk.text';
import {
    SUPPORT_CONFIDENCE_LEVELS,
    SupportAnalysis,
    SupportConfidence,
} from './support-assistant.types';

/** Имя схемы — в теле запроса к провайдеру и в журнале шлюза. */
export const SUPPORT_ANALYSIS_SCHEMA_NAME = 'support_dialog_analysis';

/** Сколько пунктов «чего не хватает» оставляем: больше — уже анкета. */
const MISSING_INFO_MAX = 5;

/** Strict JSON-схема разбора: все поля обязательны, лишних нет. */
export const SUPPORT_ANALYSIS_SCHEMA: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    properties: {
        summary: {
            type: 'string',
            description: 'Суть обращения одной-двумя фразами, для сотрудника.',
        },
        cause: {
            type: 'string',
            description:
                'Вероятная причина для сотрудника; можно технически. Не знаешь — так и напиши.',
        },
        draftReply: {
            type: 'string',
            description:
                'Черновик ответа клиенту по правилам: сначала ответ, потом причина, потом шаги. По-русски, без кодов.',
        },
        confidence: {
            type: 'string',
            enum: [...SUPPORT_CONFIDENCE_LEVELS],
            description: 'Уверенность в причине и черновике.',
        },
        needsDeveloper: {
            type: 'boolean',
            description:
                'Нужен разработчик: потеря или дублирование данных, ошибка у нескольких сотрудников, ошибка повторяется после шагов, просьба изменить настройку.',
        },
        taskTitle: {
            type: ['string', 'null'],
            description:
                'Название задачи разработчику; null — задача не нужна.',
        },
        missingInfo: {
            type: 'array',
            items: { type: 'string' },
            description:
                'Чего не хватает от клиента для решения; пусто — всё есть.',
        },
    },
    required: [
        'summary',
        'cause',
        'draftReply',
        'confidence',
        'needsDeveloper',
        'taskTitle',
        'missingInfo',
    ],
};

const isConfidence = (value: unknown): value is SupportConfidence =>
    typeof value === 'string' &&
    (SUPPORT_CONFIDENCE_LEVELS as readonly string[]).includes(value);

const text = (value: unknown, field: string): string => {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`Разбор без поля «${field}»`);
    }
    return value.trim();
};

/**
 * Ответ модели → разбор. Провайдер со strict-схемой лишнего не пришлёт,
 * запасной (схема в промпте) — может: проверяем поля сами, чтобы
 * испорченный JSON не дошёл до кнопки «Отправить клиенту».
 */
export function parseSupportAnalysis(raw: unknown): SupportAnalysis {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error('Разбор не является объектом');
    }
    const value = raw as Record<string, unknown>;
    const draftReply = text(value.draftReply, 'черновик ответа');
    const taskTitle =
        typeof value.taskTitle === 'string' && value.taskTitle.trim()
            ? value.taskTitle.trim()
            : null;
    return {
        summary: text(value.summary, 'суть'),
        cause: text(value.cause, 'причина'),
        draftReply: draftReply.slice(0, SUPPORT_REPLY_MAX_LENGTH),
        confidence: isConfidence(value.confidence) ? value.confidence : 'low',
        needsDeveloper: value.needsDeveloper === true || taskTitle !== null,
        taskTitle,
        missingInfo: Array.isArray(value.missingInfo)
            ? value.missingInfo
                  .filter(
                      (item): item is string =>
                          typeof item === 'string' && item.trim().length > 0,
                  )
                  .map(item => item.trim())
                  .slice(0, MISSING_INFO_MAX)
            : [],
    };
}
