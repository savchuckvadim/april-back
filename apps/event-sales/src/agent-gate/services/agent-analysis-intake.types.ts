import { CallAnalysisBitrixService } from '@lib/call-lib/call-analysis/services/call-analysis-bitrix.service';

/**
 * Общие типы приёма разбора агента — вынесены из intake-сервиса по лимиту
 * файла; их делят оркестратор, загрузчик контекста, маппер и таймлайн.
 */

/** Активность звонка из Битрикса; null — не получена или её нет. */
export type AgentCallActivity = Awaited<
    ReturnType<CallAnalysisBitrixService['getActivityById']>
>;

/** Направление звонка по активности телефонии. */
export type AgentCallDirection = 'incoming' | 'outgoing';

/** Итог записи смарт-элемента + контекст для таймлайнов. */
export interface SmartItemWriteResult {
    itemId: number;
    managerId?: number;
    /** Активность звонка (для binding записи и fallback-аудио). */
    activity?: AgentCallActivity;
}

/** Компания/контакт/ответственный CRM-сущности звонка (лид или сделка). */
export interface AgentCrmEntityContext {
    companyId?: number;
    contactId?: number;
    managerId?: number;
}

/** Результаты первичного RAG (GigaChat) по транскрипции. */
export interface AgentGigachatResults {
    resume?: string;
    recomendation?: string;
}
