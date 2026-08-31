/**
 * Привязки задачи (`UF_CRM_TASK`) ↔ элементы смартов.
 *
 * Динамическая привязка хранится строкой `T{entityTypeId в hex}_{id}`
 * (например `T424_15` = элемент 15 смарта с entityTypeId 1060). Её пишет
 * наш же SideFlowTaskBinderService — и она ЕДИНСТВЕННЫЙ точный указатель
 * «по какому элементу отчитываются»: у клиента может быть запланировано
 * несколько звонков/презентаций одновременно, и эвристика «свежий открытый
 * элемент клиента» выбирает не тот (инцидент владельца 31.08: вместо
 * закрытия элемента из задачи создался спонтанный дубль).
 */

/** Формат динамической привязки смарта в UF_CRM_TASK. */
const SMART_BINDING_RE = /^T([0-9a-f]+)_(\d+)$/i;

/**
 * id элементов ИМЕННО ЭТОГО смарта из привязок задачи.
 *
 * Привязки приходят «как есть» из задачи (фронт или tasks.task.get):
 * вперемешку лежат `L_x`/`D_x`/`CO_x`/`C_x` и `T*` других смартов —
 * фильтруем по entityTypeId. Терпим оба регистра hex и не-массив на входе
 * (Битрикс отдаёт массив, но защищаемся от сырых данных фронта).
 */
export function parseSmartElementIdsFromTaskBindings(
    bindings: unknown,
    entityTypeId: number,
): number[] {
    const list = Array.isArray(bindings) ? bindings : [];
    const hex = entityTypeId.toString(16).toLowerCase();
    const ids: number[] = [];
    for (const raw of list) {
        if (typeof raw !== 'string') continue;
        const match = SMART_BINDING_RE.exec(raw.trim());
        if (!match) continue;
        if (match[1].toLowerCase() !== hex) continue;
        const id = Number(match[2]);
        if (Number.isFinite(id) && id > 0 && !ids.includes(id)) ids.push(id);
    }
    return ids;
}
