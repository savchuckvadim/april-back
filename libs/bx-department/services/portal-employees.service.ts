import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type Redis from 'ioredis';
import { PBXService } from '@/modules/pbx';
import { DepartmentBitrixService } from '@lib/bitrix/domain/department/services/department-bitrxi.service';
import { RedisService } from '@lib/core/redis/redis.service';
import { PortalRepository } from '@lib/portal-lib/store/portal.repository';
import {
    toPortalEmployees,
    type PortalEmployee,
} from '../lib/portal-employees.util';

/** Список сотрудников меняется редко: 10 минут кэша, «Обновить» — мимо. */
export const PORTAL_EMPLOYEES_TTL_SECONDS = 10 * 60;

export function portalEmployeesCacheKey(domain: string): string {
    return `bx-department:employees:${domain}`;
}

/**
 * Сотрудники портала для выбора в админке: id портала → домен →
 * `department.get` + `user.get` (все страницы) → список с отделами.
 * Кэш в Redis на 10 минут; ошибка Redis не ломает выдачу.
 *
 * `@Injectable` без bitrix-состояния: инстанс берётся на вызов
 * (`PBXService.init(domain)`) и живёт только внутри метода; batch не
 * используется.
 */
@Injectable()
export class PortalEmployeesService {
    private readonly logger = new Logger(PortalEmployeesService.name);
    private readonly redis: Redis;

    constructor(
        private readonly portals: PortalRepository,
        private readonly pbx: PBXService,
        redisService: RedisService,
    ) {
        this.redis = redisService.getClient();
    }

    async listByPortalId(
        portalId: number,
        refresh = false,
    ): Promise<PortalEmployee[]> {
        const portal = await this.portals.findById(portalId);
        const domain = portal?.domain?.trim().toLowerCase();
        if (!domain) {
            throw new NotFoundException(
                `Портал ${portalId} не найден или у него не задан домен`,
            );
        }
        return this.list(domain, refresh);
    }

    async list(domain: string, refresh = false): Promise<PortalEmployee[]> {
        const key = portalEmployeesCacheKey(domain);
        if (!refresh) {
            const cached = await this.readCache(key);
            if (cached) return cached;
        }
        const { bitrix } = await this.pbx.init(domain);
        const departmentsApi = new DepartmentBitrixService(bitrix);
        const departments = await departmentsApi.getDepartmentsAll();
        const users = await departmentsApi.getActiveUsersAll();
        const employees = toPortalEmployees(users, departments);
        await this.redis
            .set(
                key,
                JSON.stringify(employees),
                'EX',
                PORTAL_EMPLOYEES_TTL_SECONDS,
            )
            .catch((error: Error) =>
                this.logger.warn(`Кэш ${key} не записан: ${error.message}`),
            );
        return employees;
    }

    private async readCache(key: string): Promise<PortalEmployee[] | null> {
        const raw = await this.redis.get(key).catch(() => null);
        if (!raw) return null;
        try {
            const parsed: unknown = JSON.parse(raw);
            return Array.isArray(parsed) ? (parsed as PortalEmployee[]) : null;
        } catch {
            return null;
        }
    }
}
