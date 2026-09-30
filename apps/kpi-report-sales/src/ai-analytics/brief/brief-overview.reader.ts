/**
 * Обзор окна из кэша витрины для AI-резюме: общий читатель сборщика
 * пакета и джобы резюме.
 *
 * Ключ кэша обзора несёт периметр строк — фильтр отчёта ∩ список разбора
 * звонков (AiManagerScopeResolver). Резюме ищет обзор дважды: по своему
 * периметру (он же ключ страницы — BriefUseCase сужает список тем же
 * резолвером) и по периметру вкладки без фильтра (прогрев, страница без
 * фильтра). Строки чужих менеджеров отсекает сборщик (`rowsInScope`), так
 * что числа резюме от выбора ключа не зависят — зато уже посчитанный
 * обзор не считается второй раз.
 *
 * Только кэш: в Bitrix и загрузчики читатель не ходит. Не `@Injectable`:
 * создаётся сборщиком и джобой поверх их сервиса кэша.
 */
import type { BriefPeriod } from '@lib/sales-ai-analytics';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import {
    buildManagerScopeKey,
    buildOverviewKey,
    overviewUsersKey,
} from '../cache/cache-key.util';
import { buildManagersKey } from '../domain/loaders/loader-cache-key.util';
import { normalizeManagerIds } from '../domain/loaders/managers.loader';
import type {
    AiOverviewCacheEntry,
    AiOverviewDto,
} from '../dto/ai-overview.dto';

export class BriefOverviewReader {
    constructor(private readonly cache: AiAnalyticsCacheService) {}

    /**
     * Периметр вкладки AI без фильтра — список разбора либо ростер ОП,
     * как его опубликовал AiManagerScopeResolver (5 минут); нет записи —
     * кэшированный ростер ОП (ManagersLoader); нет ничего — пусто.
     */
    async roster(domain: string): Promise<number[]> {
        const scope = await this.cachedIds(buildManagerScopeKey(domain));

        return scope ?? (await this.cachedIds(buildManagersKey(domain))) ?? [];
    }

    /** Ключ кэша обзора окна по периметру (все звонки, не только подтверждённые). */
    key(
        domain: string,
        period: BriefPeriod,
        managerIds: readonly number[],
    ): string {
        return buildOverviewKey(
            domain,
            period.from,
            period.to,
            overviewUsersKey(normalizeManagerIds(managerIds)),
            false,
        );
    }

    /**
     * Менеджеры, по которым воспроизводится окно обзора: периметр резюме,
     * а без него — периметр вкладки без фильтра; пусто — окно не
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
     * Обзор окна из кэша: по периметру резюме, затем по периметру вкладки
     * без фильтра; нет обоих — null. Второй обзор годится, только если в
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

    /** Список id из кэша; записи нет или она не список — null. */
    private async cachedIds(key: string): Promise<number[] | null> {
        const cached = await this.cache.getJson<unknown>(key);

        return Array.isArray(cached)
            ? normalizeManagerIds(cached as (string | number)[])
            : null;
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
