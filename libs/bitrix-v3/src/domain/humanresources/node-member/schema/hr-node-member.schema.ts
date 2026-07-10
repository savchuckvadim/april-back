import {
    EBxHrMemberRole,
    THrMemberRoleMap,
} from '../../interfaces/hr.interface';

/** Константы методов управления участниками узла */
export const HR_NODE_MEMBER = {
    ADD: 'humanresources.node.member.add',
    SET: 'humanresources.node.member.set',
    MOVE: 'humanresources.node.member.move',
    REMOVE: 'humanresources.node.member.remove',
} as const;

/** Схема методов humanresources.node.member.* */
export interface HrNodeMemberMethods {
    'humanresources.node.member.add': {
        request: {
            nodeId: number;
            userIds: number[];
            /** Роль назначается всем из userIds; наборы ролей отдела и команды разные */
            role: EBxHrMemberRole;
        };
        response: { success: boolean };
    };
    'humanresources.node.member.set': {
        request: {
            nodeId: number;
            /**
             * Полный состав по ролям. Кого нет в объекте —
             * будет удалён из узла.
             */
            userIds: THrMemberRoleMap;
        };
        response: { success: boolean };
    };
    'humanresources.node.member.move': {
        request: {
            /** Целевой узел */
            nodeId: number;
            userIds: number[];
            /** По умолчанию EMPLOYEE / TEAM_EMPLOYEE */
            role?: EBxHrMemberRole;
        };
        response: { success: boolean };
    };
    'humanresources.node.member.remove': {
        request: { nodeId: number; userIds: number[] };
        response: {
            removed: number[];
            failed: Array<{ userId: number; reason: string }>;
        };
    };
}
