import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import Redis from 'ioredis';
import { RedisService } from 'src/core/redis/redis.service';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { DepartmentBitrixService } from '@/modules/bitrix/domain/department/services/department-bitrxi.service';
import { PBXService } from '@/modules/pbx';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { BxDepartmentResponseDto } from '../dto/bx-department.dto';
import { withHeads } from '../lib/department-heads.util';
import { collectUsers } from '../lib/department-match.util';
import {
    DepartmentMode,
    departmentModeCacheKey,
    resolveDepartmentMode,
} from '../lib/department-mode.util';
import { IDepartmentData, IDepartmentTree } from '../lib/structure-data.types';
import { BxDepartmentHeadsService } from './bx-department-heads.service';
import { DepartmentTreeLoader } from './department-tree.loader';

const CACHE_TTL_SECONDS = 86400;

/**
 * Мультирежим без единого найденного ОП — скорее ошибка в названиях или
 * тэге: кэшируем ненадолго, чтобы исправление на портале подхватилось.
 */
const EMPTY_MULTIPLE_TTL_SECONDS = 300;

/**
 * Версия формы ответа в ключе кэша: новые поля не должны ждать полуночи,
 * пока протухнет вчерашний JSON. v2 — parentDepartments и нормализованный
 * UF_HEAD; v3 — список HEADS (структура v3 + UF_HEAD); v4 — режим в ключе,
 * мультирежим ОП (снимок общий со структурой отделов).
 * Менять синхронно с BxDepartmentCacheService.
 */
const CACHE_SHAPE_VERSION = 'v4';

/**
 * Базовый отдел групп кроме продаж — исторический хардкод: для них отдел
 * из конфига портала не берётся. Оставлен как было.
 */
const LEGACY_NON_SALES_BASE_DEPARTMENT_ID = 9;

/**
 * Снимок отдела группы (продаж/сервиса) со всеми сотрудниками — единый
 * источник и для `bitrix/department/sales`, и для структуры отделов
 * (BxDepartmentStructureService строит её проекцией этого же снимка).
 * Режим — из БД: одиночный (базовый отдел из конфига портала) или
 * мультирежим (все ОП по тэгу со всей структуры портала).
 */
@Injectable()
export class BxDepartmentService {
    private readonly logger = new Logger(BxDepartmentService.name);
    private readonly redis: Redis;

    constructor(
        private readonly redisService: RedisService,
        private readonly pbx: PBXService,
        private readonly heads: BxDepartmentHeadsService,
    ) {
        this.redis = this.redisService.getClient();
    }

    async getFullDepartment(
        domain: string,
        group: EDepartamentGroup | undefined,
        resetCache = false,
    ): Promise<BxDepartmentResponseDto> {
        // bitrix и модели портала — только локальные переменные: в this их
        // класть нельзя (разные порталы → разные инстансы, race condition).
        const { bitrix, PortalModel, internalPortal } =
            await this.pbx.init(domain);
        const targetGroup = group || EDepartamentGroup.sales;
        const mode = resolveDepartmentMode(internalPortal, targetGroup);
        const day = dayjs().format('MMDD');
        const cacheKey = `department_${domain}_${day}_${targetGroup}_${departmentModeCacheKey(mode)}_${CACHE_SHAPE_VERSION}`;

        if (!resetCache) {
            const fromCache = await this.redis.get(cacheKey);
            if (fromCache) {
                const cached = JSON.parse(fromCache) as BxDepartmentResponseDto;
                // режим и тэг — всегда из БД: одиночный ключ тэга не содержит
                return {
                    department: {
                        ...cached.department,
                        isMultiple: mode.isMultiple,
                        multipleTag: mode.multipleTag,
                    },
                };
            }
        }

        const loader = new DepartmentTreeLoader(
            new DepartmentBitrixService(bitrix),
            this.logger,
        );
        const baseId = mode.isMultiple
            ? 0 // единого корневого id в мультирежиме нет
            : this.getBaseDepartmentIdByGroup(targetGroup, PortalModel);
        const tree = mode.isMultiple
            ? await loader.loadMultiple(targetGroup, mode.multipleTag)
            : await loader.loadSingle(baseId);

        // Внутренние типы отделов и DTO ответа совпадают по форме, кроме
        // ID сотрудника (Битрикс отдаёт числом или строкой).
        const result = {
            department: await this.toSnapshot(domain, tree, baseId, mode),
        } as BxDepartmentResponseDto;

        const isEmptyMultiple = mode.isMultiple && tree.general.length === 0;
        if (isEmptyMultiple) {
            this.logger.warn(
                `[${domain}] мультирежим ${targetGroup}: не найдено отделов по названию/тэгу «${mode.multipleTag ?? 'шаблоны группы'}» — пустой отдел в кэше на ${EMPTY_MULTIPLE_TTL_SECONDS} с`,
            );
        }
        await this.redis.set(
            cacheKey,
            JSON.stringify(result),
            'EX',
            isEmptyMultiple ? EMPTY_MULTIPLE_TTL_SECONDS : CACHE_TTL_SECONDS,
        );
        return result;
    }

    /**
     * Руководители: структура v3 (руководитель + заместители) ∪ легаси
     * UF_HEAD — одним проходом по всем отделам снимка. Сотрудники
     * родителей в allUsers не входят — как и раньше.
     */
    private async toSnapshot(
        domain: string,
        tree: IDepartmentTree,
        baseId: number | undefined,
        mode: DepartmentMode,
    ): Promise<IDepartmentData> {
        const v3Heads = await this.heads.resolve(domain, [
            ...tree.general,
            ...tree.children,
            ...tree.parents,
        ]);
        const generalDepartment = withHeads(tree.general, v3Heads);
        const childrenDepartments = withHeads(tree.children, v3Heads);
        return {
            department: baseId,
            generalDepartment,
            childrenDepartments,
            parentDepartments: withHeads(tree.parents, v3Heads),
            allUsers: collectUsers([
                ...generalDepartment,
                ...childrenDepartments,
            ]),
            isMultiple: mode.isMultiple,
            multipleTag: mode.multipleTag,
        };
    }

    private getBaseDepartmentIdByGroup(
        group: EDepartamentGroup,
        portal: PortalModel,
    ): number | undefined {
        if (group === EDepartamentGroup.sales) {
            return portal.getDepartamentIdByCode(group)?.bitrixId;
        }
        return LEGACY_NON_SALES_BASE_DEPARTMENT_ID;
    }
}
