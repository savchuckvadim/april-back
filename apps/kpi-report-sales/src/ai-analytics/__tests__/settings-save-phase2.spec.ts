import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
    parseAiEvents,
    parseAiHypothesis,
    parseAiScoring,
} from '@lib/sales-ai-analytics/settings/ai-settings.parse';
import { RequesterAccess } from '../domain/access/perimeter.util';
import { AiSettingsSaveRequestDto } from '../dto/ai-settings-save.dto';
import {
    auditPayload,
    lastArg,
    patchOf,
    settingsSaveHarness,
} from './fixtures/settings-save.fixture';

/** 07.09.2026 00:30 МСК = 06.09 21:30Z — в TZ портала уже 7-е. */
const NOW = new Date('2026-09-06T21:30:00Z');
const TODAY = '2026-09-07';
const DOMAIN = 'april.bitrix24.ru';

const op: RequesterAccess = { role: 'op', visibleManagerIds: ['10', '20'] };
const base = { domain: DOMAIN, requesterUserId: '447' };

const cap = (ruleCode: string, maxScore = 5) => ({
    ruleCode,
    condition: 'nextStep.set = false',
    section: 'CLOSING',
    maxScore,
    flag: 'no_next_step',
});

/** Сохранение, которое обязано упасть на проверке значений (400). */
async function expectBadRequest(
    dto: Omit<AiSettingsSaveRequestDto, 'domain' | 'requesterUserId'>,
): Promise<void> {
    const { useCase, savePortalSettings } = settingsSaveHarness();
    await expect(
        useCase.execute({ ...base, ...dto }, op, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(savePortalSettings).not.toHaveBeenCalled();
}

describe('settings/save Фазы 2: потолки оценивания', () => {
    it('больше 20 правил или maxScore вне [1; 9] → 400', async () => {
        await expectBadRequest({
            scoring: {
                caps: Array.from({ length: 21 }, (_, index) =>
                    cap(`rule_${index}`),
                ),
                stopWords: [],
            },
        });
        await expectBadRequest({
            scoring: { caps: [cap('too_high', 10)], stopWords: [] },
        });
        await expectBadRequest({
            scoring: { caps: [cap('too_low', 0)], stopWords: [] },
        });
    });

    it('больше 100 стоп-фраз → 400, неизвестный раздел → 400', async () => {
        await expectBadRequest({
            scoring: {
                caps: [],
                stopWords: Array.from(
                    { length: 101 },
                    (_, index) => `фраза ${index}`,
                ),
            },
        });
        await expectBadRequest({
            scoring: {
                caps: [{ ...cap('bad_section'), section: 'SMALL_TALK' }],
                stopWords: [],
            },
        });
    });

    it('корректный набор доезжает до формы ScoringCapRule и рвёт ряд', async () => {
        const { useCase, savePortalSettings } = settingsSaveHarness();

        const result = await useCase.execute(
            {
                ...base,
                scoring: {
                    caps: [cap('no_next_step')],
                    stopWords: ['как-то так'],
                },
            },
            op,
            NOW,
        );

        const saved = parseAiScoring(patchOf(savePortalSettings).scoring);
        expect(saved.caps).toEqual([
            {
                ruleCode: 'no_next_step',
                condition: 'nextStep.set = false',
                section: 'CLOSING',
                maxScore: 5,
                flag: 'no_next_step',
            },
        ]);
        expect(saved.stopWords).toEqual(['как-то так']);
        expect(result.breaksSeries).toEqual(['ai_analytics_scoring']);
        expect(result.comparableFrom).toBe(TODAY);
    });
});

describe('settings/save Фазы 2: гипотеза «качество → объём»', () => {
    it('меньше двух пар или s вне [3; 10] → 400', async () => {
        await expectBadRequest({ hypothesis: { pairs: [{ s: 8, n: 30 }] } });
        await expectBadRequest({
            hypothesis: {
                pairs: [
                    { s: 11, n: 30 },
                    { s: 5, n: 50 },
                ],
            },
        });
        await expectBadRequest({
            hypothesis: {
                pairs: [
                    { s: 8, n: 0 },
                    { s: 5, n: 50 },
                ],
            },
        });
    });

    it('корректная гипотеза сохраняется и делает режим hypothesis достижимым', async () => {
        const { useCase, savePortalSettings } = settingsSaveHarness();

        const result = await useCase.execute(
            {
                ...base,
                hypothesis: {
                    pairs: [
                        { s: 8, n: 30 },
                        { s: 5, n: 50 },
                    ],
                    author: '447',
                },
            },
            op,
            NOW,
        );

        const saved = parseAiHypothesis(patchOf(savePortalSettings).hypothesis);
        expect(saved?.pairs).toEqual([
            { s: 8, n: 30 },
            { s: 5, n: 50 },
        ]);
        expect(saved?.author).toBe('447');
        expect(result.breaksSeries).toEqual([]);
        expect(result.comparableFrom).toBe('');
    });
});

describe('settings/save Фазы 2: подтверждение ростера', () => {
    it('дата в будущем → 400', async () => {
        await expectBadRequest({ rosterConfirmedAt: '2026-09-08' });
    });

    it('пишет аудит с автором и не сдвигает сравнимую историю', async () => {
        const { useCase, savePortalSettings, create } = settingsSaveHarness();

        const result = await useCase.execute(
            { ...base, rosterConfirmedAt: TODAY },
            op,
            NOW,
        );

        expect(patchOf(savePortalSettings).rosterConfirmedAt).toBe(TODAY);
        expect(result.comparableFrom).toBe('');
        expect(result.breaksSeries).toEqual([]);
        const record = lastArg(create, 0) as Record<string, unknown>;
        expect(record.type).toBe('ai-analytics-settings-audit');
        expect(record.activity_id).toBe(TODAY);
        expect(record.user_id).toBe(447);
        expect(auditPayload(create)).toMatchObject({
            author: '447',
            comparableFromBefore: '',
            comparableFromAfter: '',
            changed: [
                {
                    code: 'ai_analytics_roster_confirmed_at',
                    before: '',
                    after: TODAY,
                    breaksSeries: false,
                },
            ],
        });
    });
});

describe('settings/save Фазы 2: определения, параметры и отсутствия', () => {
    it('чужой слой нормы, неизвестное ребро и κ вне диапазона → 400', async () => {
        await expectBadRequest({ definitions: { normStratum: 'team' } });
        await expectBadRequest({ definitions: { funnelEdges: ['e9'] } });
        await expectBadRequest({
            modelParams: [{ code: 'kappa_edge_early', value: 1000 }],
        });
        await expectBadRequest({
            modelParams: [{ code: 'kappa_unknown', value: 10 }],
        });
    });

    it('ставка вне [0.25; 1] и пересечение отсутствий → 400', async () => {
        await expectBadRequest({
            managerParams: [{ managerId: 10, fteShare: 5 }],
        });
        await expectBadRequest({
            absences: [
                {
                    managerId: 10,
                    items: [
                        {
                            from: '2026-07-01',
                            to: '2026-07-14',
                            kind: 'vacation',
                        },
                        { from: '2026-07-10', to: '2026-07-20', kind: 'sick' },
                    ],
                },
            ],
        });
    });

    it('смена определения продуктивного звонка сдвигает comparableFrom и пишет событие', async () => {
        const { useCase, savePortalSettings } = settingsSaveHarness();

        const result = await useCase.execute(
            { ...base, definitions: { productiveCall: 'ai_next_step_date' } },
            op,
            NOW,
        );

        expect(result.breaksSeries).toEqual([
            'ai_analytics_definitions.productiveCall',
        ]);
        expect(result.comparableFrom).toBe(TODAY);
        const events = parseAiEvents(patchOf(savePortalSettings).events);
        expect(events).toHaveLength(1);
        expect(events[0].date).toBe(TODAY);
        expect(events[0].kind).toBe('settings_break');
        expect(events[0].source).toBe('auto');
        expect(events[0].note).toContain('productiveCall');
    });

    it('цвет «горячих» и цвета — безопасная правка: ряд не рвётся', async () => {
        const { useCase } = settingsSaveHarness();

        const result = await useCase.execute(
            {
                ...base,
                definitions: { hotClientColors: ['green', 'yellow'] },
                targets: {
                    byLevel: [
                        {
                            level: 'junior',
                            sales: 3,
                            presentationsMin: 20,
                            coldPerDay: 40,
                        },
                    ],
                    overrides: [{ managerId: 10, sales: 5 }],
                },
                absences: [
                    {
                        managerId: 20,
                        items: [
                            {
                                from: '2026-07-01',
                                to: '2026-07-14',
                                kind: 'vacation',
                            },
                        ],
                    },
                ],
            },
            op,
            NOW,
        );

        expect(result.breaksSeries).toEqual([]);
        expect(result.comparableFrom).toBe('');
    });

    it('менеджер вне периметра в любом блоке → 403', async () => {
        const { useCase } = settingsSaveHarness();

        await expect(
            useCase.execute(
                {
                    ...base,
                    managerParams: [{ managerId: 999, fteShare: 0.5 }],
                },
                op,
                NOW,
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('каждое сохранение пишет аудит с изменениями и версией параметров', async () => {
        const { useCase, create } = settingsSaveHarness();

        const result = await useCase.execute(
            { ...base, modelParams: [{ code: 'forget_lambda', value: 0.9 }] },
            op,
            NOW,
        );

        expect(auditPayload(create)).toMatchObject({
            kind: 'settings-audit',
            author: '447',
            paramsVersion: result.paramsVersion,
            changed: [
                {
                    code: 'ai_analytics_model_params.forget_lambda',
                    before: '',
                    after: '0.9',
                    breaksSeries: false,
                },
            ],
        });
    });
});
