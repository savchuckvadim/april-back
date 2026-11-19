import { ForbiddenException } from '@nestjs/common';
import type { CallPageLeadService, CallPageLinkService } from '@lib/call-lib';
import type { RequesterAccess } from '../../domain/access/perimeter.util';
import type { CallClientTitlesService } from '../call-client-titles.service';
import type { CallListIndexLoader } from '../calls-list-index.loader';
import { CallsListUseCase } from '../calls-list.use-case';
import type { CallsListRequestDto } from '../dto/calls-list-request.dto';
import { indexOf, reviewOf, rowOf } from './calls-list.fixtures';

const DOMAIN = 'gsr.bitrix24.ru';

const LEADER: RequesterAccess = {
    role: 'op',
    visibleManagerIds: ['447', '10'],
};
const SUPER: RequesterAccess = {
    role: 'cup',
    visibleManagerIds: null,
    isSuperUser: true,
};
const MANAGER: RequesterAccess = {
    role: 'manager',
    visibleManagerIds: ['447'],
};

const dtoOf = (
    fields: Partial<CallsListRequestDto> = {},
): CallsListRequestDto =>
    ({
        domain: DOMAIN,
        requesterUserId: '10',
        from: '2026-11-01',
        to: '2026-11-19',
        ...fields,
    }) as CallsListRequestDto;

function harness() {
    const index = indexOf(
        [
            rowOf('1', { managerId: '447', startedAt: '2026-11-03T08:00:00Z' }),
            rowOf('2', { managerId: '512', startedAt: '2026-11-04T08:00:00Z' }),
            rowOf('3', { managerId: '447', startedAt: '2026-11-05T08:00:00Z' }),
            rowOf('4', { managerId: '447', startedAt: '2026-11-06T08:00:00Z' }),
        ],
        { '3': [reviewOf('10', { agree: false, leaderScore: 3 })] },
        { '447': 'Иванова Мария' },
    );
    const loader = { load: jest.fn(() => Promise.resolve(index)) };
    const clients = {
        titlesFor: jest.fn((_d: string, ids: readonly string[]) =>
            Promise.resolve(new Map(ids.map(id => [id, `Клиент ${id}`]))),
        ),
    };
    const links = {
        urlsFor: jest.fn((_d: string, ids: readonly string[]) =>
            Promise.resolve(
                new Map(ids.map(id => [id, `https://site/call/${id}`])),
            ),
        ),
    };
    const leads = {
        urlsFor: jest.fn(
            (
                _d: string,
                ids: readonly string[],
                viewer: { userId: string; role: string },
            ) =>
                Promise.resolve(
                    new Map(
                        ids.map(id => [
                            id,
                            `https://site/call/${id}/lead/${viewer.role}-${viewer.userId}`,
                        ]),
                    ),
                ),
        ),
    };
    const useCase = new CallsListUseCase(
        loader as unknown as CallListIndexLoader,
        clients as unknown as CallClientTitlesService,
        links as unknown as CallPageLinkService,
        leads as unknown as CallPageLeadService,
    );
    return { useCase, loader, clients, links, leads };
}

describe('CallsListUseCase', () => {
    it('менеджеру — 403 «Раздел доступен руководителям»', async () => {
        const { useCase, loader } = harness();
        await expect(useCase.execute(dtoOf(), MANAGER)).rejects.toThrow(
            new ForbiddenException('Раздел доступен руководителям'),
        );
        expect(loader.load).not.toHaveBeenCalled();
    });

    it('руководителю — только его менеджеры; страница, итог и фасеты', async () => {
        const { useCase, clients, links, leads } = harness();

        const result = await useCase.execute(
            dtoOf({ page: 1, pageSize: 2 }),
            LEADER,
        );

        expect(result.total).toBe(3);
        expect(result.page).toBe(1);
        expect(result.pageSize).toBe(2);
        expect(result.items.map(item => item.transcriptionId)).toEqual([
            '4',
            '3',
        ]);
        expect(result.facets.managers).toEqual([
            { id: '447', name: 'Иванова Мария', count: 3 },
        ]);
        // Клиенты и ссылки — только на строки страницы.
        expect(clients.titlesFor).toHaveBeenCalledWith(DOMAIN, ['4', '3']);
        expect(leads.urlsFor).toHaveBeenCalledWith(DOMAIN, ['4', '3'], {
            userId: '10',
            role: 'leader',
        });
        expect(links.urlsFor).not.toHaveBeenCalled();
        const [first, second] = result.items;
        expect(first).toMatchObject({
            managerName: 'Иванова Мария',
            client: 'Клиент 4',
            url: 'https://site/call/4/lead/leader-10',
            reviews: { count: 0, mine: null },
        });
        expect(second.reviews).toMatchObject({
            count: 1,
            disagreeCount: 1,
            mine: { agree: false, leaderScore: 3 },
        });
    });

    it('суперпользователю видны все менеджеры, ключ — с ролью superuser', async () => {
        const { useCase } = harness();
        const result = await useCase.execute(dtoOf(), SUPER);
        expect(result.total).toBe(4);
        expect(result.items[0].url).toBe(
            'https://site/call/4/lead/superuser-10',
        );
        expect(result.facets.managers.map(manager => manager.id)).toEqual([
            '447',
            '512',
        ]);
    });

    it('фильтр отзывов и вторая страница', async () => {
        const { useCase } = harness();
        const reviewed = await useCase.execute(
            dtoOf({ review: 'disagreed' }),
            LEADER,
        );
        expect(reviewed.items.map(item => item.transcriptionId)).toEqual(['3']);
        const second = await useCase.execute(
            dtoOf({ page: 2, pageSize: 2 }),
            LEADER,
        );
        expect(second.items.map(item => item.transcriptionId)).toEqual(['1']);
        expect(second.total).toBe(3);
    });

    it('«мой» отзыв — по автору запроса, другим руководителям он чужой', async () => {
        const { useCase } = harness();
        const result = await useCase.execute(dtoOf({ requesterUserId: '11' }), {
            role: 'op',
            visibleManagerIds: ['447'],
        });
        const row = result.items.find(item => item.transcriptionId === '3');
        expect(row?.reviews).toMatchObject({ count: 1, mine: null });
    });

    it('id пользователя не число — обычные ссылки без личного ключа', async () => {
        const { useCase, links, leads } = harness();
        const result = await useCase.execute(
            dtoOf({ requesterUserId: 'abc' }),
            SUPER,
        );
        expect(leads.urlsFor).not.toHaveBeenCalled();
        expect(links.urlsFor).toHaveBeenCalledTimes(1);
        expect(result.items[0].url).toBe('https://site/call/4');
    });
});
