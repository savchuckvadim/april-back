import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import dayjs from 'dayjs';
import Redis from 'ioredis';
import { RedisService } from 'src/core/redis/redis.service';
import { PBXService } from '@/modules/pbx';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    EnumPortalAppCode,
    parseUserIds,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { DepartmentBitrixService } from '@/modules/bitrix/domain/department/services/department-bitrxi.service';
import { BxDepartmentService } from './bx-department.service';
import { BxDepartmentHeadsService } from './bx-department-heads.service';
import { BxSuperUserService } from './bx-super-user.service';
import { withHeads } from '../lib/department-heads.util';
import {
    EMPTY_FORCED_VISIBILITY,
    ForcedVisibilityLists,
} from '../lib/forced-visibility.util';
import {
    collectUsers,
    isGroupName,
    matchesName,
    resolvePatterns,
    tagCacheKey,
} from '../lib/department-match.util';
import { buildCurrentUser } from '../lib/current-user.util';
import { ISalesDepartment, IStructureData } from '../lib/structure-data.types';
import { BxDepartmentStructureResponseDto } from '../dto/bx-department-structure.dto';

const CACHE_TTL_SECONDS = 86400;

/** Результат PBXService.init и тип инстанса bitrix из него (без импорта класса). */
type PbxInitResult = Awaited<ReturnType<PBXService['init']>>;
type BitrixInstance = PbxInitResult['bitrix'];

/**
 * Структура отделов продаж на старом API (department.get).
 * В мультирежиме находит все ОП по всей структуре портала,
 * мерджит их в прежний формат ответа и отдаёт разбивку по ОП,
 * плюс роль текущего пользователя и его коллег (суперпользователь
 * вендора из BX_SUPER_USER_IDS получает видимость all).
 */
@Injectable()
export class BxDepartmentStructureService {
    private readonly logger = new Logger(BxDepartmentStructureService.name);
    private readonly redis: Redis;

    constructor(
        private readonly redisService: RedisService,
        private readonly pbx: PBXService,
        private readonly departmentService: BxDepartmentService,
        private readonly heads: BxDepartmentHeadsService,
        private readonly appSettings: PortalAppSettingsService,
        private readonly superUsers: BxSuperUserService,
    ) {
        this.redis = this.redisService.getClient();
    }

    async getStructure(
        domain: string,
        group: EDepartamentGroup = EDepartamentGroup.sales,
        userId: number,
        resetCache = false,
    ): Promise<BxDepartmentStructureResponseDto> {
        // Один init на запрос: bitrix и локальный портал берём вместе и
        // протягиваем параметрами (в this их класть нельзя — разные порталы
        // должны получать разные инстансы bitrix/portal, иначе race condition).
        const { bitrix, internalPortal } = await this.pbx.init(domain);
        const department = internalPortal?.departaments?.find(
            d => d.group === group,
        );
        // Мультирежим и тэг поиска — из БД, а не из внешнего запроса.
        const isMultiple = department?.is_multiple ?? false;
        const multipleTag = department?.multiple_tag ?? null;

        const structure = await this.getStructureData(
            bitrix,
            domain,
            group,
            isMultiple,
            multipleTag,
            resetCache,
        );
        const forced = await this.resolveForcedVisibility(domain, group);
        const currentUser = buildCurrentUser(structure, userId, {
            forced,
            isSuperUser: this.superUsers.isSuperUser(domain, Number(userId)),
        });
        return {
            isMultiple,
            multipleTag,
            department: structure.department,
            salesDepartments: structure.salesDepartments,
            currentUser,
        } as BxDepartmentStructureResponseDto;
    }

