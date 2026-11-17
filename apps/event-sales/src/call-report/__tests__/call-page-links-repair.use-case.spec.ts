import type {
    AiEntityDto,
    AiService,
    CallPageLinkService,
} from '@lib/call-lib';
import type { CallReportSmartResolverService } from '@lib/call-lib/call-report/services/call-report-smart-resolver.service';
import type { PBXService } from '@lib/pbx/pbx.service';
import type { CallPageLinksRepairStore } from '../services/call-page-links-repair.store';
import { CallPageLinksRepairUseCase } from '../use-cases/call-page-links-repair.use-case';
import {
    CALL_PAGE_LINKS_REPAIR_QUOTA,
    CALL_PAGE_LINKS_REPAIR_WINDOW,
    DEAD_CALL_PAGE_SITE,
} from '../use-cases/call-page-links-repair.util';

/**
 * Починка ссылок на страницу разбора: понемногу на портал, повтор безопасен,
 * сбой Битрикса по одному разбору не мешает остальным.
 */
const DOMAIN = 'gsr.bitrix24.ru';
const SITE = 'https://next.april-app.ru';
const NOW = new Date('2026-11-17T12:41:00.000Z');

interface CommentRow {
    ID: string;
    COMMENT: string;
}

type CommentFilter = { ENTITY_TYPE: string; ENTITY_ID: number };

const record = (id: string, over: Partial<AiEntityDto> = {}): AiEntityDto =>
    ({
        id,
        entity_type: 'deal',
        entity_id: 4521,
        report_item_id: '9001',
        createdAt: new Date('2026-11-16T18:00:00.000Z'),
        ...over,
    }) as AiEntityDto;

const dead = (token: string): string =>
    `[url=${DEAD_CALL_PAGE_SITE}/call/${token}]Страница разбора[/url]`;
const alive = (token: string): string =>
    `[url=${SITE}/call/${token}]Страница разбора[/url]`;

function harness(options: {
    records?: AiEntityDto[];
    seen?: string[];
    done?: boolean;
    site?: string | null;
    comments?: Record<string, CommentRow[]>;
    failOn?: string;
    smartEntityTypeId?: number | null;
}) {
    const seen = new Set(options.seen ?? []);
    const attempts = new Map<string, number>();
    const store = {
        isDone: jest.fn(() => Promise.resolve(options.done ?? false)),
        markDone: jest.fn<Promise<void>, [string, string]>(() =>
            Promise.resolve(),
        ),
        seen: jest.fn(() => Promise.resolve(new Set(seen))),
        markSeen: jest.fn<Promise<void>, [string, string]>((...args) => {
            seen.add(args[1]);
            return Promise.resolve();
        }),
        bumpAttempt: jest.fn<Promise<number>, [string]>(id => {
            const next = (attempts.get(id) ?? 0) + 1;
            attempts.set(id, next);
            return Promise.resolve(next);
        }),
    };
    const getTimelineComments = jest.fn<
        Promise<{ result: CommentRow[] }>,
        [CommentFilter, string[], Record<string, string>]
    >(filter => {
        const key = `${filter.ENTITY_TYPE}:${filter.ENTITY_ID}`;
        if (key === options.failOn) {
            return Promise.reject(new Error('Bitrix 500'));
        }
        return Promise.resolve({ result: options.comments?.[key] ?? [] });
    });
    const updateTimelineComment = jest.fn<
        Promise<{ result: number }>,
        [string | number, string]
    >(() => Promise.resolve({ result: 1 }));
    const pbx = {
        init: jest.fn<Promise<{ bitrix: unknown }>, [string]>(() =>
            Promise.resolve({
                bitrix: {
                    timeline: { getTimelineComments, updateTimelineComment },
                },
            }),
        ),
    };
    const ai = {
        findByDomainTypesInPeriod: jest.fn<
            Promise<AiEntityDto[]>,
            [string, string[], Date, Date]
        >(() => Promise.resolve(options.records ?? [])),
    };
    const smart = {
        resolve: jest.fn(() =>
            Promise.resolve(
                options.smartEntityTypeId === null
                    ? null
                    : { entityTypeId: options.smartEntityTypeId ?? 1058 },
            ),
        ),
    };
    const links = {
        siteUrl: jest.fn(() =>
            Promise.resolve(options.site === undefined ? SITE : options.site),
        ),
    };
    const useCase = new CallPageLinksRepairUseCase(
        ai as unknown as AiService,
        pbx as unknown as PBXService,
        smart as unknown as CallReportSmartResolverService,
        links as unknown as CallPageLinkService,
        store as unknown as CallPageLinksRepairStore,
    );
    return {
        useCase,
        store,
        ai,
        pbx,
        getTimelineComments,
        updateTimelineComment,
    };
}

