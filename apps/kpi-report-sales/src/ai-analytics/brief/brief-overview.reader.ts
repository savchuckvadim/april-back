/**
 * Обзор окна из кэша витрины для AI-резюме: общий читатель сборщика
 * пакета и джобы резюме.
 *
 * Ключ кэша обзора несёт нормализованный ростер. Страница обзора обычно
 * считает его по всему ростеру портала, а периметр применяет при чтении,
 * поэтому резюме ищет обзор дважды: по своему периметру и по всему
 * ростеру. Строки чужих менеджеров отсекает сборщик (`rowsInScope`), так
 * что числа резюме от выбора ключа не зависят — зато уже посчитанный
 * обзор не считается второй раз.
 *
 * Только кэш: в Bitrix и загрузчики читатель не ходит. Не `@Injectable`:
 * создаётся сборщиком и джобой поверх их сервиса кэша.
 */
import type { BriefPeriod } from '@lib/sales-ai-analytics';
import { buildReportUsersKey } from '../../report';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import { buildOverviewKey } from '../cache/cache-key.util';
import { buildManagersKey } from '../domain/loaders/loader-cache-key.util';
import { normalizeManagerIds } from '../domain/loaders/managers.loader';
import type {
    AiOverviewCacheEntry,
    AiOverviewDto,
} from '../dto/ai-overview.dto';

export class BriefOverviewReader {
    constructor(private readonly cache: AiAnalyticsCacheService) {}

    /** Кэшированный ростер портала (ManagersLoader, 5 минут); нет — пусто. */
    async roster(domain: string): Promise<number[]> {
        const cached = await this.cache.getJson<unknown>(
            buildManagersKey(domain),
        );

        return Array.isArray(cached)
            ? normalizeManagerIds(cached as (string | number)[])
            : [];
    }

    /** Ключ кэша обзора окна по списку менеджеров (все звонки, не только подтверждённые). */
    key(
        domain: string,
        period: BriefPeriod,
        managerIds: readonly number[],
    ): string {
        return buildOverviewKey(
            domain,
            period.from,
            period.to,
            buildReportUsersKey(managerIds),
            false,
        );
    }

    /**
     * Менеджеры, по которым воспроизводится окно обзора: периметр резюме,
     * а без него — кэшированный ростер портала; пусто — окно не
     * воспроизвести.
     */
    async scope(
        domain: string,
        managerIds: readonly number[],
    ): Promise<number[]> {
        return managerIds.length ? [...managerIds] : this.roster(domain);
    }

    /** Готовый обзор по ключу кэша; промах и конверт ошибки — null. */
    async readByKey(key: string): Promise<AiOverviewDto | null> {
        const entry = await this.cache.getJson<AiOverviewCacheEntry>(key);

        return entry && entry.status === 'ready' ? entry.data : null;
    }

    /**
     * Обзор окна из кэша: по периметру резюме, затем по всему ростеру
     * портала; нет обоих — null. Обзор по ростеру годится, только если в
     * нём есть строки всех менеджеров периметра — иначе числа резюме
     * молча потеряли бы человека.
     */
    async read(
        domain: string,
        period: BriefPeriod,
        managerIds: readonly number[],
    ): Promise<AiOverviewDto | null> {
        const ownKey =
            managerIds.length > 0 ? this.key(domain, period, managerIds) : null;
        if (ownKey !== null) {
            const own = await this.readByKey(ownKey);
            if (own) return own;
        }
        const roster = await this.roster(domain);
        if (roster.length === 0) return null;
        const sharedKey = this.key(domain, period, roster);
        // Периметр совпал с ростером — этот ключ уже прочитан.
        if (sharedKey === ownKey) return null;
        const shared = await this.readByKey(sharedKey);

        return shared && coversAll(shared, managerIds) ? shared : null;
    }
}

/** В обзоре есть строка каждого менеджера периметра. */
function coversAll(
    overview: AiOverviewDto,
    managerIds: readonly number[],
): boolean {
    const present = new Set(overview.managers.map(row => row.managerId));

    return managerIds.every(id => present.has(String(id)));
}
