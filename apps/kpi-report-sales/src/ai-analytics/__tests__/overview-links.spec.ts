import { Logger } from '@nestjs/common';
import type { AnalyticsCallLiteRow } from '@lib/call-lib';
import { AI_ANALYTICS_THRESHOLDS } from '@lib/sales-ai-analytics';
import { hasCallDate } from '../domain/loaders/lite-row.mapper';
import {
    overviewRiskCallIds,
    withOverviewRiskCallLinks,
} from '../domain/presenter/overview-links.presenter';
import { OverviewUseCase } from '../domain/use-cases/overview.use-case';
import type { AiOverviewDto } from '../dto/ai-overview.dto';
import {
    callsLoaderWith,
    liteRow,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';
import { scopeResolverWith } from './fixtures/manager-scope.fixture';
import {
    callsOf,
    emptyFinance,
    emptyKpi,
    emptyPlans,
    OVERVIEW_DOMAIN,
    OVERVIEW_FROM,
    OVERVIEW_NOW,
    OVERVIEW_TO,
    overviewFixture,
} from './fixtures/overview.fixture';
import {
    smartLinksFailing,
    smartLinksWith,
    type SmartLinksStub,
} from './fixtures/smart-links.fixture';

/**
 * Ссылки риск-звонков строк обзора на карточки разборов: руководитель
 * открывает разбор из таблицы сигналов. Ссылки — одним вызовом
 * SmartLinkLoader на все риск-звонки всех строк; fail-open: без элемента
 * смарта или при ошибке загрузчика link = null, обзор отдаётся.
 */
const ROSTER = [10, 20];
const input = { domain: OVERVIEW_DOMAIN, from: OVERVIEW_FROM, to: OVERVIEW_TO };

const smartLink = (itemId: number): string =>
    `https://april.bitrix24.ru/crm/type/1036/details/${itemId}/`;

/** Риск-звонок менеджера в периоде обзора (по умолчанию — риск-флаг). */
function riskRow(
    transcriptionId: string,
    managerId: string,
    day: string,
    overrides: Partial<AnalyticsCallLiteRow> = {},
): AnalyticsCallLiteRow {
    return liteRow({
        transcriptionId,
        managerId,
        callStartedAt: new Date(`${day}T08:00:00Z`),
        riskFlags: ['promise'],
        ...overrides,
    });
}

/**
 * Менеджер 10: 10 презентаций (n ≥ 8) и два риск-звонка (риск-флаг,
 * срочный коучинг); менеджер 20: риск-звонок, короткий риск-звонок (вне
 * слоя качества — в строку не попадает) и спокойный звонок.
 */
function rowsWithRiskCalls(): AnalyticsCallLiteRow[] {
    return [
        ...callsOf('10', 10),
        riskRow('r1', '10', '2026-08-12'),
        riskRow('r2', '10', '2026-08-13', {
            riskFlags: [],
            coachingPriority: 'urgent',
        }),
        riskRow('r3', '20', '2026-08-14', { riskFlags: ['conflict'] }),
        riskRow('short', '20', '2026-08-15', {
            durationSec: AI_ANALYTICS_THRESHOLDS.shortCallSec - 1,
        }),
        liteRow({ transcriptionId: 'calm', managerId: '20' }),
    ];
}

function makeUseCase(
    rows: AnalyticsCallLiteRow[],
    links: SmartLinksStub,
): OverviewUseCase {
    return new OverviewUseCase(
        settingsLoaderWith(),
        scopeResolverWith(ROSTER).resolver,
        callsLoaderWith(rows).loader,
        {
            loadKpiMonths: jest.fn().mockResolvedValue(emptyKpi(ROSTER)),
        } as never,
        {
            loadFinance: jest.fn().mockResolvedValue(emptyFinance(ROSTER)),
        } as never,
        { loadPlans: jest.fn().mockResolvedValue(emptyPlans(ROSTER)) } as never,
        { load: jest.fn().mockResolvedValue(new Map()) } as never,
        { loadLevels: jest.fn().mockResolvedValue(new Map()) } as never,
        { listInPeriod: jest.fn().mockResolvedValue([]) } as never,
        links.loader,
    );
}

const riskCallsOf = (dto: AiOverviewDto, managerId: string) =>
    dto.managers.find(row => row.managerId === managerId)?.riskCalls ?? [];

describe('OverviewUseCase: ссылки риск-звонков на карточки разборов', () => {
    it('загрузчик вызывается один раз со всеми id риск-звонков всех строк; спокойные и короткие звонки не запрашиваются', async () => {
        const links = smartLinksWith();

        await makeUseCase(rowsWithRiskCalls(), links).execute(input, {
            now: OVERVIEW_NOW,
        });

        expect(links.resolveLinks).toHaveBeenCalledTimes(1);
        const [domain, ids] = links.resolveLinks.mock.calls[0] as [
            string,
            string[],
        ];
        expect(domain).toBe(OVERVIEW_DOMAIN);
        expect([...ids].sort()).toEqual(['r1', 'r2', 'r3']);
    });

    it('каждый риск-звонок получает link из карты; без элемента смарта — null', async () => {
        const links = smartLinksWith({ r1: smartLink(77), r3: smartLink(79) });

        const dto = await makeUseCase(rowsWithRiskCalls(), links).execute(
            input,
            { now: OVERVIEW_NOW },
        );

        expect(
            riskCallsOf(dto, '10').map(call => [
                call.transcriptionId,
                call.kind,
                call.link,
            ]),
        ).toEqual([
            ['r1', 'promise', smartLink(77)],
            ['r2', 'urgent', null],
        ]);
        expect(riskCallsOf(dto, '20')).toEqual([
            {
                transcriptionId: 'r3',
                kind: 'conflict',
                callStartedAt: '2026-08-14T08:00:00.000Z',
                link: smartLink(79),
            },
        ]);
    });

    it('без риск-звонков загрузчик не вызывается', async () => {
        const links = smartLinksWith();

        const dto = await makeUseCase(callsOf('10', 10), links).execute(input, {
            now: OVERVIEW_NOW,
        });

        expect(dto.managers.every(row => row.riskCalls.length === 0)).toBe(
            true,
        );
        expect(links.resolveLinks).not.toHaveBeenCalled();
    });

    it('fail-open: ошибка загрузчика → link = null у всех, обзор отдаётся, в лог — один warn', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);

        const dto = await makeUseCase(
            rowsWithRiskCalls(),
            smartLinksFailing('ais недоступен'),
        ).execute(input, { now: OVERVIEW_NOW });

        const calls = dto.managers.flatMap(row => row.riskCalls);
        expect(calls.map(call => call.transcriptionId)).toEqual([
            'r1',
            'r2',
            'r3',
        ]);
        expect(calls.every(call => call.link === null)).toBe(true);
        expect(dto.managers.map(row => row.managerId)).toEqual(['10', '20']);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('ais недоступен');
        warn.mockRestore();
    });
});

