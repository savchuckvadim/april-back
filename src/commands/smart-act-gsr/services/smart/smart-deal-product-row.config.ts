/**
 * Авто-подгонка quantity в товарных строках СДЕЛКИ под месяцы договора (reconcile).
 *
 * Отключить:
 *   SMART_ACT_DEAL_PRODUCT_QTY_SYNC=0 или false
 */
export function isSmartDealProductQtySyncEnabled(): boolean {
    // const v = process.env.SMART_ACT_DEAL_PRODUCT_QTY_SYNC;
    // if (v === '0' || v === 'false') {
    //     return false;
    // }
    return true;
}
