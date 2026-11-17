import {
    CALL_PAGE_LINKS_REPAIR_WINDOW,
    callPageLinkTargets,
    DEAD_CALL_PAGE_SITE,
    linksRepairSummaryLine,
    pendingLinkRepairs,
    rewriteCallPageLinks,
    type LinksRepairRecordView,
} from '../use-cases/call-page-links-repair.util';

/**
 * Починка ссылок на страницу разбора, записанных 16–17.11.2026 с адресом
 * сайта, которого нет: чистые правила.
 */
const SITE = 'https://next.april-app.ru';
const TOKEN = '2oi-ngLp_aNe-grxXHKJGxmNBEpim6aPuWHj';

const record = (
    over: Partial<LinksRepairRecordView> = {},
): LinksRepairRecordView => ({
    id: 'ai-1',
    entity_type: 'deal',
    entity_id: 4521,
    report_item_id: '9001',
    createdAt: new Date('2026-11-16T18:00:00.000Z'),
    ...over,
});

describe('rewriteCallPageLinks', () => {
    it('меняет только адрес сайта: код ссылки и остальной текст остаются', () => {
        const comment =
            `🤖 [b]Глубокий AI-анализ звонка[/b]\n` +
            `[url=${DEAD_CALL_PAGE_SITE}/call/${TOKEN}]Страница разбора[/url]\nРезюме: договорились о показе.`;

        expect(rewriteCallPageLinks(comment, SITE)).toBe(
            `🤖 [b]Глубокий AI-анализ звонка[/b]\n` +
                `[url=${SITE}/call/${TOKEN}]Страница разбора[/url]\nРезюме: договорились о показе.`,
        );
    });

    it('несколько ссылок в одном комментарии переписываются все', () => {
        const comment = `${DEAD_CALL_PAGE_SITE}/call/aaa и ${DEAD_CALL_PAGE_SITE}/call/bbb`;

        expect(rewriteCallPageLinks(comment, SITE)).toBe(
            `${SITE}/call/aaa и ${SITE}/call/bbb`,
        );
    });

    it('сайт с путём подставляется целиком', () => {
        expect(
            rewriteCallPageLinks(
                `${DEAD_CALL_PAGE_SITE}/call/${TOKEN}`,
                `${SITE}/report`,
            ),
        ).toBe(`${SITE}/report/call/${TOKEN}`);
    });

    it('комментарий без мёртвого адреса не трогаем', () => {
        expect(rewriteCallPageLinks(`${SITE}/call/${TOKEN}`, SITE)).toBeNull();
        expect(rewriteCallPageLinks('Обычный комментарий', SITE)).toBeNull();
        // Тот же сайт без страницы разбора — не наша ссылка.
        expect(
            rewriteCallPageLinks(`${DEAD_CALL_PAGE_SITE}/share/abc`, SITE),
        ).toBeNull();
    });
});

describe('callPageLinkTargets', () => {
    it('сделка звонка и карточка разбора в смарте', () => {
        expect(callPageLinkTargets(record(), 1058)).toEqual([
            { entityType: 'deal', entityId: 4521 },
            { entityType: 'DYNAMIC_1058', entityId: 9001 },
        ]);
    });

    it('лид звонка — лента лида', () => {
        expect(
            callPageLinkTargets(record({ entity_type: 'lead' }), null),
        ).toEqual([{ entityType: 'lead', entityId: 4521 }]);
    });

    it('звонок на компании или контакте: дубля в ленте нет — только карточка разбора', () => {
        expect(
            callPageLinkTargets(record({ entity_type: 'company' }), 1058),
        ).toEqual([{ entityType: 'DYNAMIC_1058', entityId: 9001 }]);
    });

    it('смарт не установлен или карточка не записана — её ленты нет', () => {
        expect(callPageLinkTargets(record(), null)).toEqual([
            { entityType: 'deal', entityId: 4521 },
        ]);
        expect(
            callPageLinkTargets(record({ report_item_id: '' }), 1058),
        ).toEqual([{ entityType: 'deal', entityId: 4521 }]);
    });

    it('мусор вместо номеров — лент нет', () => {
        expect(
            callPageLinkTargets(
                record({ entity_id: 0, report_item_id: 'abc' }),
                1058,
            ),
        ).toEqual([]);
    });
});

describe('pendingLinkRepairs', () => {
    it('проверенные отбрасываются, остальные — старые первыми', () => {
        const older = record({
            id: 'ai-old',
            createdAt: new Date('2026-11-16T16:00:00.000Z'),
        });
        const newer = record({
            id: 'ai-new',
            createdAt: new Date('2026-11-17T07:00:00.000Z'),
        });
        const seen = record({ id: 'ai-seen' });

        expect(
            pendingLinkRepairs([newer, seen, older], new Set(['ai-seen'])).map(
                item => item.id,
            ),
        ).toEqual(['ai-old', 'ai-new']);
    });
});

describe('окно и итог', () => {
    it('окно покрывает выкладку страницы разбора и исправление адреса', () => {
        expect(CALL_PAGE_LINKS_REPAIR_WINDOW.from.toISOString()).toBe(
            '2026-11-16T15:00:00.000Z',
        );
        expect(CALL_PAGE_LINKS_REPAIR_WINDOW.to.toISOString()).toBe(
            '2026-11-17T09:00:00.000Z',
        );
    });

    it('строка итога — только когда есть что сообщить, по-русски и без кодов', () => {
        const base = {
            domain: 'gsr.bitrix24.ru',
            checked: 0,
            rewritten: 0,
            gaveUp: 0,
            finished: false,
        };

        expect(linksRepairSummaryLine({ ...base, checked: 12 })).toBe('');
        expect(
            linksRepairSummaryLine({ ...base, checked: 12, rewritten: 9 }),
        ).toBe(
            'gsr.bitrix24.ru: исправлено ссылок на страницу разбора в ленте — 9',
        );
        expect(
            linksRepairSummaryLine({ ...base, gaveUp: 2, finished: true }),
        ).toBe(
            'gsr.bitrix24.ru: не удалось проверить ссылки у 2 разборов — смотреть руками, старые ссылки на страницу разбора проверены все',
        );
    });
});