describe('CallPageLinksRepairUseCase.repairDomain', () => {
    it('переписывает адрес в ленте сделки и в карточке разбора, разбор отмечается проверенным', async () => {
        const {
            useCase,
            store,
            ai,
            pbx,
            getTimelineComments,
            updateTimelineComment,
        } = harness({
            records: [record('ai-1')],
            comments: {
                'deal:4521': [
                    { ID: '77', COMMENT: `Разбор. ${dead('tok-1')}` },
                    { ID: '76', COMMENT: 'Комментарий менеджера' },
                ],
                'DYNAMIC_1058:9001': [{ ID: '90', COMMENT: dead('tok-1') }],
            },
        });

        const result = await useCase.repairDomain(DOMAIN, NOW);

        expect(result).toEqual({
            domain: DOMAIN,
            checked: 1,
            rewritten: 2,
            gaveUp: 0,
            finished: false,
        });
        expect(ai.findByDomainTypesInPeriod).toHaveBeenCalledWith(
            DOMAIN,
            ['agent-analysis'],
            CALL_PAGE_LINKS_REPAIR_WINDOW.from,
            CALL_PAGE_LINKS_REPAIR_WINDOW.to,
        );
        // Инстанс Битрикса берётся у PBXService на вызов, один на проход.
        expect(pbx.init).toHaveBeenCalledTimes(1);
        expect(pbx.init).toHaveBeenCalledWith(DOMAIN);
        // Самые свежие комментарии: ссылка писалась недавно.
        expect(getTimelineComments).toHaveBeenCalledWith(
            { ENTITY_TYPE: 'deal', ENTITY_ID: 4521 },
            ['ID', 'COMMENT'],
            { ID: 'DESC' },
        );
        expect(updateTimelineComment.mock.calls).toEqual([
            ['77', `Разбор. ${alive('tok-1')}`],
            ['90', alive('tok-1')],
        ]);
        expect(store.markSeen).toHaveBeenCalledWith(DOMAIN, 'ai-1');
        expect(store.markDone).not.toHaveBeenCalled();
    });

    it('в ленте нет мёртвого адреса — ничего не пишем, разбор всё равно проверен', async () => {
        const { useCase, store, updateTimelineComment } = harness({
            records: [record('ai-1')],
            comments: {
                'deal:4521': [{ ID: '77', COMMENT: alive('tok-1') }],
            },
        });

        const result = await useCase.repairDomain(DOMAIN, NOW);

        expect(result).toMatchObject({ checked: 1, rewritten: 0 });
        expect(updateTimelineComment).not.toHaveBeenCalled();
        expect(store.markSeen).toHaveBeenCalledWith(DOMAIN, 'ai-1');
    });

    it('за проход — не больше квоты разборов, старые первыми', async () => {
        const records = [...Array(CALL_PAGE_LINKS_REPAIR_QUOTA + 5).keys()]
            .map(index =>
                record(`ai-${index}`, {
                    createdAt: new Date(
                        Date.parse('2026-11-16T16:00:00.000Z') + index * 60_000,
                    ),
                }),
            )
            .reverse();
        const { useCase, store } = harness({
            records,
            smartEntityTypeId: null,
        });

        const result = await useCase.repairDomain(DOMAIN, NOW);

        expect(result.checked).toBe(CALL_PAGE_LINKS_REPAIR_QUOTA);
        expect(store.markSeen.mock.calls[0]).toEqual([DOMAIN, 'ai-0']);
        expect(store.markSeen).toHaveBeenCalledTimes(
            CALL_PAGE_LINKS_REPAIR_QUOTA,
        );
    });

    it('все разборы окна проверены — портал помечается пройденным, Битрикс не зовётся', async () => {
        const { useCase, store, pbx } = harness({
            records: [record('ai-1'), record('ai-2')],
            seen: ['ai-1', 'ai-2'],
        });

        const result = await useCase.repairDomain(DOMAIN, NOW);

        expect(result).toMatchObject({ checked: 0, finished: true });
        expect(store.markDone).toHaveBeenCalledWith(DOMAIN, NOW.toISOString());
        expect(pbx.init).not.toHaveBeenCalled();
    });

    it('в окне нет разборов — портал пройден молча', async () => {
        const { useCase, store } = harness({ records: [] });

        const result = await useCase.repairDomain(DOMAIN, NOW);

        expect(result.finished).toBe(false);
        expect(store.markDone).toHaveBeenCalledTimes(1);
    });

    it('портал уже пройден — ни базы, ни Битрикса', async () => {
        const { useCase, ai, pbx } = harness({
            done: true,
            records: [record('ai-1')],
        });

        const result = await useCase.repairDomain(DOMAIN, NOW);

        expect(result).toMatchObject({ checked: 0, rewritten: 0 });
        expect(ai.findByDomainTypesInPeriod).not.toHaveBeenCalled();
        expect(pbx.init).not.toHaveBeenCalled();
    });

    it('действующий сайт не задан или совпал с мёртвым — менять не на что', async () => {
        for (const site of [null, DEAD_CALL_PAGE_SITE]) {
            const { useCase, ai, store } = harness({
                site,
                records: [record('ai-1')],
            });

            await useCase.repairDomain(DOMAIN, NOW);

            expect(ai.findByDomainTypesInPeriod).not.toHaveBeenCalled();
            expect(store.markDone).not.toHaveBeenCalled();
        }
    });

    it('сбой Битрикса по одному разбору остальным не мешает; разбор остаётся на следующий проход', async () => {
        const { useCase, store, updateTimelineComment } = harness({
            records: [
                record('ai-bad', { entity_id: 13 }),
                record('ai-ok', {
                    entity_id: 14,
                    createdAt: new Date('2026-11-16T19:00:00.000Z'),
                }),
            ],
            smartEntityTypeId: null,
            failOn: 'deal:13',
            comments: { 'deal:14': [{ ID: '5', COMMENT: dead('tok-2') }] },
        });

        const result = await useCase.repairDomain(DOMAIN, NOW);

        expect(result).toMatchObject({ checked: 1, rewritten: 1, gaveUp: 0 });
        expect(updateTimelineComment).toHaveBeenCalledWith('5', alive('tok-2'));
        expect(store.bumpAttempt).toHaveBeenCalledWith('ai-bad');
        expect(store.markSeen.mock.calls).toEqual([[DOMAIN, 'ai-ok']]);
    });

    it('третий неудачный проход — разбор пропускается и попадает в итог', async () => {
        const { useCase, store } = harness({
            records: [record('ai-bad', { entity_id: 13 })],
            smartEntityTypeId: null,
            failOn: 'deal:13',
        });

        await useCase.repairDomain(DOMAIN, NOW);
        await useCase.repairDomain(DOMAIN, NOW);
        const third = await useCase.repairDomain(DOMAIN, NOW);

        expect(third.gaveUp).toBe(1);
        expect(store.markSeen).toHaveBeenCalledWith(DOMAIN, 'ai-bad');
    });
});
