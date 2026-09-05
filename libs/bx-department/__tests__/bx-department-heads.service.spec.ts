import { Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import {
    BitrixV3ServiceFactory,
    EBxHrMemberRole,
    IBXHrNodeMember,
} from '@lib/bitrix-v3';
import { IBXDepartment } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { BxDepartmentHeadsService } from '../services/bx-department-heads.service';

const DOMAIN = 'april-garant.bitrix24.ru';

const dep = (ID: number | string, NAME: string): IBXDepartment =>
    ({ ID, NAME, PARENT: '1', SORT: 1 }) as IBXDepartment;

const member = (userId: number, role: EBxHrMemberRole): IBXHrNodeMember => ({
    userId,
    name: `User ${userId}`,
    workPosition: null,
    role,
    avatar: null,
    url: `/company/personal/user/${userId}/`,
});

// Живой портал 05.09.2026: узел 12 «КМВ» = отдел 620 (accessCode D620),
// руководитель 107, заместитель 1; узел 26 «Группа 1» = отдел 938.
const NODES = [
    { id: 12, accessCode: 'D620' },
    { id: 26, accessCode: 'D938' },
    { id: 57, accessCode: 'SN57' }, // команда — не отдел
];

const MEMBERS_BY_NODE: Record<number, IBXHrNodeMember[]> = {
    12: [
        member(1, EBxHrMemberRole.DEPUTY_HEAD),
        member(101, EBxHrMemberRole.EMPLOYEE),
        member(107, EBxHrMemberRole.HEAD),
    ],
    26: [member(1, EBxHrMemberRole.HEAD)],
};

describe('BxDepartmentHeadsService', () => {
    let getDepartments: jest.Mock;
    let getWithMembers: jest.Mock;
    let factoryCreate: jest.Mock;
    let pbxInit: jest.Mock;
    let warn: jest.SpyInstance;
    let service: BxDepartmentHeadsService;

    beforeEach(() => {
        getDepartments = jest.fn().mockResolvedValue(NODES);
        getWithMembers = jest.fn((id: number) =>
            Promise.resolve({ id, members: MEMBERS_BY_NODE[id] ?? [] }),
        );
        factoryCreate = jest.fn().mockReturnValue({
            hr: { node: { getDepartments, getWithMembers } },
        });
        pbxInit = jest.fn().mockResolvedValue({
            portal: { domain: DOMAIN, C_REST_WEB_HOOK_URL: 'rest/1/abc' },
        });
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);

        service = new BxDepartmentHeadsService(
            { init: pbxInit } as unknown as PBXService,
            { create: factoryCreate } as unknown as BitrixV3ServiceFactory,
        );
    });

    afterEach(() => {
        warn.mockRestore();
    });

    it('сопоставляет отделы по accessCode и отдаёт руководителя первым, зама вторым', async () => {
        const result = await service.resolve(DOMAIN, [
            dep(620, 'КМВ'),
            dep(938, 'Группа 1'),
        ]);

        expect([...result]).toEqual([
            [620, [107, 1]],
            [938, [1]],
        ]);
        expect(factoryCreate).toHaveBeenCalledWith({
            domain: DOMAIN,
            webhook: 'rest/1/abc',
        });
        expect(getDepartments).toHaveBeenCalledWith(['id', 'accessCode']);
        // участники читаются node.get только по нужным узлам
        expect(getWithMembers).toHaveBeenCalledTimes(2);
        expect(getWithMembers).toHaveBeenCalledWith(12);
        expect(getWithMembers).toHaveBeenCalledWith(26);
    });

    it('ID отдела строкой и дубли на входе: один узел читается один раз', async () => {
        const result = await service.resolve(DOMAIN, [
            dep('620', 'КМВ'),
            dep(620, 'КМВ'),
        ]);

        expect(result.get(620)).toEqual([107, 1]);
        expect(getWithMembers).toHaveBeenCalledTimes(1);
    });

    it('отдел без узла в v3: в карте отсутствует, в лог warn, остальные читаются', async () => {
        const result = await service.resolve(DOMAIN, [
            dep(620, 'КМВ'),
            dep(944, 'Группа 2'),
        ]);

        expect(result.has(944)).toBe(false);
        expect(result.get(620)).toEqual([107, 1]);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('944 «Группа 2» не найден'),
        );
    });

    it('v3 недоступна (нет вебхука/скоупа): пустая карта, без исключения', async () => {
        getDepartments.mockRejectedValue(
            new Error('INSUFFICIENTSCOPEEXCEPTION'),
        );

        const result = await service.resolve(DOMAIN, [dep(620, 'КМВ')]);

        expect(result.size).toBe(0);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('INSUFFICIENTSCOPEEXCEPTION'),
        );
    });

    it('ошибка чтения одного узла не ломает остальные', async () => {
        getWithMembers.mockImplementation((id: number) =>
            id === 26
                ? Promise.reject(new Error('timeout'))
                : Promise.resolve({ id, members: MEMBERS_BY_NODE[id] }),
        );

        const result = await service.resolve(DOMAIN, [
            dep(620, 'КМВ'),
            dep(938, 'Группа 1'),
        ]);

        expect(result.get(620)).toEqual([107, 1]);
        expect(result.has(938)).toBe(false);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('timeout'));
    });

    it('узел без руководителей: пустой список (не отсутствие ключа)', async () => {
        getWithMembers.mockResolvedValue({
            id: 12,
            members: [member(101, EBxHrMemberRole.EMPLOYEE)],
        });

        const result = await service.resolve(DOMAIN, [dep(620, 'КМВ')]);

        expect(result.get(620)).toEqual([]);
    });

    it('пустой вход: в Битрикс не ходит', async () => {
        const result = await service.resolve(DOMAIN, []);

        expect(result.size).toBe(0);
        expect(pbxInit).not.toHaveBeenCalled();
    });
});
