import { CallV3ApiService } from '../../../../core/base/call-v3-api.service';
import {
    EBxHrMemberRole,
    THrMemberRoleMap,
} from '../../interfaces/hr.interface';
import { HR_NODE_MEMBER } from '../schema/hr-node-member.schema';

/**
 * Участники отделов и команд (humanresources.node.member.*).
 * Не injectable — создаётся на конкретный портал через BitrixV3Service.
 */
export class BxHrNodeMemberService {
    constructor(private readonly api: CallV3ApiService) {}

    /** Добавить пользователей в узел с одной ролью */
    async add(
        nodeId: number,
        userIds: number[],
        role: EBxHrMemberRole,
    ): Promise<boolean> {
        const { success } = await this.api.call(HR_NODE_MEMBER.ADD, {
            nodeId,
            userIds,
            role,
        });
        return success;
    }

    /**
     * Задать ПОЛНЫЙ состав узла по ролям.
     * Пользователи, отсутствующие в userIds, будут удалены из узла.
     */
    async set(nodeId: number, userIds: THrMemberRoleMap): Promise<boolean> {
        const { success } = await this.api.call(HR_NODE_MEMBER.SET, {
            nodeId,
            userIds,
        });
        return success;
    }

    /** Перенести пользователей в другой узел */
    async move(
        nodeId: number,
        userIds: number[],
        role?: EBxHrMemberRole,
    ): Promise<boolean> {
        const { success } = await this.api.call(HR_NODE_MEMBER.MOVE, {
            nodeId,
            userIds,
            role,
        });
        return success;
    }

    /** Удалить пользователей из узла */
    async remove(
        nodeId: number,
        userIds: number[],
    ): Promise<{
        removed: number[];
        failed: Array<{ userId: number; reason: string }>;
    }> {
        return await this.api.call(HR_NODE_MEMBER.REMOVE, { nodeId, userIds });
    }
}
