/**
 * Доменная модель ИИ-помощника поддержки: разбор диалога и черновик
 * ответа. Ничего не знает о провайдере модели и о канале (Telegram,
 * Claude Code): это заботы шлюза LLM и входов.
 */

/** Насколько помощник уверен в причине и черновике. */
export const SUPPORT_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type SupportConfidence = (typeof SUPPORT_CONFIDENCE_LEVELS)[number];

export const SUPPORT_CONFIDENCE_LABEL: Record<SupportConfidence, string> = {
    high: 'высокая',
    medium: 'средняя',
    low: 'низкая',
};

/** Разбор диалога моделью — строго по JSON-схеме шлюза. */
export interface SupportAnalysis {
    /** Суть обращения одной-двумя фразами — для сотрудника. */
    summary: string;
    /** Вероятная причина — для сотрудника, можно технически. */
    cause: string;
    /** Черновик ответа клиенту по правилам базы знаний. */
    draftReply: string;
    confidence: SupportConfidence;
    /** Нужен разработчик: данные, повторяющаяся ошибка, настройка. */
    needsDeveloper: boolean;
    /** Название задачи разработчику; null — задача не нужна. */
    taskTitle: string | null;
    /** Чего не хватает от клиента; вопросы уже заданы в черновике. */
    missingInfo: string[];
}

/**
 * Черновик ответа: разбор + текст, который уйдёт клиенту после «да».
 * Живёт в Redis сутки; `replyText` человек может поправить до отправки.
 */
export interface SupportDraft {
    id: string;
    lineDomain: string;
    chatId: number;
    clientName: string | null;
    clientPortal: string | null;
    analysis: SupportAnalysis;
    /** Текст для клиента: черновик модели или правка человека. */
    replyText: string;
    /** ISO. */
    createdAt: string;
    /** Кто ответил: код провайдера шлюза и фактическая модель. */
    provider: string;
    model: string | null;
}
