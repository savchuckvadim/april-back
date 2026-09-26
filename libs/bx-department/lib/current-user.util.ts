import {
    IBXDepartment,
    IBXUser,
} from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import {
    BxCurrentUserDto,
    EBxDepartmentHeadType,
    EBxHeadOfSource,
    EBxVisibilityLevel,
} from '../dto/bx-department-structure.dto';
import { BXUserDto } from '../dto/bx-user.dto';
import { legacyHeadsOf, toPositiveInt } from './department-heads.util';
import {
    applyForcedVisibility,
    forcedLevelFor,
    ForcedVisibilityLists,
    StructuralRole,
} from './forced-visibility.util';
import { ISalesDepartment, IStructureData } from './structure-data.types';

/**
 * Роль текущего пользователя поверх структуры отделов (чистые функции
 * BxDepartmentStructureService): структура HEADS → принудительная
 * видимость настроек «Отдел продаж» → суперпользователь вендора.
 */

/** Что, кроме структуры, влияет на роль текущего пользователя. */
export interface CurrentUserContext {
    /** Списки принудительной видимости настроек «Отдел продаж». */
    forced: ForcedVisibilityLists;
    /** Суперпользователь вендора (env BX_SUPER_USER_IDS, BxSuperUserService). */
    isSuperUser: boolean;
}

/** Отделы, которыми руководит пользователь, по уровням. */
interface HeadedDepartments {
    cup: IBXDepartment[];
    op: ISalesDepartment[];
    group: IBXDepartment[];
}

/** Где пользователь числится (либо чем руководит). */
interface Membership {
    myGroup: IBXDepartment | undefined;
    myOp: ISalesDepartment | undefined;
}

const hasUserId = (users: IBXUser[] | null | undefined, uid: number) =>
    (users ?? []).some(user => Number(user?.ID) === uid);

/**
 * Сырые пользователи Битрикса → DTO ответа: поля те же, ID Битрикс
 * отдаёт числом или строкой — форма не меняется, меняется только тип.
 */
const toUserDtos = (users: IBXUser[]): BXUserDto[] => users as BXUserDto[];

/**
 * Руководитель — по списку HEADS (структура v3 + UF_HEAD): второй
 * руководитель и заместители тоже. Сырой UF_HEAD — страховка для
 * отдела без списка.
 */
const headedBy = (
    structure: IStructureData,
    uid: number,
): HeadedDepartments => {
    const isHeadOf = (d: IBXDepartment) =>
        (d.HEADS ?? legacyHeadsOf(d)).includes(uid);
    return {
        cup: structure.cupDepartments.filter(isHeadOf),
        op: structure.salesDepartments.filter(s => isHeadOf(s.department)),
        group: structure.salesDepartments
            .flatMap(s => s.groups)
            .filter(isHeadOf),
    };
};

/** Структурная роль — высший из уровней, которыми руководит. */
const structuralRoleOf = (headed: HeadedDepartments): StructuralRole => {
    if (headed.cup.length > 0) {
        return {
            headOf: EBxDepartmentHeadType.cup,
            headOfDepartmentIds: headed.cup.map(d => Number(d.ID)),
        };
    }
    if (headed.op.length > 0) {
        return {
            headOf: EBxDepartmentHeadType.op,
            headOfDepartmentIds: headed.op.map(s => Number(s.department.ID)),
        };
    }
    if (headed.group.length > 0) {
        return {
            headOf: EBxDepartmentHeadType.group,
            headOfDepartmentIds: headed.group.map(d => Number(d.ID)),
        };
    }
    return { headOf: null, headOfDepartmentIds: [] };
};

/**
 * Группа — где числится, либо которой руководит; ОП — где числится
 * напрямую, через свою группу или негрупповой подотдел (allUsers), либо
 * которым руководит.
 */
const membershipOf = (
    structure: IStructureData,
    uid: number,
    headed: HeadedDepartments,
): Membership => {
    const myGroup =
        structure.salesDepartments
            .flatMap(s => s.groups)
            .find(d => hasUserId(d.USERS, uid)) ?? headed.group[0];
    const inOp = (s: ISalesDepartment) =>
        hasUserId(s.department.USERS, uid) ||
        (myGroup !== undefined && s.groups.includes(myGroup)) ||
        hasUserId(s.allUsers, uid);
    const myOp = structure.salesDepartments.find(inOp) ?? headed.op[0];
    return { myGroup, myOp };
};

/** ID всех ОП структуры (в мультирежиме — несколько). */
export const allOpIdsOf = (structure: IStructureData): number[] =>
    structure.salesDepartments.map(s => Number(s.department.ID));

/**
 * Суперпользователь вендора: видимость all поверх структуры и настроек
 * (headOf = cup, периметр — все ОП, источник superuser). isHead и коллеги
 * остаются как по структуре — он не становится руководителем портала.
 */
export const applySuperUser = (
    user: BxCurrentUserDto,
    allOpIds: number[],
): BxCurrentUserDto => ({
    ...user,
    headOf: EBxDepartmentHeadType.cup,
    headOfDepartmentIds: [...allOpIds],
    visibility: EBxVisibilityLevel.all,
    headOfSource: EBxHeadOfSource.superuser,
    isSuperUser: true,
});

/** Роль текущего пользователя (структура + настройки + вендор) и его коллеги. */
export const buildCurrentUser = (
    structure: IStructureData,
    userId: number,
    context: CurrentUserContext,
): BxCurrentUserDto => {
    const uid = Number(userId);
    const headed = headedBy(structure, uid);
    const { myGroup, myOp } = membershipOf(structure, uid, headed);
    const allOpIds = allOpIdsOf(structure);

    const role = applyForcedVisibility(
        structuralRoleOf(headed),
        forcedLevelFor(uid, context.forced),
        {
            myGroupId: toPositiveInt(myGroup?.ID),
            myOpId: toPositiveInt(myOp?.department.ID),
            allOpIds,
        },
    );
    const withoutUser = (users: IBXUser[]) =>
        toUserDtos(users.filter(u => Number(u?.ID) !== uid));

    const user: BxCurrentUserDto = {
        userId: uid,
        isHead: role.headOf !== null,
        headOf: role.headOf,
        headOfDepartmentIds: role.headOfDepartmentIds,
        visibility: role.visibility,
        headOfSource: role.headOfSource,
        isSuperUser: false,
        colleagues: {
            group: withoutUser(myGroup?.USERS ?? []),
            department: withoutUser(myOp?.allUsers ?? []),
        },
    };
    return context.isSuperUser && uid > 0
        ? applySuperUser(user, allOpIds)
        : user;
};
