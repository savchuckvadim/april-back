import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import type { IBXUser } from '@/modules/bitrix/domain/interfaces/bitrix.interface';
import { normalizeManagerIds } from './managers.loader';

/** Страница user.get: столько пользователей метод отдаёт за один вызов. */
const USER_GET_PAGE_SIZE = 50;

/** Поля пользователя, нужные подписи. */
const USER_NAME_SELECT = ['ID', 'NAME', 'LAST_NAME'];

/** «Фамилия Имя»; пусто — null (подпись упадёт на «#id»). */
function displayName(user: IBXUser): string | null {
    const name = [user.LAST_NAME, user.NAME]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(' ');

    return name || null;
}

/**
 * Имена сотрудников «Фамилия Имя» пачкой: user.get с фильтром по списку
 * id (`=ID`) — один вызов на каждые 50 id (страница метода), а не вызов на
 * сотрудника. Нужен сводному дайджесту: поштучные user.get по всему
 * ростеру тянули ручной push до таймаута шлюза.
 *
 * Сбой пачки — warn и пропуск её id: подпись упадёт на «#id», рассылка не
 * срывается. Batch-буфер инстанса не используется — обычные вызовы, общий
 * на домен буфер команд не задевается.
 *
 * НЕ @Injectable: инстанс Bitrix приходит в конструктор на прогон
 * (new UserNamesReader(bitrix)) — правило CLAUDE.md про race condition.
 */
export class UserNamesReader {
    private readonly logger = new Logger(UserNamesReader.name);

    constructor(private readonly bitrix: BitrixService) {}

    /** bitrix-id строкой → «Фамилия Имя»; без имени id в карту не попадает. */
    async read(userIds: readonly string[]): Promise<Map<string, string>> {
        const ids = normalizeManagerIds(userIds).map(String);
        const names = new Map<string, string>();
        for (let start = 0; start < ids.length; start += USER_GET_PAGE_SIZE) {
            const chunk = ids.slice(start, start + USER_GET_PAGE_SIZE);
            try {
                const response = await this.bitrix.user.get(
                    { '=ID': chunk } as Partial<IBXUser>,
                    USER_NAME_SELECT,
                );
                for (const user of response?.result ?? []) {
                    const name = displayName(user);
                    if (name) names.set(String(Number(user.ID)), name);
                }
            } catch (error) {
                this.logger.warn(
                    `Имена сотрудников ${chunk.join(', ')} не прочитаны: ${(error as Error).message}`,
                );
            }
        }

        return names;
    }
}
