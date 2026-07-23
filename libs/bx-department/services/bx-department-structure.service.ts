import { Injectable, NotFoundException } from '@nestjs/common';
import dayjs from 'dayjs';
import Redis from 'ioredis';
import { RedisService } from 'src/core/redis/redis.service';
import { PBXService } from '@/modules/pbx';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    IBXDepartment,
    IBXUser,
} from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { DepartmentBitrixService } from '@/modules/bitrix/domain/department/services/department-bitrxi.service';
import { BxDepartmentService } from './bx-department.service';
import {
    BxCurrentUserDto,
    BxDepartmentStructureResponseDto,
    EBxDepartmentHeadType,
} from '../dto/bx-department-structure.dto';

/** Разбивка по одному отделу продаж (внутренний тип, структурно равен BxSalesDepartmentDto). */
interface ISalesDepartment {
    department: IBXDepartment;
    groups: IBXDepartment[];
    allUsers: IBXUser[];
}

/** Кешируемая часть структуры (без данных текущего пользователя). */
interface IStructureData {
    department: {
        department: number;
        generalDepartment: IBXDepartment[];
        childrenDepartments: IBXDepartment[];
        allUsers: IBXUser[];
    };
    salesDepartments: ISalesDepartment[];
    /** Родительские отделы найденных ОП — для определения руководителя уровня cup. */
    cupDepartments: IBXDepartment[];
}

/** Шаблоны названий отделов по группе для поиска по всей структуре. */
const DEPARTMENT_NAME_PATTERNS: Record<EDepartamentGroup, RegExp[]> = {
    [EDepartamentGroup.sales]: [/^оп(\s|$)/i, /отдел\s+продаж/i],
    [EDepartamentGroup.service]: [/^ос(\s|$)/i, /отдел\s+сервиса/i],
    [EDepartamentGroup.tmc]: [],
};

const CACHE_TTL_SECONDS = 86400;

/** Экранирование пользовательского тэга перед вставкой в RegExp. */
const escapeRegExp = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Результат PBXService.init и тип инстанса bitrix из него (без импорта класса). */
type PbxInitResult = Awaited<ReturnType<PBXService['init']>>;
type BitrixInstance = PbxInitResult['bitrix'];

/**
 * Структура отделов продаж на старом API (department.get).
 * В мультирежиме находит все ОП по всей структуре портала,
 * мерджит их в прежний формат ответа и отдаёт разбивку по ОП,
 * плюс роль текущего пользователя и его коллег.
 */
@Injectable()
export class BxDepartmentStructureService {
    private readonly redis: Redis;

    constructor(
        private readonly redisService: RedisService,
        private readonly pbx: PBXService,
        private readonly departmentService: BxDepartmentService,
    ) {
        this.redis = this.redisService.getClient();
    }

