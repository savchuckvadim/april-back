/**
 * Управление синхронизацией товарных строк смарт-акта со сделкой.
 *
 * Отключить полностью (ни list, ни set по товарам):
 *   SMART_ACT_PRODUCT_ROWS_SYNC=0
 *   или SMART_ACT_PRODUCT_ROWS_SYNC=false
 *
 * Если переменная не задана — синхронизация включена (удобно для прода).
 * Точечное отключение в коде: `new SmartProductRowService(..., { syncEnabled: false })`.
 */
export function isSmartActProductRowSyncEnabled(): boolean {
    // можно будет сделать чтобы отключать через env
    // const v = process.env.SMART_ACT_PRODUCT_ROWS_SYNC;
    // if (v === '0' || v === 'false') {
    //     return false;
    // }

    return true;
}
