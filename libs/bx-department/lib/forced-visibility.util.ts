import {
    EBxDepartmentHeadType,
    EBxHeadOfSource,
    EBxVisibilityLevel,
} from '../dto/bx-department-structure.dto';

/**
 * Уровень видимости по структурной роли: cup → all, op → department,
 * group → group, не руководитель → own. Словарь для фронтов отчётов.
 */
export const visibilityOf = (
    headOf: EBxDepartmentHeadType | null,
): EBxVisibilityLevel => {
    switch (headOf) {
        case EBxDepartmentHeadType.cup:
            return EBxVisibilityLevel.all;
        case EBxDepartmentHeadType.op:
            return EBxVisibilityLevel.department;
        case EBxDepartmentHeadType.group:
            return EBxVisibilityLevel.group;
        default:
            return EBxVisibilityLevel.own;
    }
};

const HEAD_OF_BY_LEVEL: Record<
    Exclude<EBxVisibilityLevel, EBxVisibilityLevel.own>,
    EBxDepartmentHeadType
> = {
    [EBxVisibilityLevel.group]: EBxDepartmentHeadType.group,
    [EBxVisibilityLevel.department]: EBxDepartmentHeadType.op,
    [EBxVisibilityLevel.all]: EBxDepartmentHeadType.cup,
};

const RANK: Record<EBxVisibilityLevel, number> = {
    [EBxVisibilityLevel.own]: 0,
    [EBxVisibilityLevel.group]: 1,
    [EBxVisibilityLevel.department]: 2,
    [EBxVisibilityLevel.all]: 3,
};

/**
 * Списки принудительной видимости из настроек портала, блок «Отдел продаж»
 * (`visibility_group_user_ids`, `visibility_department_user_ids`,
 * `visibility_all_user_ids`), уже разобранные в Bitrix ID.
 */
export interface ForcedVisibilityLists {
    group: number[];
    department: number[];
    all: number[];
}

export const EMPTY_FORCED_VISIBILITY: ForcedVisibilityLists = Object.freeze({
    group: [] as number[],
    department: [] as number[],
    all: [] as number[],
});

/** Высший принудительный уровень пользователя; null — ни в одном списке. */
export const forcedLevelFor = (
    userId: number,
    lists: ForcedVisibilityLists,
): EBxVisibilityLevel | null => {
    if (lists.all.includes(userId)) return EBxVisibilityLevel.all;
    if (lists.department.includes(userId)) {
        return EBxVisibilityLevel.department;
    }
    if (lists.group.includes(userId)) return EBxVisibilityLevel.group;
    return null;
};

/** Роль по структуре Битрикса (HEADS отделов). */
export interface StructuralRole {
    headOf: EBxDepartmentHeadType | null;
    headOfDepartmentIds: number[];
}

/** Где пользователь числится — нужно, чтобы принудительный уровень получил периметр. */
export interface VisibilityMembership {
    /** Своя группа («Группа …» внутри ОП), где числится. */
    myGroupId: number | null;
    /** Свой ОП: напрямую, через группу или подотдел. */
    myOpId: number | null;
    /** Все ОП структуры (в мультирежиме — несколько). */
    allOpIds: number[];
}

export interface ResolvedRole extends StructuralRole {
    visibility: EBxVisibilityLevel;
    headOfSource: EBxHeadOfSource;
}

/**
 * Принудительный уровень поверх структурного (решения владельца 05.09.2026):
 *  - итог = максимум из двух; настройка никогда не понижает;
 *  - group без своей группы → department; department без своего ОП → all;
 *  - all → headOf=cup, periметр = все ОП;
 *  - сработала настройка → headOfSource=settings, иначе structure.
 */
export const applyForcedVisibility = (
    structural: StructuralRole,
    forcedLevel: EBxVisibilityLevel | null,
    membership: VisibilityMembership,
): ResolvedRole => {
    const structuralLevel = visibilityOf(structural.headOf);
    if (forcedLevel === null || RANK[forcedLevel] <= RANK[structuralLevel]) {
        return {
            ...structural,
            visibility: structuralLevel,
            headOfSource: EBxHeadOfSource.structure,
        };
    }

    let level = forcedLevel;
    if (level === EBxVisibilityLevel.group && membership.myGroupId === null) {
        level = EBxVisibilityLevel.department;
    }
    if (level === EBxVisibilityLevel.department && membership.myOpId === null) {
        level = EBxVisibilityLevel.all;
    }

    const headOfDepartmentIds =
        level === EBxVisibilityLevel.group
            ? [membership.myGroupId as number]
            : level === EBxVisibilityLevel.department
              ? [membership.myOpId as number]
              : [...membership.allOpIds];

    return {
        headOf: HEAD_OF_BY_LEVEL[level],
        headOfDepartmentIds,
        visibility: level,
        headOfSource: EBxHeadOfSource.settings,
    };
};
