import { findPbxLeadStage } from '@lib/portal-lib/pbx-domain/portal-lead/stages/const/pbx-lead-stages.const';

/**
 * Названия стадий воронки «ОП Основная» (sales_base). Runtime-лестница
 * `PBX_DEAL_SALES_BASE_STAGES` несёт только коды и порядок, названия
 * живут в типе воронки — здесь их зеркало для админки. Одно место на
 * каталог, готовность и связи настроек.
 */
export const DEAL_SALES_BASE_STAGE_TITLES: Readonly<Record<string, string>> = {
    sales_new: 'Новая',
    sales_cold: 'Холодные',
    sales_warm: 'Переговоры',
    sales_pres: 'Презентация',
    sales_refine: 'Доработка',
    sales_offer_create: 'Документы',
    sales_document_send: 'Отправлены',
    sales_in_progress: 'В решении',
    sales_money_await: 'В оплате',
    sales_supply: 'Поставка',
    sales_success: 'Успех',
    sales_fail: 'Отказ',
    sales_double: 'Не состоялась (дубль)',
    sales_not_ca: 'Не ЦА',
    sales_not_call: 'Не Беспокоить',
};

/** Название стадии для админки: лид — из шаблона стадий, сделка — из воронки ОП; нет — код. */
export function hookStageTitle(entity: 'lead' | 'deal', code: string): string {
    if (entity === 'lead') {
        return findPbxLeadStage(code)?.title ?? code;
    }
    return DEAL_SALES_BASE_STAGE_TITLES[code] ?? code;
}
