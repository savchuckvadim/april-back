import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from 'src/core/redis/redis.service';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { DepartmentBitrixService } from '@/modules/bitrix/domain/department/services/department-bitrxi.service';
import { PBXService } from '@/modules/pbx';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { TimedCache } from '@lib/shared';
import { BxDepartmentResponseDto } from '../dto/bx-department.dto';
import { withHeads } from '../lib/department-heads.util';
import { collectUsers } from '../lib/department-match.util';
import {
    DepartmentMode,
    resolveDepartmentMode,
} from '../lib/department-mode.util';
import {
    DEPARTMENT_SNAPSHOT_TTL_SECONDS,
    EMPTY_MULTIPLE_TTL_SECONDS,
} from '../lib/department-snapshot-cache.util';
import { IDepartmentData, IDepartmentTree } from '../lib/structure-data.types';
import { BxDepartmentHeadsService } from './bx-department-heads.service';
import {
    DepartmentSnapshotBuild,
    DepartmentSnapshotCache,
} from './department-snapshot.cache';
import { DepartmentTreeLoader } from './department-tree.loader';

/**
 * Сколько помнить режим отдела (одиночный или мультирежим) в памяти
 * процесса. Режим входит в ключ кэша, а берётся из модели портала: без
 * этой памяти каждое попадание в кэш всё равно собирало бы модель.
 */
const MODE_CACHE_TTL_MS = 60_000;

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
 *
 * Хранение снимка — DepartmentSnapshotCache (вчерашний, пока собирается
 * сегодняшний; одна сборка на всех). Режим отдела помнится минуту, поэтому
 * попадание в кэш модель портала не собирает.
 */
@Injectable()
export class BxDepartmentService {
    private readonly logger = new Logger(BxDepartmentService.name);
    private readonly redis: Redis;
    private readonly snapshots: DepartmentSnapshotCache;
    /** Режим отдела по порталу и группе — см. MODE_CACHE_TTL_MS. */
    private readonly modes = new TimedCache<DepartmentMode>(MODE_CACHE_TTL_MS);

    constructor(
        private readonly redisService: RedisService,
        private readonly pbx: PBXService,
        private readonly heads: BxDepartmentHeadsService,
    ) {
        this.redis = this.redisService.getClient();
        this.snapshots = new DepartmentSnapshotCache(this.redis, this.logger);
    }

    async getFullDepartment(
        domain: string,
        group: EDepartamentGroup | undefined,
        resetCache = false,
    ): Promise<BxDepartmentResponseDto> {
        const targetGroup = group || EDepartamentGroup.sales;
        const mode = await this.resolveMode(domain, targetGroup);
        return this.snapshots.get(
            { domain, group: targetGroup, mode },
            () => this.build(domain, targetGroup, mode),
            resetCache,
        );
    }

    /**
     * Режим отдела из модели портала. Коротко помнится в памяти: он нужен
     * для ключа кэша, и без этого каждое попадание в кэш собирало бы модель
     * портала ради одного флага.
     */
    private async resolveMode(
        domain: string,
        group: EDepartamentGroup,
    ): Promise<DepartmentMode> {
        const load = async (): Promise<DepartmentMode> => {
            const { internalPortal } = await this.pbx.init(domain);
            return resolveDepartmentMode(internalPortal, group);
        };
        // load не отдаёт undefined — запасной вызов нужен только типу.
        return (await this.modes.get(`${domain}:${group}`, load)) ?? load();
    }

    /** Обход структуры портала и сборка снимка (15–30 запросов в Битрикс). */
    private async build(
        domain: string,
        targetGroup: EDepartamentGroup,
        mode: DepartmentMode,
    ): Promise<DepartmentSnapshotBuild> {
        // bitrix и модель портала — только локальные переменные: в this их
        // класть нельзя (разные порталы → разные инстансы, race condition).
        const { bitrix, PortalModel } = await this.pbx.init(domain);
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
        const snapshot = {
            department: await this.toSnapshot(domain, tree, baseId, mode),
        } as BxDepartmentResponseDto;

        const isEmptyMultiple = mode.isMultiple && tree.general.length === 0;
        if (isEmptyMultiple) {
            this.logger.warn(
                `[${domain}] мультирежим ${targetGroup}: не найдено отделов по названию/тэгу «${mode.multipleTag ?? 'шаблоны группы'}» — пустой отдел в кэше на ${EMPTY_MULTIPLE_TTL_SECONDS} с`,
            );
        }
        return {
            snapshot,
            ttlSec: isEmptyMultiple
                ? EMPTY_MULTIPLE_TTL_SECONDS
                : DEPARTMENT_SNAPSHOT_TTL_SECONDS,
        };
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
