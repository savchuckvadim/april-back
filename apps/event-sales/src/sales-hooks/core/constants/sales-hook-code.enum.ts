import { JobNames } from '@/modules/queue/constants/job-names.enum';

/** Коды семейства sales-хуков. */
export enum EnumSalesHookCode {
    /** Группа 1: преобразовать лид в работу (не обнуляющий аналог ХО). */
    LEAD_TO_WORK = 'lead-to-work',
    /** 2.1: объединение дублей (merge). */
    MERGE_DUPLICATES = 'merge-duplicates',
    /** 2.2: передать работу другому менеджеру. */
    TRANSFER_WORK = 'transfer-work',
    /** 2.3: в буфер отказников. */
    REJECT_BUFFER = 'reject-buffer',
    /** Self-healing графа связей при ручной конвертации лида (onCrmDealAdd). */
    CONVERT_NORMALIZER = 'convert-normalizer',
}

/**
 * Код хука → имя джобы. Оно же — имя silence-события
 * (`silence:<job>` из event-silent) и имя джобы в EVENT_SALES_HOOK_OPS.
 */
export const SALES_HOOK_JOB_NAMES: Record<EnumSalesHookCode, JobNames> = {
    [EnumSalesHookCode.LEAD_TO_WORK]: JobNames.SALES_HOOK_LEAD_TO_WORK,
    [EnumSalesHookCode.MERGE_DUPLICATES]: JobNames.SALES_HOOK_MERGE_DUPLICATES,
    [EnumSalesHookCode.TRANSFER_WORK]: JobNames.SALES_HOOK_TRANSFER_WORK,
    [EnumSalesHookCode.REJECT_BUFFER]: JobNames.SALES_HOOK_REJECT_BUFFER,
    [EnumSalesHookCode.CONVERT_NORMALIZER]:
        JobNames.SALES_HOOK_CONVERT_NORMALIZER,
};

/** Runtime-массив кодов — для @IsIn и Swagger enum. */
export const SALES_HOOK_CODE_VALUES = Object.values(EnumSalesHookCode);
