import { NotFoundException } from '@nestjs/common';
import { RedisService } from 'src/core/redis/redis.service';
import { PBXService } from '@/modules/pbx';
import {
    BitrixV3ServiceFactory,
    EBxHrMemberRole,
    EBxHrNodeType,
    IBXHrNodeTree,
} from '@lib/bitrix-v3';
import { BxTeamService } from '../services/bx-team.service';
import { EBxTeamGroup } from '../dto/bx-team.dto';

const DOMAIN = 'example.bitrix24.ru';

function teamNode(id: number, name: string) {
    return {
        id,
        name,
        type: EBxHrNodeType.TEAM,
        structureId: 1,
        parentId: 1,
        description: '',
        accessCode: `SN${id}`,
        userCount: 1,
        colorName: null,
        xmlId: null,
        createdAt: null,
        updatedAt: null,
    };
}

function tree(id: number, name: string): IBXHrNodeTree {
    return {
        node: {
            ...teamNode(id, name),
            members: [
                {
                    userId: 447,
                    name: 'Савчук Вадим',
                    workPosition: null,
                    role: EBxHrMemberRole.TEAM_HEAD,
                    avatar: null,
                    url: '/company/personal/user/447/',
                },
            ],
        },
        children: [],
    };
}

describe('BxTeamService', () => {
    let redisGet: jest.Mock;
    let redisSet: jest.Mock;
    let search: jest.Mock;
    let getTeams: jest.Mock;
    let getSubtreeWithMembers: jest.Mock;
    let factoryCreate: jest.Mock;
    let service: BxTeamService;

    beforeEach(() => {
        redisGet = jest.fn().mockResolvedValue(null);
        redisSet = jest.fn().mockResolvedValue('OK');
        search = jest.fn().mockResolvedValue([]);
        getTeams = jest.fn().mockResolvedValue([]);
        getSubtreeWithMembers = jest.fn();

        const bitrixV3 = {
            hr: { node: { search, getTeams, getSubtreeWithMembers } },
        };
        factoryCreate = jest.fn().mockReturnValue(bitrixV3);

        const redisService = {
            getClient: () => ({ get: redisGet, set: redisSet }),
        } as unknown as RedisService;
        const pbx = {
            init: jest.fn().mockResolvedValue({
                portal: { domain: DOMAIN, C_REST_WEB_HOOK_URL: 'rest/1/abc' },
            }),
        } as unknown as PBXService;
        const factory = {
            create: factoryCreate,
        } as unknown as BitrixV3ServiceFactory;

        service = new BxTeamService(redisService, pbx, factory);
    });

    it('sales: ищет команду ЦУП и возвращает дерево', async () => {
        search.mockResolvedValue([teamNode(57, 'ЦУП')]);
        getSubtreeWithMembers.mockResolvedValue(tree(57, 'ЦУП'));

        const result = await service.getTeam(DOMAIN, EBxTeamGroup.sales);

        expect(search).toHaveBeenCalledWith(EBxHrNodeType.TEAM, 'ЦУП');
        expect(getSubtreeWithMembers).toHaveBeenCalledWith(57);
        expect(result.team.node.name).toBe('ЦУП');
        expect(result.team.node.members[0].userId).toBe(447);
        expect(factoryCreate).toHaveBeenCalledWith({
            domain: DOMAIN,
            webhook: 'rest/1/abc',
        });
    });

    it('service: ищет команду Отдел сервиса', async () => {
        search.mockResolvedValue([teamNode(70, 'Отдел сервиса')]);
        getSubtreeWithMembers.mockResolvedValue(tree(70, 'Отдел сервиса'));

        const result = await service.getTeam(DOMAIN, EBxTeamGroup.service);

        expect(search).toHaveBeenCalledWith(
            EBxHrNodeType.TEAM,
            'Отдел сервиса',
        );
        expect(result.team.node.id).toBe(70);
    });

    it('группа по умолчанию — sales', async () => {
        search.mockResolvedValue([teamNode(57, 'ЦУП')]);
        getSubtreeWithMembers.mockResolvedValue(tree(57, 'ЦУП'));

        await service.getTeam(DOMAIN);

        expect(search).toHaveBeenCalledWith(EBxHrNodeType.TEAM, 'ЦУП');
    });

    it('предпочитает точное совпадение имени частичному', async () => {
        search.mockResolvedValue([
            teamNode(90, 'ЦУП резерв'),
            teamNode(57, 'ЦУП'),
        ]);
        getSubtreeWithMembers.mockResolvedValue(tree(57, 'ЦУП'));

        await service.getTeam(DOMAIN, EBxTeamGroup.sales);

        expect(getSubtreeWithMembers).toHaveBeenCalledWith(57);
    });

    it('fallback: search пуст — точное совпадение по полному списку команд', async () => {
        search.mockResolvedValue([]);
        getTeams.mockResolvedValue([
            teamNode(1, 'Другая'),
            teamNode(57, ' цуп '),
        ]);
        getSubtreeWithMembers.mockResolvedValue(tree(57, 'ЦУП'));

        await service.getTeam(DOMAIN, EBxTeamGroup.sales);

        expect(getTeams).toHaveBeenCalledWith(['id', 'name']);
        expect(getSubtreeWithMembers).toHaveBeenCalledWith(57);
    });

    it('бросает NotFoundException, если команды нет нигде', async () => {
        search.mockResolvedValue([]);
        getTeams.mockResolvedValue([teamNode(1, 'Другая')]);

        await expect(
            service.getTeam(DOMAIN, EBxTeamGroup.sales),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(getSubtreeWithMembers).not.toHaveBeenCalled();
    });

    it('возвращает результат из кеша без похода в Битрикс', async () => {
        const cached = { team: tree(57, 'ЦУП') };
        redisGet.mockResolvedValue(JSON.stringify(cached));

        const result = await service.getTeam(DOMAIN, EBxTeamGroup.sales);

        expect(result.team.node.id).toBe(57);
        expect(factoryCreate).not.toHaveBeenCalled();
        expect(search).not.toHaveBeenCalled();
    });

    it('resetCache: не читает кеш, но перезаписывает его свежими данными', async () => {
        redisGet.mockResolvedValue(JSON.stringify({ team: tree(1, 'Старая') }));
        search.mockResolvedValue([teamNode(57, 'ЦУП')]);
        getSubtreeWithMembers.mockResolvedValue(tree(57, 'ЦУП'));

        const result = await service.getTeam(DOMAIN, EBxTeamGroup.sales, true);

        expect(redisGet).not.toHaveBeenCalled();
        expect(result.team.node.id).toBe(57);
        expect(redisSet).toHaveBeenCalledWith(
            expect.stringContaining(`bx_team_${DOMAIN}_`),
            expect.any(String),
            'EX',
            86400,
        );
    });

    it('кеширует результат с TTL', async () => {
        search.mockResolvedValue([teamNode(57, 'ЦУП')]);
        getSubtreeWithMembers.mockResolvedValue(tree(57, 'ЦУП'));

        await service.getTeam(DOMAIN, EBxTeamGroup.sales);

        expect(redisSet).toHaveBeenCalledWith(
            expect.stringContaining(`bx_team_${DOMAIN}_`),
            expect.any(String),
            'EX',
            86400,
        );
    });
});
