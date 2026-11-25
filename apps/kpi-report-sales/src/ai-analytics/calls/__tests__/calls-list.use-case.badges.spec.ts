import { CALL_BADGE_IDS } from '@lib/sales-ai-analytics';
import {
    DOMAIN,
    dtoOf,
    harness,
    LEADER,
    SUPER,
} from './calls-list.use-case.harness';

describe('CallsListUseCase: бейджи и пункты методики', () => {
    const idsOf = (items: { transcriptionId: string }[]): string[] =>
        items.map(item => item.transcriptionId);

    it('без фильтров: бейджи справочника и пункты методики в фасетах, типы не ограничены', async () => {
        const { useCase, points } = harness();

        const result = await useCase.execute(dtoOf(), LEADER);

        expect(points.forDomain).toHaveBeenCalledWith(DOMAIN);
        expect(result.total).toBe(3);
        expect(result.callTypesLock).toBeNull();
        expect(result.facets.methodology).toEqual({
            code: 'polyansky',
            title: 'Методика Полянского',
        });
        expect(result.facets.badges.map(facet => facet.id)).toEqual([
            ...CALL_BADGE_IDS,
        ]);
        expect(
            result.facets.badges.find(facet => facet.id === 'step_missing'),
        ).toMatchObject({ count: 2, main: true, title: 'Шаг не назначен' });
        expect(result.facets.points).toEqual([
            {
                code: 'pres.a',
                label: 'Спирали презентации',
                title: 'Формулировка пункта pres.a',
                callTypes: ['presentation'],
                main: true,
                done: 1,
                missed: 2,
            },
            expect.objectContaining({
                code: 'pres.b',
                main: false,
                done: 1,
                missed: 0,
            }),
        ]);
        // Менеджеры и типы звонка — как раньше, по видимым звонкам.
        expect(result.facets.managers).toEqual([
            { id: '447', name: 'Иванова Мария', count: 3 },
        ]);
    });

    it('фильтр по бейджу: строки, итог и счётчики', async () => {
        const { useCase } = harness();

        const result = await useCase.execute(
            dtoOf({ badges: ['step_missing'] }),
            LEADER,
        );

        expect(idsOf(result.items)).toEqual(['3', '1']);
        expect(result.total).toBe(2);
        const count = (id: string) =>
            result.facets.badges.find(facet => facet.id === id)?.count;
        expect(count('step_missing')).toBe(2);
        // Выбранный «шаг не назначен» оставляет звонки 1 и 3; сигнал — только у 3.
        expect(count('signal')).toBe(1);
        expect(count('needs_missing')).toBe(0);
    });

    it('фильтр по пункту: звонки в нужном состоянии, пункт в фасете считается без своего фильтра, типы ограничены', async () => {
        const { useCase } = harness();

        const result = await useCase.execute(
            dtoOf({ points: [{ code: 'pres.a', state: 'missed' }] }),
            LEADER,
        );

        expect(idsOf(result.items)).toEqual(['4', '1']);
        expect(result.total).toBe(2);
        expect(result.callTypesLock).toEqual(['presentation']);
        const facet = result.facets.points.find(item => item.code === 'pres.a');
        expect(facet).toMatchObject({ done: 1, missed: 2 });
        // pres.b считается при выбранном «pres.a не исполнен»: звонки 1 и 4.
        expect(
            result.facets.points.find(item => item.code === 'pres.b'),
        ).toMatchObject({ done: 1, missed: 0 });
    });

    it('бейдж и пункт вместе — «и»; типы — пересечение выбранных пунктов', async () => {
        const { useCase } = harness();

        const result = await useCase.execute(
            dtoOf({
                badges: ['step_missing'],
                points: [
                    { code: 'pres.a', state: 'missed' },
                    { code: 'pres.b', state: 'done' },
                ],
            }),
            LEADER,
        );

        // pres.b «исполнен» — только звонок 4, а шага у него нет.
        expect(result.items).toEqual([]);
        expect(result.total).toBe(0);
        expect(result.callTypesLock).toEqual(['presentation']);

        const both = await useCase.execute(
            dtoOf({
                badges: ['step_missing'],
                points: [{ code: 'pres.a', state: 'missed' }],
            }),
            LEADER,
        );
        expect(idsOf(both.items)).toEqual(['1']);
    });

    it('счётчики считаются по звонкам, прошедшим прочие фильтры (отзывы), а страница — по бейджам', async () => {
        const { useCase } = harness();

        const result = await useCase.execute(
            dtoOf({ review: 'disagreed' }),
            LEADER,
        );

        // С отзывом «не согласен» — только звонок 3.
        expect(idsOf(result.items)).toEqual(['3']);
        const count = (id: string) =>
            result.facets.badges.find(facet => facet.id === id)?.count;
        expect(count('step_missing')).toBe(1);
        expect(count('signal')).toBe(1);
        // Менеджеры считаются по видимым звонкам без фильтров запроса.
        expect(result.facets.managers[0].count).toBe(3);
    });

    it('бейджи строки: проблемы звонка, затем невыполненные основные пункты', async () => {
        const { useCase } = harness();

        const result = await useCase.execute(dtoOf(), LEADER);

        const badgesOf = (id: string) =>
            result.items.find(item => item.transcriptionId === id)?.badges;
        expect(badgesOf('1')).toEqual([
            { id: 'step_missing', title: 'Шаг не назначен', tone: 'bad' },
            { id: 'm:pres.a', title: 'Спирали презентации', tone: 'warn' },
        ]);
        // Звонок 3: две проблемы, пункт исполнен — пункта в строке нет.
        expect(badgesOf('3')).toEqual([
            { id: 'step_missing', title: 'Шаг не назначен', tone: 'bad' },
            { id: 'signal', title: 'Сигнал руководителю', tone: 'bad' },
        ]);
        // Звонок 4: pres.b исполнен и не основной; pres.a не исполнен — в строке.
        expect(badgesOf('4')).toEqual([
            { id: 'm:pres.a', title: 'Спирали презентации', tone: 'warn' },
        ]);
    });

    it('методики на портале нет — пунктов в фасетах нет, список и бейджи работают', async () => {
        const { useCase } = harness({ methodology: null, defs: [] });

        const result = await useCase.execute(
            dtoOf({
                badges: ['signal'],
                points: [{ code: 'pres.a', state: 'missed' }],
            }),
            LEADER,
        );

        expect(result.facets.methodology).toBeNull();
        expect(result.facets.points).toEqual([]);
        // Описаний нет — типы не ограничены; фильтр по коду из выборки действует.
        expect(result.callTypesLock).toBeNull();
        expect(result.total).toBe(0);

        const plain = await useCase.execute(dtoOf(), LEADER);
        expect(
            plain.items.find(item => item.transcriptionId === '1')?.badges,
        ).toEqual([
            { id: 'step_missing', title: 'Шаг не назначен', tone: 'bad' },
        ]);
    });

    it('суперпользователь: бейджи считаются по всем менеджерам', async () => {
        const { useCase } = harness();
        const result = await useCase.execute(dtoOf(), SUPER);
        expect(result.total).toBe(4);
        expect(
            result.facets.badges.find(facet => facet.id === 'step_missing'),
        ).toMatchObject({ count: 2 });
    });

    it('основные бейджи — из настроек отчёта портала: они заменяют набор по умолчанию и в фасетах, и в строке', async () => {
        const { useCase, portalView } = harness(undefined, () =>
            Promise.resolve(new Set(['signal', 'm:pres.b'])),
        );

        const result = await useCase.execute(dtoOf(), LEADER);

        expect(portalView.badgesMain).toHaveBeenCalledWith(DOMAIN);
        const mainBadges = result.facets.badges
            .filter(facet => facet.main)
            .map(facet => facet.id);
        expect(mainBadges).toEqual(['signal']);
        expect(
            result.facets.points.map(facet => [facet.code, facet.main]),
        ).toEqual([
            ['pres.a', false],
            ['pres.b', true],
        ]);
        // pres.a больше не основной — в строку звонка 4 не попадает.
        expect(
            result.items.find(item => item.transcriptionId === '4')?.badges,
        ).toEqual([]);
    });

    it('настройки портала не прочитались — набор по умолчанию, список отвечает', async () => {
        const { useCase } = harness(undefined, () =>
            Promise.reject(new Error('настройки недоступны')),
        );

        const result = await useCase.execute(dtoOf(), LEADER);

        expect(result.total).toBe(3);
        expect(
            result.facets.badges.find(facet => facet.id === 'step_missing'),
        ).toMatchObject({ main: true });
        expect(
            result.facets.points.find(facet => facet.code === 'pres.a'),
        ).toMatchObject({ main: true });
    });
});