describe('overview-links.presenter', () => {
    const datedRows = () => rowsWithRiskCalls().filter(hasCallDate);

    it('overviewRiskCallIds: уникальные id риск-звонков всех строк в порядке строк', () => {
        const dto = overviewFixture(datedRows(), ROSTER);

        expect(overviewRiskCallIds(dto.managers)).toEqual(['r1', 'r2', 'r3']);
        expect(overviewRiskCallIds([...dto.managers, ...dto.managers])).toEqual(
            ['r1', 'r2', 'r3'],
        );
        expect(overviewRiskCallIds([])).toEqual([]);
    });

    it('withOverviewRiskCallLinks: ссылка по id, остальное не меняется, исходный обзор не мутируется', () => {
        const dto = overviewFixture(datedRows(), [10, 20, 30]);

        const linked = withOverviewRiskCallLinks(
            dto,
            new Map([
                ['r2', smartLink(5)],
                ['r3', null],
            ]),
        );

        expect(riskCallsOf(linked, '10')).toEqual([
            { ...riskCallsOf(dto, '10')[0], link: null },
            { ...riskCallsOf(dto, '10')[1], link: smartLink(5) },
        ]);
        expect(riskCallsOf(linked, '20')).toEqual([
            { ...riskCallsOf(dto, '20')[0], link: null },
        ]);
        // Строка без риск-звонков — тот же объект; остальной обзор не тронут.
        const idle = (view: AiOverviewDto) =>
            view.managers.find(row => row.managerId === '30');
        expect(idle(linked)).toBe(idle(dto));
        expect({ ...linked, managers: [] }).toEqual({ ...dto, managers: [] });
        expect(riskCallsOf(dto, '10').every(call => call.link === null)).toBe(
            true,
        );
    });
});
