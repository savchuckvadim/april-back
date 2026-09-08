import { defaultTargets } from '../settings/ai-settings.defaults';
import {
    settingsSanity,
    type AiSettingsClaim,
} from '../settings/ai-settings.sanity';
import {
    diffAiSettings,
    nextSettingsComparableFrom,
    comparableFromEvents,
    settingsBreakEvent,
} from '../settings/ai-settings.series';
import type { AiSettingsRaw } from '../settings/ai-settings.types';

const TODAY = '2026-09-07';

const check = (claim: AiSettingsClaim, knownManagerIds?: string[]) =>
    settingsSanity({
        claim,
        today: TODAY,
        ...(knownManagerIds ? { knownManagerIds } : {}),
    });

/** Пустой набор сырых значений — «портал ничего не решал». */
const emptyRaw: AiSettingsRaw = {
    levels: '',
    targets: '',
    absences: '',
    modelParams: '',
    managerParams: '',
    definitions: '',
    events: '',
    scoring: '',
    hypothesis: '',
    rosterConfirmedAt: '',
};

describe('settingsSanity: блокирующие проверки', () => {
    it('стаж из будущего и дубль менеджера', () => {
        const { blocking } = check({
            levels: [
                {
                    managerId: 10,
                    level: 'senior',
                    since: '2026-09-08',
                    source: 'manual',
                },
                {
                    managerId: 10,
                    level: 'junior',
                    since: null,
                    source: 'manual',
                },
            ],
        });

        expect(blocking).toHaveLength(2);
        expect(blocking.join(' ')).toContain('позже сегодняшнего дня');
        expect(blocking.join(' ')).toContain('дважды');
    });

    it('пересечение отсутствий и горизонт 90 дней', () => {
        const overlap = check({
            absences: {
                '10': [
                    { from: '2026-07-01', to: '2026-07-14', kind: 'vacation' },
                    { from: '2026-07-10', to: '2026-07-20', kind: 'sick' },
                ],
            },
        });
        const beyond = check({
            absences: {
                '10': [
                    { from: '2026-12-01', to: '2026-12-31', kind: 'vacation' },
                ],
            },
        });

        expect(overlap.blocking.join(' ')).toContain('пересекаются');
        expect(beyond.blocking.join(' ')).toContain('дальше горизонта');
    });

    it('ставка, цель и потолки — по границам реестра', () => {
        expect(
            check({ managerParams: { '10': { fteShare: 0.1 } } }).blocking,
        ).toHaveLength(1);
        expect(
            check({
                targets: {
                    ...defaultTargets(),
                    overrides: { '10': 100 },
                },
            }).blocking,
        ).toHaveLength(1);
        expect(
            check({ modelParams: { kappa_edge_early: 1000 } }).blocking.join(
                ' ',
            ),
        ).toContain('[5; 500]');
        expect(
            check({ modelParams: { forget_lambda: 'много' } }).blocking.join(
                ' ',
            ),
        ).toContain('ожидается number');
        expect(
            check({ modelParams: { нет_такого: 1 } }).blocking.join(' '),
        ).toContain('не найден в реестре');
    });

    it('справочники определений и объёмы оценивания', () => {
        expect(
            check({ definitions: { normStratum: 'команда' } }).blocking,
        ).toHaveLength(1);
        expect(
            check({ definitions: { funnelEdges: ['e1', 'e9'] } }).blocking,
        ).toHaveLength(1);
        expect(
            check({ definitions: { funnelEdges: [] } }).blocking,
        ).toHaveLength(1);
        expect(
            check({
                scoring: {
                    caps: Array.from({ length: 21 }, (_, index) => ({
                        ruleCode: `r${index}`,
                        section: 'CLOSING',
                        maxScore: 5,
                    })),
                    stopWords: [],
                },
            }).blocking.join(' '),
        ).toContain('больше 20');
    });

    it('дата подтверждения ростера: формат и «не из будущего»', () => {
        expect(check({ rosterConfirmedAt: '' }).blocking).toEqual([]);
        expect(check({ rosterConfirmedAt: TODAY }).blocking).toEqual([]);
        expect(
            check({ rosterConfirmedAt: '2026-09-08' }).blocking.join(' '),
        ).toContain('позже сегодняшнего');
        expect(
            check({ rosterConfirmedAt: 'вчера' }).blocking.join(' '),
        ).toContain('YYYY-MM-DD');
    });

    it('гипотеза: меньше двух пар, качество вне шкалы, нулевой объём', () => {
        const { blocking } = check({
            hypothesis: { pairs: [{ s: 11, n: 0 }], since: '', author: '' },
        });

        expect(blocking).toHaveLength(3);
    });
});

