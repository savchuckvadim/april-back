import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '@/core/redis/redis.service';
import { PBXService } from '@lib/pbx';
import { ResponsibleUser } from '../type/related.type';

type BitrixInstance = Awaited<ReturnType<PBXService['init']>>['bitrix'];
type BxRow = Record<string, unknown>;

/**
 * Сколько живёт запись о сотруднике в кэше.
 *
 * ФИО, должность и руководитель меняются редко, а спрашивают их на каждое
 * открытие связей клиента: без кэша это до пяти пачек подряд (сотрудники →
 * отделы на три уровня → руководители) — та самая «цепочка из пяти пачек
 * после открытия сделки» из логов (разбор нагрузки 05.10.2026). Час — срок,
 * за который перестановка в отделе доедет сама; срочно — ⟳ через час.
 */
export const RESPONSIBLE_CACHE_TTL_SEC = 60 * 60;

/** Ключ записи: версия формата + портал + сотрудник. */
export const responsibleCacheKey = (domain: string, userId: number): string =>
    `pbx:responsible:v1:${domain}:${userId}`;

const isResponsibleUser = (value: unknown): value is ResponsibleUser => {
    if (!value || typeof value !== 'object') return false;
    const user = value as Record<string, unknown>;
    return typeof user.id === 'number' && typeof user.name === 'string';
};

/**
 * Ответственные сотрудники и их руководители.
 *
 * Нужен ровно для двух вещей в карточке дубля: показать «с кем клиент уже
 * работает» по-человечески (а не `ASSIGNED_BY_ID: 447`) и знать, кому уходит
 * запрос «хочу работать с этой компанией».
 *
 * Инстанс `bitrix` принимается параметром, а не хранится в поле: разные
 * порталы должны получать разные инстансы, иначе батчи одного домена утекут
 * в другой.
 */
@Injectable()
export class ResponsibleService {
    private readonly logger = new Logger(ResponsibleService.name);

    /**
     * Redis необязателен: без него (юнит-тесты, приложение без кэша)
     * сервис работает как раньше — каждый раз читает портал.
     */
    constructor(@Optional() private readonly redis?: RedisService) {}

    /**
     * ФИО и руководители пачки сотрудников — из кэша, а за теми, кого в нём
     * нет, в портал. Повторное открытие связей клиента в пределах часа не
     * делает за сотрудниками ни одного запроса.
     */
    async resolve(
        bitrix: BitrixInstance,
        userIds: number[],
    ): Promise<Map<number, ResponsibleUser>> {
        const ids = [
            ...new Set(userIds.filter(id => Number.isFinite(id) && id > 0)),
        ];
        if (!ids.length) return new Map<number, ResponsibleUser>();

        const domain = bitrix.api.domain;
        const cached = await this.readCache(domain, ids);
        const missing = ids.filter(id => !cached.has(id));
        if (!missing.length) return cached;

        const fresh = await this.resolveFromPortal(bitrix, missing);
        await this.writeCache(domain, fresh);
        return new Map([...cached, ...fresh]);
    }

    /** Записи кэша по сотрудникам; сбой Redis — как будто кэша нет. */
    private async readCache(
        domain: string,
        ids: number[],
    ): Promise<Map<number, ResponsibleUser>> {
        const result = new Map<number, ResponsibleUser>();
        if (!this.redis || !domain) return result;
        try {
            const rows = await this.redis
                .getClient()
                .mget(ids.map(id => responsibleCacheKey(domain, id)));
            rows.forEach(raw => {
                if (!raw) return;
                const parsed: unknown = JSON.parse(raw);
                if (isResponsibleUser(parsed)) result.set(parsed.id, parsed);
            });
        } catch (error) {
            this.logger.warn(
                `Кэш сотрудников не прочитан: ${this.errorText(error)}`,
            );
            return new Map<number, ResponsibleUser>();
        }
        return result;
    }

    private async writeCache(
        domain: string,
        users: Map<number, ResponsibleUser>,
    ): Promise<void> {
        if (!this.redis || !domain || !users.size) return;
        try {
            const pipeline = this.redis.getClient().pipeline();
            for (const user of users.values()) {
                pipeline.set(
                    responsibleCacheKey(domain, user.id),
                    JSON.stringify(user),
                    'EX',
                    RESPONSIBLE_CACHE_TTL_SEC,
                );
            }
            await pipeline.exec();
        } catch (error) {
            this.logger.warn(
                `Кэш сотрудников не записан: ${this.errorText(error)}`,
            );
        }
    }

    /**
     * Чтение из портала. Два батча: пользователи → их отделы. Руководителя
     * берём из `UF_HEAD` отдела; если сотрудник сам руководитель,
     * поднимаемся к родительскому отделу — иначе запрос «хочу работать»
     * уходил бы ему же.
     */
    private async resolveFromPortal(
        bitrix: BitrixInstance,
        ids: number[],
    ): Promise<Map<number, ResponsibleUser>> {
        const result = new Map<number, ResponsibleUser>();

        const users = await this.fetchUsers(bitrix, ids);
        if (!users.size) return result;

        const departmentIds = new Set<number>();
        for (const user of users.values()) {
            for (const id of this.departmentIdsOf(user)) departmentIds.add(id);
        }
        const departments = await this.fetchDepartmentTree(bitrix, [
            ...departmentIds,
        ]);

        // Руководители — те же пользователи, но их может не быть в первой пачке.
        const headIds = new Set<number>();
        for (const user of users.values()) {
            const headId = this.headIdFor(user, departments);
            if (headId) headIds.add(headId);
        }
        const missingHeads = [...headIds].filter(id => !users.has(id));
        const heads = missingHeads.length
            ? await this.fetchUsers(bitrix, missingHeads)
            : new Map<number, BxRow>();

        for (const [id, user] of users) {
            const headId = this.headIdFor(user, departments);
            const headRow = headId
                ? (users.get(headId) ?? heads.get(headId))
                : undefined;

            result.set(id, {
                id,
                name: this.fullName(user) || `Сотрудник ${id}`,
                position: this.text(user.WORK_POSITION),
                head:
                    headId && headRow
                        ? {
                              id: headId,
                              name:
                                  this.fullName(headRow) ||
                                  `Сотрудник ${headId}`,
                          }
                        : undefined,
            });
        }
        return result;
    }

