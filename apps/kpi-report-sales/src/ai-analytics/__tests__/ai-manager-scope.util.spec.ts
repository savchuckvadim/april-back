import {
    activePilotIds,
    resolveManagerScope,
} from '../domain/access/ai-manager-scope.util';
import { callReportWith } from './fixtures/manager-scope.fixture';

describe('activePilotIds: действует ли список разбора', () => {
    it('разбор включён и список непуст — список, нормализованный по возрастанию', () => {
        expect(activePilotIds(callReportWith([512, 10, 512]))).toEqual([
            10, 512,
        ]);
    });

    it('пустой список или null — ограничения нет (разбирается весь ОП)', () => {
        expect(activePilotIds(callReportWith([]))).toBeNull();
        expect(activePilotIds(callReportWith(null))).toBeNull();
    });

    it('разбор выключен — ограничения нет, даже при заполненном списке', () => {
        expect(activePilotIds(callReportWith([512], false))).toBeNull();
    });

    it('статус не прочитан — без ограничения (fail-open)', () => {
        expect(activePilotIds(undefined)).toBeNull();
    });
});

describe('resolveManagerScope: фильтр отчёта ∩ список разбора', () => {
    it('явный фильтр ∩ список разбора; скрытые считаются по фильтру', () => {
        expect(
            resolveManagerScope({
                requested: [30, 10, 20],
                roster: [],
                pilot: [10, 512],
            }),
        ).toEqual({
            managerIds: [10],
            pilotActive: true,
            hiddenByPilot: 2,
            empty: false,
        });
    });

    it('без фильтра при действующем списке — список целиком (и вне ростера ОП)', () => {
        expect(
            resolveManagerScope({ roster: [10, 20], pilot: [512, 10] }),
        ).toEqual({
            managerIds: [10, 512],
            pilotActive: true,
            hiddenByPilot: 0,
            empty: false,
        });
    });

    it('список не действует — фильтр как есть, а без него — ростер ОП', () => {
        expect(
            resolveManagerScope({
                requested: [20, 10],
                roster: [],
                pilot: null,
            }),
        ).toMatchObject({ managerIds: [10, 20], pilotActive: false });
        expect(
            resolveManagerScope({ roster: [20, 10, 30], pilot: null }),
        ).toEqual({
            managerIds: [10, 20, 30],
            pilotActive: false,
            hiddenByPilot: 0,
            empty: false,
        });
    });

    it('пустой список разбора — это «ограничения нет», а не пустой периметр', () => {
        expect(
            resolveManagerScope({ requested: [10], roster: [], pilot: [] }),
        ).toMatchObject({ managerIds: [10], pilotActive: false, empty: false });
    });

    it('пустое пересечение — empty, все выбранные скрыты', () => {
        expect(
            resolveManagerScope({
                requested: [20, 30],
                roster: [],
                pilot: [10],
            }),
        ).toEqual({
            managerIds: [],
            pilotActive: true,
            hiddenByPilot: 2,
            empty: true,
        });
    });

    it('дубли и мусор в фильтре отбрасываются до пересечения', () => {
        expect(
            resolveManagerScope({
                requested: ['10', 10, ' 20 ', 'x', 0, -5, null, undefined],
                roster: [],
                pilot: [20],
            }),
        ).toEqual({
            managerIds: [20],
            pilotActive: true,
            hiddenByPilot: 1,
            empty: false,
        });
    });

    it('фильтр из одного мусора — фильтра нет: берётся список разбора', () => {
        expect(
            resolveManagerScope({
                requested: ['x', 0],
                roster: [7],
                pilot: [10],
            }),
        ).toMatchObject({ managerIds: [10], hiddenByPilot: 0 });
    });
});
