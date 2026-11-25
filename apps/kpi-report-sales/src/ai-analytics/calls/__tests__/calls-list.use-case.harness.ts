import type { CallPageLeadService, CallPageLinkService } from '@lib/call-lib';
import type { PortalViewReader } from '../../../portal-view/portal-view.reader';
import type { RequesterAccess } from '../../domain/access/perimeter.util';
import type { CallClientTitlesService } from '../call-client-titles.service';
import type { CallListIndexLoader } from '../calls-list-index.loader';
import type { CallListPointsProvider } from '../calls-list-points.provider';
import { CallsListUseCase } from '../calls-list.use-case';
import type { CallListPointsView } from '../calls-list.types';
import type { CallsListRequestDto } from '../dto/calls-list-request.dto';
import {
    indexOf,
    pointDefOf,
    pointsOf,
    reviewOf,
    rowOf,
} from './calls-list.fixtures';

export const DOMAIN = 'gsr.bitrix24.ru';
export const POINT_CODES = ['pres.a', 'pres.b'];

/** Методика портала: основной пункт pres.a (презентация) и обычный pres.b. */
export const PORTAL_POINTS: CallListPointsView = {
    methodology: { code: 'polyansky', title: 'Методика Полянского' },
    defs: [
        pointDefOf('pres.a', {
            label: 'Спирали презентации',
            callTypes: ['presentation'],
            main: true,
        }),
        pointDefOf('pres.b', { callTypes: ['presentation', 'demo'] }),
    ],
};

export const LEADER: RequesterAccess = {
    role: 'op',
    visibleManagerIds: ['447', '10'],
};
export const SUPER: RequesterAccess = {
    role: 'cup',
    visibleManagerIds: null,
    isSuperUser: true,
};
export const MANAGER: RequesterAccess = {
    role: 'manager',
    visibleManagerIds: ['447'],
};

export const dtoOf = (
    fields: Partial<CallsListRequestDto> = {},
): CallsListRequestDto =>
    ({
        domain: DOMAIN,
        requesterUserId: '10',
        from: '2026-11-01',
        to: '2026-11-19',
        ...fields,
    }) as CallsListRequestDto;

/** Читатель «Вида отчёта» портала в объёме, нужном списку. */
type BadgesMainReader = Pick<PortalViewReader, 'badgesMain'>;

export function harness(
    portalPoints: CallListPointsView = PORTAL_POINTS,
    /** Основные бейджи из настроек портала; null — портал не выбирал. */
    badgesMain: BadgesMainReader['badgesMain'] = () => Promise.resolve(null),
) {
    const index = indexOf(
        [
            rowOf('1', {
                managerId: '447',
                startedAt: '2026-11-03T08:00:00Z',
                badges: ['step_missing'],
                points: pointsOf(POINT_CODES, { 'pres.a': 'missed' }),
            }),
            rowOf('2', { managerId: '512', startedAt: '2026-11-04T08:00:00Z' }),
            rowOf('3', {
                managerId: '447',
                startedAt: '2026-11-05T08:00:00Z',
                badges: ['step_missing', 'signal'],
                points: pointsOf(POINT_CODES, { 'pres.a': 'done' }),
            }),
            rowOf('4', {
                managerId: '447',
                startedAt: '2026-11-06T08:00:00Z',
                points: pointsOf(POINT_CODES, {
                    'pres.a': 'missed',
                    'pres.b': 'done',
                }),
            }),
        ],
        { '3': [reviewOf('10', { agree: false, leaderScore: 3 })] },
        { '447': 'Иванова Мария' },
        POINT_CODES,
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
    const points = {
        forDomain: jest.fn(() => Promise.resolve(portalPoints)),
    };
    const portalView: jest.Mocked<BadgesMainReader> = {
        badgesMain: jest.fn(badgesMain),
    };
    const useCase = new CallsListUseCase(
        loader as unknown as CallListIndexLoader,
        clients as unknown as CallClientTitlesService,
        links as unknown as CallPageLinkService,
        leads as unknown as CallPageLeadService,
        points as unknown as CallListPointsProvider,
        portalView as unknown as PortalViewReader,
    );
    return { useCase, loader, clients, links, leads, points, portalView };
}
