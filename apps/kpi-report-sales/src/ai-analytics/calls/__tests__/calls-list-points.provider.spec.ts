import type { MethodologyRegistryService } from '@lib/call-lib/call-report/methodology/methodology-registry.service';
import type {
    MethodologyCheckpoint,
    ResolvedMethodology,
} from '@lib/call-lib/call-report/methodology/methodology.types';
import {
    CallListPointsProvider,
    pointDefOf,
    pointLabelOf,
} from '../calls-list-points.provider';

const checkpointOf = (
    code: string,
    fields: Partial<MethodologyCheckpoint> = {},
): MethodologyCheckpoint => ({
    code,
    title: `Формулировка ${code}`,
    types: ['presentation'],
    evidence: 'quote',
    mandatory: true,
    ...fields,
});

const resolvedOf = (
    checkpoints: MethodologyCheckpoint[],
    fields: { code?: string; title?: string } = {},
): ResolvedMethodology =>
    ({
        methodology: {
            code: fields.code ?? 'custom',
            title: fields.title ?? 'Моя методика',
            version: '1.0.0',
            checkpoints,
        },
        scope: 'portal',
        source: 'table',
        versionTag: 'custom@1.0.0',
    }) as unknown as ResolvedMethodology;

describe('подпись пункта методики для фильтров', () => {
    it('название бейджа из методики — как есть', () => {
        expect(
            pointLabelOf({
                badge: 'Повод: выгода',
                title: 'Длинная формулировка пункта методики',
            }),
        ).toBe('Повод: выгода');
    });

    it('названия бейджа нет — формулировка пункта, если влезает', () => {
        expect(pointLabelOf({ title: 'Назвал цену после показа' })).toBe(
            'Назвал цену после показа',
        );
        expect(pointLabelOf({ badge: '   ', title: 'Короткий пункт' })).toBe(
            'Короткий пункт',
        );
    });

    it('формулировка на пределе — без сокращения', () => {
        const title = 'я'.repeat(28);
        expect(pointLabelOf({ title })).toBe(title);
    });

    it('длиннее предела — отрезана до 28 знаков вместе с «…»', () => {
        const label = pointLabelOf({
            title: 'Выяснил потребности клиента до начала презентации',
        });
        expect(label).toBe('Выяснил потребности клиента…');
        expect(label.length).toBeLessThanOrEqual(28);
    });

    it('пробел перед отрезанным хвостом не остаётся перед «…»', () => {
        const label = pointLabelOf({
            title: 'Показал спираль презентации клиенту',
        });
        expect(label).toBe('Показал спираль презентации…');
    });
});

describe('описание пункта методики для фильтров', () => {
    it('код, формулировка, типы звонка и «основной бейдж» — из пункта', () => {
        const def = pointDefOf(
            checkpointOf('pres.a', {
                badge: 'Спирали',
                badgeMain: true,
                types: ['presentation', 'refine'],
            }),
        );
        expect(def).toEqual({
            code: 'pres.a',
            label: 'Спирали',
            title: 'Формулировка pres.a',
            callTypes: ['presentation', 'refine'],
            main: true,
        });
    });

    it('основной бейдж не задан или выключен — пункт не основной', () => {
        expect(pointDefOf(checkpointOf('a.one')).main).toBe(false);
        expect(
            pointDefOf(checkpointOf('a.one', { badgeMain: false })).main,
        ).toBe(false);
    });

    it('типы звонка — копия: правка описания не трогает методику', () => {
        const checkpoint = checkpointOf('a.one', { types: ['cold'] });
        const def = pointDefOf(checkpoint);
        (def.callTypes as string[]).push('call');
        expect(checkpoint.types).toEqual(['cold']);
    });
});

describe('CallListPointsProvider', () => {
    function harness() {
        const registry = { resolve: jest.fn() };
        const provider = new CallListPointsProvider(
            registry as unknown as MethodologyRegistryService,
        );
        return { provider, registry };
    }

    it('методика портала: имя для людей и пункты по порядку методики', async () => {
        const { provider, registry } = harness();
        registry.resolve.mockResolvedValue(
            resolvedOf(
                [
                    checkpointOf('pres.a', {
                        badge: 'Спирали',
                        badgeMain: true,
                    }),
                    checkpointOf('cold.b', { types: ['cold'] }),
                ],
                { code: 'custom', title: 'Продажи по-нашему' },
            ),
        );

        const view = await provider.forDomain('gsr.bitrix24.ru');

        expect(registry.resolve).toHaveBeenCalledWith('gsr.bitrix24.ru');
        expect(view.methodology).toEqual({
            code: 'custom',
            title: 'Методика «Продажи по-нашему»',
        });
        expect(view.defs.map(def => def.code)).toEqual(['pres.a', 'cold.b']);
        expect(view.defs[0]).toMatchObject({ label: 'Спирали', main: true });
        expect(view.defs[1]).toMatchObject({
            label: 'Формулировка cold.b',
            callTypes: ['cold'],
            main: false,
        });
    });

    it('название методики, уже начинающееся со слова «методика», — без повторной обёртки', async () => {
        const { provider, registry } = harness();
        registry.resolve.mockResolvedValue(
            resolvedOf([], { code: 'custom', title: 'методика продаж' }),
        );
        const view = await provider.forDomain('d');
        expect(view.methodology).toEqual({
            code: 'custom',
            title: 'Методика продаж',
        });
    });

    it('методики на портале нет — пусто, список работает без пунктов', async () => {
        const { provider, registry } = harness();
        registry.resolve.mockResolvedValue(null);
        await expect(provider.forDomain('d')).resolves.toEqual({
            methodology: null,
            defs: [],
        });
    });

    it('реестр не ответил — предупреждение и пустой результат, не ошибка', async () => {
        const { provider, registry } = harness();
        registry.resolve.mockRejectedValue(new Error('база недоступна'));
        const warn = jest
            .spyOn(
                (
                    provider as unknown as {
                        logger: { warn: (message: string) => void };
                    }
                ).logger,
                'warn',
            )
            .mockImplementation(() => undefined);

        await expect(provider.forDomain('d')).resolves.toEqual({
            methodology: null,
            defs: [],
        });
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('база недоступна'),
        );
    });

    it('каждый ответ — свой объект: правка не доезжает до следующего запроса', async () => {
        const { provider, registry } = harness();
        registry.resolve.mockResolvedValue(null);
        const first = await provider.forDomain('d');
        first.defs.push(pointDefOf(checkpointOf('a.one')));
        const second = await provider.forDomain('d');
        expect(second.defs).toEqual([]);
    });
});
