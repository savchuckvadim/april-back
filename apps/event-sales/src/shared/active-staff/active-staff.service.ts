import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import { BitrixService } from '@/modules/bitrix';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';

type BxRow = Record<string, unknown>;

const CACHE_APP = 'event-sales-hooks';
const CACHE_KEY = 'inactive_departments_v1';
/** Отдел неработающих меняется редко — часа хватает, сутки — уже много. */
const CACHE_TTL_SEC = 3600;

/**
 * Названия отделов, куда порталы складывают уволенных, не выключая аккаунт
 * («Не работающие сотрудники» у garantservisvoronezh, id 91). Настройка
 * `lead_intake_inactive_department_ids` дополняет список явными id.
 */
export const INACTIVE_DEPARTMENT_NAME = /не\s*работающ|уволен|dismiss|fired/i;

const PAGE = 50;

/**
 * Кто из сотрудников работает ПРЯМО СЕЙЧАС — по живому порталу.
 *
 * Два признака «не работает» (случай 22.09.2026, сделка 84879):
 *  - `ACTIVE=false` — аккаунт выключен;
 *  - сотрудник числится в отделе неработающих — аккаунт ещё жив, но заявок
 *    ему давать нельзя (лид с сайта создался на такого, робот передал его
 *    нашему хуку явным ответственным).
 *
 * Список отделов неработающих кешируется на час; `user.get` по кандидатам —
 * всегда живой: суточный кеш структуры отделов уже подводил.
 */
@Injectable()
export class ActiveStaffService {
    private readonly logger = new Logger(ActiveStaffService.name);

    constructor(
        private readonly appCache: AppCacheService,
        private readonly appSettings: PortalAppSettingsService,
    ) {}

    /** Подмножество `ids`, кто работает: активен и не в отделе неработающих. */
    async activeUserIds(
        domain: string,
        bitrix: BitrixService,
        ids: number[],
    ): Promise<Set<number>> {
        const active = new Set<number>();
        const unique = [...new Set(ids.filter(id => Number.isInteger(id)))];
        if (!unique.length) return active;

        const inactiveDepartments = await this.inactiveDepartmentIds(
            domain,
            bitrix,
        );
        for (let start = 0; start < unique.length + PAGE; start += PAGE) {
            const response = (await bitrix.api.call('user.get', {
                FILTER: { ID: unique, ACTIVE: true },
                SELECT: ['ID', 'UF_DEPARTMENT'],
                start,
            })) as { result?: BxRow[] } | undefined;
            const rows = response?.result ?? [];
            for (const row of rows) {
                const id = Number(row.ID);
                if (!Number.isInteger(id) || id <= 0) continue;
                if (this.inInactiveDepartment(row, inactiveDepartments)) {
                    this.logger.log(
                        `[staff] ${domain}: сотрудник ${id} в отделе неработающих — исключён`,
                    );
                    continue;
                }
                active.add(id);
            }
            if (rows.length < PAGE) break;
        }
        return active;
    }

    /** Отделы неработающих портала: по названию + из настройки. Кеш на час. */
    async inactiveDepartmentIds(
        domain: string,
        bitrix: BitrixService,
    ): Promise<Set<number>> {
        const fromSettings = await this.settingsDepartmentIds(domain);
        const cached = await this.appCache.get<number[]>({
            app: CACHE_APP,
            domain,
            key: CACHE_KEY,
        });
        const byName = cached ?? (await this.scanByName(domain, bitrix));
        return new Set<number>([...fromSettings, ...byName]);
    }

    private async scanByName(
        domain: string,
        bitrix: BitrixService,
    ): Promise<number[]> {
        const found: number[] = [];
        try {
            for (let start = 0; start < 5000; start += PAGE) {
                const response = (await bitrix.api.call('department.get', {
                    start,
                })) as { result?: BxRow[] } | undefined;
                const rows = response?.result ?? [];
                for (const row of rows) {
                    const id = Number(row.ID);
                    const name =
                        typeof row.NAME === 'string' ? row.NAME.trim() : '';
                    if (id > 0 && INACTIVE_DEPARTMENT_NAME.test(name)) {
                        found.push(id);
                    }
                }
                if (rows.length < PAGE) break;
            }
        } catch (error) {
            this.logger.warn(
                `[staff] ${domain}: отделы не прочитаны — только ACTIVE и настройка: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return [];
        }
        await this.appCache.set({
            app: CACHE_APP,
            domain,
            key: CACHE_KEY,
            ttlSeconds: CACHE_TTL_SEC,
            group: 'staff',
            data: found,
        });
        return found;
    }

    private async settingsDepartmentIds(domain: string): Promise<number[]> {
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.eventSales,
            );
            return String(settings.leadIntakeInactiveDepartmentIds ?? '')
                .split(/[,;\s]+/)
                .map(Number)
                .filter(id => Number.isInteger(id) && id > 0);
        } catch {
            return [];
        }
    }

    private inInactiveDepartment(row: BxRow, inactive: Set<number>): boolean {
        if (!inactive.size) return false;
        const departments = Array.isArray(row.UF_DEPARTMENT)
            ? row.UF_DEPARTMENT
            : [row.UF_DEPARTMENT];
        return departments.some(raw => inactive.has(Number(raw)));
    }
}
