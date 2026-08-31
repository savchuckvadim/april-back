import { Injectable, Logger } from '@nestjs/common';
import {
    FlowBitrix,
    SideFlowName,
    sideFlowLogTag,
    SmartKpiRowRef,
} from './side-flow.types';

/** Сырая строка списка из `lists.element.get`. */
type ListRow = Record<string, unknown>;

/**
 * Обратная ссылка ЭЛЕМЕНТА СМАРТА в строках KPI/History-списков.
 *
 * Строки отчёта/плана создаёт основной батч; их id координатор post-flow
 * достаёт из ответа батча и кладёт в джоб (`kpiRows`). Этот сервис после
 * создания/закрытия элемента дописывает `T{hex(entityTypeId)}_{id}` в
 * multiple-crm-поле каждой строки — из строки сводки/истории виден
 * элемент смарта, по которому она написана (решение владельца 31.08).
 *
 * КРИТИЧНО про `lists.element.update`: Битрикс ПЕРЕЗАПИСЫВАЕТ элемент —
 * непереданные свойства ОЧИЩАЮТСЯ. Поэтому строка сначала читается
 * целиком, и назад уезжают NAME + ВСЕ PROPERTY_* (нормализованные из
 * come-back-формы `{key: value}` в массивы значений) + дописанная ссылка.
 *
 * Ошибки не роняют джоб: ссылка — украшение, не инвариант. Один
 * `@Injectable()` на оба потока; инстанс Битрикса приходит АРГУМЕНТОМ
 * (правило CLAUDE.md про this.bitrix и race condition).
 */
@Injectable()
export class SideFlowKpiRowBinderService {
    private readonly logger = new Logger(SideFlowKpiRowBinderService.name);

    async append(
        bitrix: FlowBitrix,
        rows: readonly SmartKpiRowRef[],
        entityTypeId: number,
        elementId: number,
        flow?: SideFlowName,
    ): Promise<void> {
        const ref = `T${entityTypeId.toString(16)}_${elementId}`;
        const tag = sideFlowLogTag(flow);

        for (const row of rows) {
            try {
                await this.appendToRow(bitrix, row, ref, tag);
            } catch (error) {
                this.logger.warn(
                    `${tag} ссылка ${ref} в строку списка ` +
                        `${row.iblockId}:${row.elementId} не записана: ` +
                        `${(error as Error).message}`,
                );
            }
        }
    }

    private async appendToRow(
        bitrix: FlowBitrix,
        row: SmartKpiRowRef,
        ref: string,
        tag: string,
    ): Promise<void> {
        const response = (await bitrix.listItem.get({
            IBLOCK_ID: String(row.iblockId),
            // Точная адресация фильтром по ID: сервисный DTO не несёт
            // ELEMENT_ID, а фильтр по ID — штатный у lists.element.get.
            filter: { ID: row.elementId },
        })) as unknown as { result?: ListRow[] } | null;
        const element = response?.result?.[0];
        if (!element) {
            this.logger.warn(
                `${tag} строка списка ${row.iblockId}:${row.elementId} ` +
                    'не прочитана — ссылка на элемент смарта не записана',
            );
            return;
        }

        const current = normalizeListValues(element[row.crmFieldId]);
        if (current.includes(ref)) return;

        const fields: Record<string, unknown> = {
            // NAME обязателен: без него lists.element.update отклоняется.
            NAME: element['NAME'] ?? '',
        };
        // ВСЕ свойства назад как есть: непереданное Битрикс сотрёт.
        for (const [key, value] of Object.entries(element)) {
            if (!key.startsWith('PROPERTY_')) continue;
            fields[key] = normalizeListValues(value);
        }
        fields[row.crmFieldId] = [...current, ref];

        await bitrix.listItem.update({
            IBLOCK_ID: String(row.iblockId),
            ELEMENT_ID: row.elementId,
            FIELDS: fields as never,
        });
    }
}

/**
 * Значения свойства строки в форму записи.
 *
 * `lists.element.get` отдаёт множественное свойство ОБЪЕКТОМ
 * `{ "1234": "D_25359", ... }` (ключ — id значения), одиночное — скаляром,
 * пустое — undefined/false. На запись Битрикс ждёт массив значений (или
 * скаляр); объект-форма при записи создала бы мусор.
 */
export function normalizeListValues(raw: unknown): unknown[] {
    if (raw === null || raw === undefined || raw === false || raw === '') {
        return [];
    }
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'object') return Object.values(raw as ListRow);
    return [raw];
}
