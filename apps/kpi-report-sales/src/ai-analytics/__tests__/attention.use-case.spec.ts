import { RequesterAccess } from '../domain/access/perimeter.util';
import { applyOverviewPerimeter } from '../domain/presenter/overview.presenter';
import { AttentionUseCase } from '../domain/use-cases/attention.use-case';
import { OverviewLookup } from '../domain/use-cases/overview-lookup.use-case';
import { AiOverviewDto } from '../dto/ai-overview.dto';
import {
    callsOf,
    OVERVIEW_DOMAIN,
    OVERVIEW_FROM,
    OVERVIEW_TO,
    overviewFixture,
} from './fixtures/overview.fixture';

const KEY = 'k';
const request = {
    domain: OVERVIEW_DOMAIN,
    requesterUserId: '447',
    from: OVERVIEW_FROM,
    to: OVERVIEW_TO,
};
const leader: RequesterAccess = { role: 'cup', visibleManagerIds: null };

/** 10 менеджеров с риск-звонками и малым n — кандидатов заведомо больше 7. */
function noisyOverview(): AiOverviewDto {
    const ids = Array.from({ length: 10 }, (_, index) => 100 + index);
    const rows = ids.flatMap(id =>
        callsOf(String(id), 3, { riskFlags: ['promise'] }),
    );
    return overviewFixture(rows, ids);
}

function makeUseCase(overview: AiOverviewDto | null) {
    const lookup = {
        lookup: jest.fn(
            (_dto: unknown, access: RequesterAccess): Promise<OverviewLookup> =>
                Promise.resolve(
                    overview
                        ? {
                              status: 'ready',
                              requestKey: KEY,
                              data: applyOverviewPerimeter(
                                  overview,
                                  access,
                                  true,
                              ),
                          }
                        : { status: 'queued', requestKey: KEY, jobId: KEY },
                ),
        ),
    };
    const smartLinks = {
        resolveLinks: jest.fn((_domain: string, ids: readonly string[]) =>
            Promise.resolve(
                new Map(
                    ids.map(id => [id, `https://portal/type/9/details/${id}/`]),
                ),
            ),
        ),
    };
    return {
        useCase: new AttentionUseCase(lookup as never, smartLinks as never),
        lookup,
        smartLinks,
    };
}

describe('AttentionUseCase', () => {
    it('≤ 7 карточек, ≤ 3 на менеджера, ранги с 1, период обзора', async () => {
        const { useCase } = makeUseCase(noisyOverview());
        const response = await useCase.execute(request, leader);
        expect(response.status).toBe('ready');
        expect(response.requestKey).toBe(KEY);
        const items = response.data?.items ?? [];
        expect(items.length).toBeGreaterThan(0);
        expect(items.length).toBeLessThanOrEqual(7);
        expect(items.map(item => item.rank)).toEqual(
            items.map((_, index) => index + 1),
        );
        const perManager = new Map<string, number>();
        for (const item of items) {
            perManager.set(
                item.managerId,
                (perManager.get(item.managerId) ?? 0) + 1,
            );
        }
        expect(Math.max(...perManager.values())).toBeLessThanOrEqual(3);
        expect(response.data).toMatchObject({
            from: OVERVIEW_FROM,
            to: OVERVIEW_TO,
            managersConsidered: 10,
        });
    });

    it('риск-звонки карточек получают ссылки на разборы, остальные карточки — нет', async () => {
        const { useCase, smartLinks } = makeUseCase(noisyOverview());
        const response = await useCase.execute(request, leader);
        const items = response.data?.items ?? [];
        const withCalls = items.filter(
            item => item.link.transcriptionIds?.length,
        );
        expect(withCalls.length).toBeGreaterThan(0);
        for (const item of withCalls) {
            expect(item.link.calls).toEqual(
                item.link.transcriptionIds?.map(transcriptionId => ({
                    transcriptionId,
                    link: `https://portal/type/9/details/${transcriptionId}/`,
                })),
            );
        }
        for (const item of items.filter(
            item => !item.link.transcriptionIds?.length,
        )) {
            expect(item.link.calls).toBeUndefined();
        }
        const [domain, ids] = smartLinks.resolveLinks.mock.calls[0] as [
            string,
            string[],
        ];
        expect(domain).toBe(OVERVIEW_DOMAIN);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('периметр: менеджер получает только свои карточки', async () => {
        const { useCase, lookup } = makeUseCase(noisyOverview());
        const own: RequesterAccess = {
            role: 'manager',
            visibleManagerIds: ['103'],
        };
        const response = await useCase.execute(
            { ...request, requesterUserId: '103' },
            own,
        );
        expect(lookup.lookup).toHaveBeenCalledWith(
            { ...request, requesterUserId: '103' },
            own,
        );
        expect(response.data?.managersConsidered).toBe(1);
        expect(response.data?.items.length).toBeGreaterThan(0);
        expect(
            response.data?.items.every(item => item.managerId === '103'),
        ).toBe(true);
    });

    it('обзор не посчитан → конверт обзора без data', async () => {
        const { useCase } = makeUseCase(null);
        expect(await useCase.execute(request, leader)).toEqual({
            status: 'queued',
            requestKey: KEY,
            jobId: KEY,
        });
    });
});