describe('settingsSanity: предупреждения', () => {
    it('нормы по уровню, исключение из норм и неполный ростер', () => {
        const byLevel = check({ definitions: { normStratum: 'level' } });
        const excluded = check({
            managerParams: { '10': { excludeFromNorms: true } },
        });
        const roster = check(
            {
                levels: [
                    {
                        managerId: 10,
                        level: 'senior',
                        since: null,
                        source: 'manual',
                    },
                ],
            },
            ['10', '20'],
        );

        expect(byLevel.blocking).toEqual([]);
        expect(byLevel.warnings.join(' ')).toContain('назначает руководитель');
        expect(excluded.warnings.join(' ')).toContain('исключён из норм');
        expect(roster.warnings.join(' ')).toContain('20');
    });

    it('гипотеза с растущим объёмом при росте качества — предупреждение', () => {
        const { blocking, warnings } = check({
            hypothesis: {
                pairs: [
                    { s: 5, n: 30 },
                    { s: 8, n: 50 },
                ],
                since: '',
                author: '',
            },
        });

        expect(blocking).toEqual([]);
        expect(warnings.join(' ')).toContain('обычно зависимость обратная');
    });
});

describe('Сдвиг сравнимой истории', () => {
    it('breaksSeries двигает границу, безопасные ключи — нет', () => {
        const breaking = diffAiSettings(emptyRaw, {
            ...emptyRaw,
            scoring: '{"caps":[],"stopWords":["как-то так"]}',
        });
        const safe = diffAiSettings(emptyRaw, {
            ...emptyRaw,
            absences: '{"10":[]}',
            targets: '{"byLevel":{}}',
        });

        expect(breaking[0].breaksSeries).toBe(true);
        expect(nextSettingsComparableFrom('', breaking, TODAY)).toBe(TODAY);
        expect(safe.every(change => !change.breaksSeries)).toBe(true);
        expect(nextSettingsComparableFrom('2026-08-01', safe, TODAY)).toBe(
            '2026-08-01',
        );
    });

    it('определения и гиперпараметры сравниваются по полям', () => {
        const changes = diffAiSettings(
            {
                ...emptyRaw,
                definitions:
                    '{"productiveCall":"kpi_done","confirmedOnly":false}',
                modelParams: '{"forget_lambda":0.85}',
            },
            {
                ...emptyRaw,
                definitions:
                    '{"productiveCall":"kpi_done","confirmedOnly":true,' +
                    '"hotClientColors":["green"]}',
                modelParams:
                    '{"forget_lambda":0.9,"tenure_bands":"0-9/9-18/18+"}',
            },
        );
        const codes = changes.map(change => change.code);

        expect(codes).toContain('ai_analytics_definitions.confirmedOnly');
        expect(codes).toContain('ai_analytics_definitions.hotClientColors');
        expect(codes).not.toContain('ai_analytics_definitions.productiveCall');
        expect(
            changes.find(
                change =>
                    change.code === 'ai_analytics_definitions.confirmedOnly',
            )?.breaksSeries,
        ).toBe(true);
        expect(
            changes.find(
                change =>
                    change.code === 'ai_analytics_definitions.hotClientColors',
            )?.breaksSeries,
        ).toBe(false);
        expect(
            changes.find(
                change =>
                    change.code === 'ai_analytics_model_params.tenure_bands',
            )?.breaksSeries,
        ).toBe(true);
        expect(
            changes.find(
                change =>
                    change.code === 'ai_analytics_model_params.forget_lambda',
            )?.breaksSeries,
        ).toBe(false);
    });

    it('граница восстанавливается из автособытия журнала и не едет назад', () => {
        const event = settingsBreakEvent(TODAY, ['ai_analytics_scoring']);

        expect(event.source).toBe('auto');
        expect(comparableFromEvents([event])).toBe(TODAY);
        expect(
            nextSettingsComparableFrom(
                '2026-10-01',
                [
                    {
                        code: 'ai_analytics_scoring',
                        before: '',
                        after: '{}',
                        breaksSeries: true,
                    },
                ],
                TODAY,
            ),
        ).toBe('2026-10-01');
    });
});
