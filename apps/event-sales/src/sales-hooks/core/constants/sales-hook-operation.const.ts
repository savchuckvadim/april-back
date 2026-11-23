import { EnumSalesHookCode } from './sales-hook-code.enum';

/**
 * Хук по-русски — операция в подписи тревог и журнале сбоев Битрикса
 * («Хук: лид в работу» вместо `sales-hook-lead-to-work`).
 */
export const SALES_HOOK_OPERATION: Record<EnumSalesHookCode, string> = {
    [EnumSalesHookCode.LEAD_TO_WORK]: 'Хук: лид в работу',
    [EnumSalesHookCode.MERGE_DUPLICATES]: 'Хук: объединение дублей',
    [EnumSalesHookCode.TRANSFER_WORK]: 'Хук: передача работы',
    [EnumSalesHookCode.REJECT_BUFFER]: 'Хук: в буфер отказников',
    [EnumSalesHookCode.CONVERT_NORMALIZER]: 'Хук: связи после конвертации лида',
    [EnumSalesHookCode.DUPLICATE_CHECK]: 'Хук: проверка дублей',
    [EnumSalesHookCode.LEAD_ACCEPT]: 'Хук: принятие заявки',
    [EnumSalesHookCode.LEAD_CLIENT]: 'Хук: клиент из лида',
    [EnumSalesHookCode.JOIN_TO_MAIN]: 'Хук: присоединить к основной',
};