    /** Структура без пользовательской части — кешируется на сутки. */
    private async getStructureData(
        bitrix: BitrixInstance,
        domain: string,
        group: EDepartamentGroup,
        isMultiple: boolean,
        multipleTag: string | null,
        resetCache: boolean,
    ): Promise<IStructureData> {
        const day = dayjs().format('MMDD');
        const mode = isMultiple
            ? `multi_${tagCacheKey(multipleTag)}`
            : 'single';
        // v2: группы фильтруются по названию «Группа…»; v3: список HEADS
        // (структура v3 + UF_HEAD). Менять синхронно с BxDepartmentCacheService.
        const cacheKey = `department_structure_v3_${domain}_${day}_${group}_${mode}`;

        if (!resetCache) {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached) as IStructureData;
            }
        }

        const structure = isMultiple
            ? await this.buildMultiple(bitrix, domain, group, multipleTag)
            : await this.buildSingle(domain, group, resetCache);

        await this.redis.set(
            cacheKey,
            JSON.stringify(structure),
            'EX',
            CACHE_TTL_SECONDS,
        );
        return structure;
    }

    /** Прежнее поведение: один базовый отдел из конфига портала. */
    private async buildSingle(
        domain: string,
        group: EDepartamentGroup,
        resetCache: boolean,
    ): Promise<IStructureData> {
        const base = await this.departmentService.getFullDepartment(
            domain,
            group,
            resetCache,
        );
        const { generalDepartment, childrenDepartments, allUsers } =
            base.department;

        return {
            department: base.department,
            salesDepartments: generalDepartment.map(department => ({
                department,
                groups: childrenDepartments.filter(d => isGroupName(d.NAME)),
                allUsers,
            })),
            cupDepartments: [],
        };
    }

    /** Мультирежим: все ОП группы по всей структуре портала. */
    private async buildMultiple(
        bitrix: BitrixInstance,
        domain: string,
        group: EDepartamentGroup,
        multipleTag: string | null,
    ): Promise<IStructureData> {
        const bxDepartments = new DepartmentBitrixService(bitrix);
        const patterns = resolvePatterns(group, multipleTag);

        const all = await bxDepartments.getDepartmentsAll();
        const opsRaw = all.filter(d => matchesName(d.NAME, patterns));
        if (opsRaw.length === 0) {
            throw new NotFoundException(
                `На портале ${domain} не найдено отделов группы ${group} по названию/тэгу`,
            );
        }

        const childrenRaw = all.filter(d =>
            opsRaw.some(op => Number(d.PARENT) === Number(op.ID)),
        );
        const cupRaw = all.filter(d =>
            opsRaw.some(op => Number(op.PARENT) === Number(d.ID)),
        );

        const opsWithUsers = await bxDepartments.enrichWithUsers(opsRaw);
        const childrenWithUsers =
            await bxDepartments.enrichWithUsers(childrenRaw);

        // Руководители: структура v3 (руководитель + заместители) ∪ легаси
        // UF_HEAD — одним проходом по ОП, их подотделам и родителям.
        const v3Heads = await this.heads.resolve(domain, [
            ...opsWithUsers,
            ...childrenWithUsers,
            ...cupRaw,
        ]);
        const ops = withHeads(opsWithUsers, v3Heads);
        const children = withHeads(childrenWithUsers, v3Heads);
        const cupDepartments = withHeads(cupRaw, v3Heads);

        const salesDepartments: ISalesDepartment[] = ops.map(op => {
            const opChildren = children.filter(
                g => Number(g.PARENT) === Number(op.ID),
            );
            return {
                department: op,
                // группами считаются только «Группа…», но сотрудники
                // прочих подотделов остаются в allUsers отдела
                groups: opChildren.filter(d => isGroupName(d.NAME)),
                allUsers: collectUsers([op, ...opChildren]),
            };
        });

        return {
            department: {
                // единого корневого id в мультирежиме нет
                department: 0,
                generalDepartment: ops,
                childrenDepartments: children,
                allUsers: collectUsers([...ops, ...children]),
            },
            salesDepartments,
            cupDepartments,
        };
    }

    /**
     * Списки принудительной видимости из настроек портала, блок «Отдел
     * продаж» (visibility_*_user_ids). Только для группы sales; недоступные
     * настройки — пустые списки с warn, роли считаются по структуре.
     */
    private async resolveForcedVisibility(
        domain: string,
        group: EDepartamentGroup,
    ): Promise<ForcedVisibilityLists> {
        if (group !== EDepartamentGroup.sales) return EMPTY_FORCED_VISIBILITY;
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.sales,
            );
            return {
                group: parseUserIds(settings.visibilityGroupUserIds),
                department: parseUserIds(settings.visibilityDepartmentUserIds),
                all: parseUserIds(settings.visibilityAllUserIds),
            };
        } catch (error) {
            this.logger.warn(
                `[${domain}] настройки видимости («Отдел продаж») недоступны, роли по структуре: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return EMPTY_FORCED_VISIBILITY;
        }
    }
}
