import { Logger } from '@nestjs/common';
import {
    BitrixService,
    IBXCompany,
    IBXContact,
    IBXDeal,
} from '@/modules/bitrix';
import { IBXLead } from '@/modules/bitrix/domain/interfaces/bitrix.interface';
import type { AiCallEntityType } from '@lib/sales-ai-analytics';

/** Страница crm.*.list: столько записей метод отдаёт за вызов. */
const LIST_PAGE_SIZE = 50;

/** Сущность звонка в CRM. */
export interface CallClientRef {
    entityType: AiCallEntityType;
    entityId: string;
}

/** Ключ названия: `deal:123`. */
export const callClientKeyOf = (ref: CallClientRef): string =>
    `${ref.entityType}:${ref.entityId}`;

type BxRow = Record<string, unknown>;

/** Строки ответа crm.*.list в любом из видов, что отдаёт библиотека. */
function rowsOf(response: unknown): BxRow[] {
    const result =
        typeof response === 'object' &&
        response !== null &&
        'result' in response
            ? (response as { result: unknown }).result
            : response;
    return Array.isArray(result)
        ? result.filter(
              (row): row is BxRow => typeof row === 'object' && row !== null,
          )
        : [];
}

const textOf = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : '';

/** Название строки: у контакта — «Фамилия Имя», у остальных — TITLE. */
function titleOf(type: AiCallEntityType, row: BxRow): string | null {
    const title =
        type === 'contact'
            ? [textOf(row.LAST_NAME), textOf(row.NAME)]
                  .filter(Boolean)
                  .join(' ')
            : textOf(row.TITLE);
    return title || null;
}

/**
 * Названия клиентов звонков (сделка, лид, компания, контакт) для страницы
 * списка разборов: обычные `crm.*.list` с фильтром по ID — по вызову на
 * тип и каждые 50 id. Batch-буфер инстанса не используется: он общий на
 * домен и мог бы смешаться с чужими командами.
 *
 * НЕ @Injectable: инстанс Битрикса приходит в конструктор на запрос
 * (правило CLAUDE.md про race condition). Сбой типа — warn, названия этого
 * типа пустые.
 */
export class CallClientTitlesReader {
    private readonly logger = new Logger(CallClientTitlesReader.name);

    constructor(private readonly bitrix: BitrixService) {}

    /** `тип:id` → название; без названия ключ в карту не попадает. */
    async read(refs: readonly CallClientRef[]): Promise<Map<string, string>> {
        const titles = new Map<string, string>();
        const byType = new Map<AiCallEntityType, Set<string>>();
        for (const ref of refs) {
            const ids = byType.get(ref.entityType) ?? new Set<string>();
            ids.add(ref.entityId);
            byType.set(ref.entityType, ids);
        }
        for (const [type, ids] of byType) {
            const list = [...ids];
            for (let start = 0; start < list.length; start += LIST_PAGE_SIZE) {
                const chunk = list.slice(start, start + LIST_PAGE_SIZE);
                try {
                    for (const row of rowsOf(await this.list(type, chunk))) {
                        const title = titleOf(type, row);
                        const id = String(Number(row.ID));
                        if (title) titles.set(`${type}:${id}`, title);
                    }
                } catch (error) {
                    this.logger.warn(
                        `Названия ${type} ${chunk.join(', ')} не прочитаны: ${(error as Error).message}`,
                    );
                }
            }
        }
        return titles;
    }

    private list(type: AiCallEntityType, ids: string[]): Promise<unknown> {
        const filter = { ID: ids };
        switch (type) {
            case 'deal':
                return this.bitrix.deal.getList(
                    filter as unknown as Partial<IBXDeal>,
                    ['ID', 'TITLE'],
                );
            case 'lead':
                return this.bitrix.lead.getList(
                    filter as unknown as Partial<IBXLead>,
                    ['ID', 'TITLE'],
                );
            case 'company':
                return this.bitrix.company.getList(
                    filter as unknown as Partial<IBXCompany>,
                    ['ID', 'TITLE'],
                );
            default:
                return this.bitrix.contact.getList(
                    filter as unknown as Partial<IBXContact>,
                    ['ID', 'NAME', 'LAST_NAME'],
                );
        }
    }
}