    async getStructure(
        domain: string,
        group: EDepartamentGroup = EDepartamentGroup.sales,
        userId: number,
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
        );
        const currentUser = this.buildCurrentUser(structure, userId);
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
    ): Promise<IStructureData> {
        const day = dayjs().format('MMDD');
        const mode = isMultiple
            ? `multi_${this.tagCacheKey(multipleTag)}`
            : 'single';
        const cacheKey = `department_structure_${domain}_${day}_${group}_${mode}`;

        const cached = await this.redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached) as IStructureData;
        }

        const structure = isMultiple
            ? await this.buildMultiple(bitrix, domain, group, multipleTag)
            : await this.buildSingle(domain, group);

        await this.redis.set(
            cacheKey,
            JSON.stringify(structure),
            'EX',
            CACHE_TTL_SECONDS,
        );
        return structure;
    }

    /** Часть ключа кеша по тэгу (разные тэги — разные наборы отделов). */
    private tagCacheKey(multipleTag: string | null): string {
        return (
            (multipleTag ?? '').trim().replace(/\s+/g, '-').toLowerCase() ||
            'default'
        );
    }

    /** Прежнее поведение: один базовый отдел из конфига портала. */
    private async buildSingle(
        domain: string,
        group: EDepartamentGroup,
    ): Promise<IStructureData> {
        const base = await this.departmentService.getFullDepartment(
            domain,
            group,
        );
        const { generalDepartment, childrenDepartments, allUsers } =
            base.department;

        return {
            department: base.department,
            salesDepartments: generalDepartment.map(department => ({
                department,
                groups: childrenDepartments,
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
        const patterns = this.resolvePatterns(group, multipleTag);

        const all = await bxDepartments.getDepartmentsAll();
        const opsRaw = all.filter(d => this.matchesName(d.NAME, patterns));
        if (opsRaw.length === 0) {
            throw new NotFoundException(
                `На портале ${domain} не найдено отделов группы ${group} по названию/тэгу`,
            );
        }

        const groupsRaw = all.filter(d =>
            opsRaw.some(op => Number(d.PARENT) === Number(op.ID)),
        );
        const cupDepartments = all.filter(d =>
            opsRaw.some(op => Number(op.PARENT) === Number(d.ID)),
        );

        const ops = await bxDepartments.enrichWithUsers(opsRaw);
        const groups = await bxDepartments.enrichWithUsers(groupsRaw);

        const salesDepartments: ISalesDepartment[] = ops.map(op => {
            const opGroups = groups.filter(
                g => Number(g.PARENT) === Number(op.ID),
            );
            return {
                department: op,
                groups: opGroups,
                allUsers: this.collectUsers([op, ...opGroups]),
            };
        });

        return {
            department: {
                // единого корневого id в мультирежиме нет
                department: 0,
                generalDepartment: ops,
                childrenDepartments: groups,
                allUsers: this.collectUsers([...ops, ...groups]),
            },
            salesDepartments,
            cupDepartments,
        };
    }

    /**
     * Шаблоны поиска отделов: если у отдела задан multiple_tag — ищем по нему
     * (список префиксов через пробел/запятую, напр. «ОП ОС»); иначе — прежние
     * захардкоженные шаблоны группы.
     */
    private resolvePatterns(
        group: EDepartamentGroup,
        multipleTag: string | null,
    ): RegExp[] {
        const tag = multipleTag?.trim();
        if (tag) {
            return this.tagToPatterns(tag);
        }
        return DEPARTMENT_NAME_PATTERNS[group] ?? [];
    }

    /** «ОП ОС» → [/^ОП(\s|$)/i, /^ОС(\s|$)/i]. */
    private tagToPatterns(tag: string): RegExp[] {
        return tag
            .split(/[\s,;]+/)
            .map(token => token.trim())
            .filter(Boolean)
            .map(token => new RegExp(`^${escapeRegExp(token)}(\\s|$)`, 'i'));
    }

    private matchesName(name: string, patterns: RegExp[]): boolean {
        const normalized = (name ?? '').trim();
        return patterns.some(pattern => pattern.test(normalized));
    }

    /** Уникальные (по ID) сотрудники набора отделов. */
    private collectUsers(departments: IBXDepartment[]): IBXUser[] {
        const byId = new Map<number, IBXUser>();
        for (const department of departments) {
            for (const user of department.USERS ?? []) {
                const id = Number(user?.ID);
                if (user && !Number.isNaN(id) && !byId.has(id)) {
                    byId.set(id, user);
                }
            }
        }
        return [...byId.values()];
    }

    /** Роль текущего пользователя и его коллеги. */
    private buildCurrentUser(
        structure: IStructureData,
        userId: number,
    ): BxCurrentUserDto {
        const uid = Number(userId);
        const isHeadOf = (d: IBXDepartment) => Number(d.UF_HEAD) === uid;
        const hasUser = (d: IBXDepartment) =>
            (d.USERS ?? []).some(u => Number(u?.ID) === uid);
        const withoutUser = (users: IBXUser[]) =>
            users.filter(u => Number(u?.ID) !== uid);

        const cupHeaded = structure.cupDepartments.filter(isHeadOf);
        const opHeaded = structure.salesDepartments.filter(s =>
            isHeadOf(s.department),
        );
        const groupHeaded = structure.salesDepartments
            .flatMap(s => s.groups)
            .filter(isHeadOf);

        let headOf: EBxDepartmentHeadType | null = null;
        let headOfDepartmentIds: number[] = [];
        if (cupHeaded.length > 0) {
            headOf = EBxDepartmentHeadType.cup;
            headOfDepartmentIds = cupHeaded.map(d => Number(d.ID));
        } else if (opHeaded.length > 0) {
            headOf = EBxDepartmentHeadType.op;
            headOfDepartmentIds = opHeaded.map(s => Number(s.department.ID));
        } else if (groupHeaded.length > 0) {
            headOf = EBxDepartmentHeadType.group;
            headOfDepartmentIds = groupHeaded.map(d => Number(d.ID));
        }

        // Группа пользователя: где он числится, либо которой руководит
        const myGroup =
            structure.salesDepartments.flatMap(s => s.groups).find(hasUser) ??
            groupHeaded[0];

        // ОП пользователя: где числится напрямую, через свою группу, либо которым руководит
        const myOp =
            structure.salesDepartments.find(
                s =>
                    hasUser(s.department) ||
                    (myGroup !== undefined && s.groups.includes(myGroup)),
            ) ?? opHeaded[0];

        return {
            userId: uid,
            isHead: headOf !== null,
            headOf,
            headOfDepartmentIds,
            colleagues: {
                group: withoutUser(myGroup?.USERS ?? []),
                department: withoutUser(myOp?.allUsers ?? []),
            },
        } as BxCurrentUserDto;
    }
}
