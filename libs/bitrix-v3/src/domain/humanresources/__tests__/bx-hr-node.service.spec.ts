import { CallV3ApiService } from '../../../core/base/call-v3-api.service';
import { BxHrNodeService } from '../node/services/bx-hr-node.service';
import { EBxHrMemberRole, EBxHrNodeType } from '../interfaces/hr.interface';

function node(id: number, parentId: number | null, name = `node-${id}`) {
    return {
        id,
        name,
        type: EBxHrNodeType.TEAM,
        structureId: 1,
        parentId,
        description: '',
        accessCode: `SN${id}`,
        userCount: 1,
        colorName: null,
        xmlId: null,
        createdAt: null,
        updatedAt: null,
    };
}

describe('BxHrNodeService', () => {
    let call: jest.Mock;
    let callAll: jest.Mock;
    let service: BxHrNodeService;

    beforeEach(() => {
        call = jest.fn();
        callAll = jest.fn();
        service = new BxHrNodeService({
            call,
            callAll,
        } as unknown as CallV3ApiService);
    });

    it('getTeams выкачивает все команды через callAll', async () => {
        callAll.mockResolvedValue([node(57, 1, 'ЦУП')]);

        const teams = await service.getTeams();

        expect(callAll).toHaveBeenCalledWith('humanresources.node.list', {
            type: EBxHrNodeType.TEAM,
            select: undefined,
        });
        expect(teams[0].name).toBe('ЦУП');
    });

    it('getWithMembers запрашивает все поля и гарантирует members', async () => {
        call.mockResolvedValue({ item: node(57, 1) });

        const result = await service.getWithMembers(57);

        expect(call).toHaveBeenCalledWith('humanresources.node.get', {
            id: 57,
            select: expect.arrayContaining(['members']) as string[],
        });
        expect(result.members).toEqual([]);
    });

    it('getSubtreeWithMembers рекурсивно собирает дерево', async () => {
        const members = [
            {
                userId: 447,
                name: 'Вадим',
                workPosition: null,
                role: EBxHrMemberRole.TEAM_HEAD,
                avatar: null,
                url: '/company/personal/user/447/',
            },
        ];
        call.mockImplementation(
            (method: string, params: { id: number }): Promise<unknown> => {
                if (method === 'humanresources.node.get') {
                    return Promise.resolve({
                        item: { ...node(params.id, null), members },
                    });
                }
                // children: у корня 57 — два ребёнка, у остальных пусто
                return Promise.resolve({
                    items: params.id === 57 ? [node(59, 57), node(61, 57)] : [],
                });
            },
        );

        const tree = await service.getSubtreeWithMembers(57);

        expect(tree.node.id).toBe(57);
        expect(tree.node.members).toHaveLength(1);
        expect(tree.children.map(c => c.node.id)).toEqual([59, 61]);
        expect(tree.children[0].children).toHaveLength(0);
    });

    it('count возвращает количества отделов и команд', async () => {
        call.mockResolvedValue({ departments: 13, teams: 5 });

        await expect(service.count()).resolves.toEqual({
            departments: 13,
            teams: 5,
        });
        expect(call).toHaveBeenCalledWith('humanresources.node.count', {});
    });

    it('move проксирует id и parentId', async () => {
        call.mockResolvedValue(node(59, 60));

        const moved = await service.move(59, 60);

        expect(call).toHaveBeenCalledWith('humanresources.node.move', {
            id: 59,
            parentId: 60,
        });
        expect(moved.parentId).toBe(60);
    });
});