    /* ------------------------------------------------------------------ */

    private async fetchUsers(
        bitrix: BitrixInstance,
        ids: number[],
    ): Promise<Map<number, BxRow>> {
        const map = new Map<number, BxRow>();
        if (!ids.length) return map;

        for (const id of ids) {
            bitrix.api.addCmdBatch(`u${id}`, 'user.get', { ID: id });
        }

        try {
            const chunks = await bitrix.api.callBatchAsync();
            for (const chunk of chunks) {
                const rows = (chunk?.result ?? {}) as Record<string, unknown>;
                for (const value of Object.values(rows)) {
                    // user.get отдаёт массив даже при выборке по ID.
                    const user: unknown = Array.isArray(value)
                        ? (value as unknown[])[0]
                        : value;
                    if (!user || typeof user !== 'object') continue;
                    const id = Number((user as BxRow).ID);
                    if (Number.isFinite(id)) map.set(id, user as BxRow);
                }
            }
        } catch (error) {
            this.logger.warn(
                `Не удалось получить пользователей: ${this.errorText(error)}`,
            );
        }
        return map;
    }

    /**
     * Отделы сотрудников плюс их родители на два уровня вверх: подъём по
     * `PARENT` нужен, когда сам сотрудник и есть `UF_HEAD` своего отдела —
     * тогда его руководитель сидит уровнем выше.
     */
    private async fetchDepartmentTree(
        bitrix: BitrixInstance,
        ids: number[],
    ): Promise<Map<number, BxRow>> {
        const known = new Map<number, BxRow>();
        let pending = ids;

        for (let depth = 0; depth < 3 && pending.length; depth++) {
            const loaded = await this.fetchDepartments(bitrix, pending);
            for (const [id, row] of loaded) known.set(id, row);

            const parents = new Set<number>();
            for (const row of loaded.values()) {
                const parentId = Number(row.PARENT);
                if (
                    Number.isFinite(parentId) &&
                    parentId > 0 &&
                    !known.has(parentId)
                ) {
                    parents.add(parentId);
                }
            }
            pending = [...parents];
        }
        return known;
    }

    private async fetchDepartments(
        bitrix: BitrixInstance,
        ids: number[],
    ): Promise<Map<number, BxRow>> {
        const map = new Map<number, BxRow>();
        if (!ids.length) return map;

        for (const id of ids) {
            bitrix.api.addCmdBatch(`d${id}`, 'department.get', { ID: id });
        }

        try {
            const chunks = await bitrix.api.callBatchAsync();
            for (const chunk of chunks) {
                const rows = (chunk?.result ?? {}) as Record<string, unknown>;
                for (const value of Object.values(rows)) {
                    const items = Array.isArray(value) ? value : [value];
                    for (const item of items) {
                        if (!item || typeof item !== 'object') continue;
                        const id = Number((item as BxRow).ID);
                        if (Number.isFinite(id)) map.set(id, item as BxRow);
                    }
                }
            }
        } catch (error) {
            this.logger.warn(
                `Не удалось получить отделы: ${this.errorText(error)}`,
            );
        }
        return map;
    }

    /**
     * Руководитель сотрудника: `UF_HEAD` его отдела. Если это он сам —
     * поднимаемся на уровень выше по `PARENT`.
     */
    private headIdFor(
        user: BxRow,
        departments: Map<number, BxRow>,
    ): number | undefined {
        const userId = Number(user.ID);

        for (const departmentId of this.departmentIdsOf(user)) {
            let current = departments.get(departmentId);
            let guard = 0;

            while (current && guard++ < 5) {
                const headId = Number(current.UF_HEAD);
                if (
                    Number.isFinite(headId) &&
                    headId > 0 &&
                    headId !== userId
                ) {
                    return headId;
                }
                const parentId = Number(current.PARENT);
                if (!Number.isFinite(parentId) || parentId <= 0) break;
                current = departments.get(parentId);
            }
        }
        return undefined;
    }

    /**
     * Отделы сотрудника. `UF_DEPARTMENT` приходит массивом, но встречается и
     * скаляром — терпим оба варианта.
     */
    private departmentIdsOf(user: BxRow): number[] {
        const raw = user.UF_DEPARTMENT;
        const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
        return items
            .map(item => Number(item))
            .filter(id => Number.isFinite(id) && id > 0);
    }

    private fullName(user: BxRow): string {
        return [user.LAST_NAME, user.NAME, user.SECOND_NAME]
            .map(part => this.text(part) ?? '')
            .filter(Boolean)
            .join(' ');
    }

    /** Скаляр → строка; объекты не сериализуем ('[object Object]'-защита). */
    private text(raw: unknown): string | undefined {
        if (typeof raw === 'string') {
            const value = raw.trim();
            return value || undefined;
        }
        if (typeof raw === 'number' || typeof raw === 'bigint') {
            return String(raw);
        }
        return undefined;
    }

    private errorText(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
