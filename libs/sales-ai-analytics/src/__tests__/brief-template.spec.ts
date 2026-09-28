import {
    AI_BRIEF_COMPARE_REASONS,
    AI_BRIEF_LIMITS,
    AI_BRIEF_TEMPLATE_REASONS,
    type AiBriefFact,
    type AiBriefFactUnit,
    type AiEvidencePack,
    type BriefCompareStatus,
} from '../contracts/ai-brief.contract';
import {
    AI_BRIEF_ACTION_CODES,
    AI_BRIEF_COMPARE_TEXTS,
    AI_BRIEF_DATA_QUALITY_SIGNALS,
    AI_BRIEF_FOCUS_CODES,
    AI_BRIEF_NO_ACTIONS_TEXT,
} from '../contracts/ai-brief.rules';
import { compareFact } from '../model/brief-delta';
import { factCheckBullets } from '../model/brief-factcheck';
import { trimEvidencePack } from '../model/brief-pack';
import {
    AI_BRIEF_HEADLINE_NUMBER_ERROR,
    buildBriefFromLlm,
    buildTemplateBrief,
    toneForPack,
    type BriefContext,
} from '../model/brief-template';
import {
    actionBullets,
    changeBullets,
    focusBullets,
    templateHeadline,
} from '../model/brief-template.groups';

const CTX: BriefContext = {
    from: '2026-09-01',
    to: '2026-09-07',
    generatedAt: '2026-09-08T06:15:00.000Z',
};

const COMPARED: BriefCompareStatus = {
    previousPeriod: { from: '2026-08-25', to: '2026-08-31' },
    reason: null,
};

const LINK = 'https://april.bitrix24.ru/crm/type/1036/details/128/';

interface FactOptions {
    prev?: number | null;
    unit?: AiBriefFactUnit;
    title?: string;
    text?: string;
    link?: string | null;
    managerId?: string;
    signal?: string;
}

function fact(
    code: string,
    kind: AiBriefFact['kind'],
    value: number,
    options: FactOptions = {},
): AiBriefFact {
    const unit = options.unit ?? 'count';
    const title = options.title ?? `Факт ${code}`;
    const prev = options.prev ?? null;
    const { delta, deltaPct } = compareFact(value, prev);
    const shown =
        unit === 'share'
            ? `${(value * 100).toFixed(1).replace('.', ',')} %`
            : String(value);

    return {
        code,
        kind,
        title,
        value,
        unit,
        text: options.text ?? `${title}: ${shown}`,
        prev,
        delta,
        deltaPct,
        comparable: prev !== null,
        ...(options.link === undefined ? {} : { link: options.link }),
        ...(options.managerId === undefined
            ? {}
            : { managerId: options.managerId }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    };
}

/** Пакет из фактов версии 2: изменения, фокус и все входы действий. */
function fullFacts(): AiBriefFact[] {
    return [
        fact(AI_BRIEF_ACTION_CODES.alerts, 'alert', 68, {
            prev: 31,
            title: 'Сигналов риска за период',
        }),
        fact(AI_BRIEF_ACTION_CODES.alertsUnhandled, 'alert', 5, {
            title: 'Неотработанных сигналов риска в пульсе',
            link: LINK,
        }),
        fact('attention', 'deviation', 4, { prev: 2 }),
        fact(AI_BRIEF_FOCUS_CODES[0], 'deviation', 3, {
            text: 'Сигналы риска: 3 — Иванов',
            managerId: '12',
            link: LINK,
            signal: 'risk',
        }),
        fact(AI_BRIEF_FOCUS_CODES[1], 'deviation', 12, {
            text: 'Дисциплина CRM: звонков 12 из плана 40',
            managerId: '15',
            link: null,
            signal: 'discipline',
        }),
        fact(AI_BRIEF_ACTION_CODES.funnelGap, 'deviation', -0.06, {
            unit: 'share',
            title: 'Сильнее всего отстаём от нормы на шаге «звонок → презентация»',
        }),
        fact('plan_vs_fact_sales', 'finance', 3, {
            prev: 5,
            title: 'Продаж за период',
        }),
        fact(AI_BRIEF_ACTION_CODES.disciplineNextStep, 'discipline', 0.178, {
            prev: 0.224,
            unit: 'share',
            title: 'Доля звонков с назначенным шагом и датой',
        }),
        fact(AI_BRIEF_ACTION_CODES.agenda, 'discipline', 3, {
            title: 'Звонков в повестке планёрки',
            link: LINK,
        }),
        fact('calls_over_threshold', 'telephony', 408, {
            prev: 350,
            title: 'Разобрано звонков за период',
        }),
        fact(AI_BRIEF_ACTION_CODES.dataQuality, 'data-quality', 2, {
            signal: AI_BRIEF_DATA_QUALITY_SIGNALS.dates,
        }),
    ];
}

const fullPack = (compare: BriefCompareStatus = COMPARED): AiEvidencePack =>
    trimEvidencePack(fullFacts(), { compare });

const groupsOf = (pack: AiEvidencePack) =>
    buildTemplateBrief(
        pack,
        CTX,
        AI_BRIEF_TEMPLATE_REASONS.noLlmKey,
    ).bullets.map(bullet => bullet.group);

describe('buildTemplateBrief: три группы и лимиты', () => {
    it('порядок групп change → focus → action, лимиты на группу соблюдены', () => {
        const pack = fullPack();
        const groups = groupsOf(pack);

        expect(groups.indexOf('focus')).toBeGreaterThan(
            groups.indexOf('change'),
        );
        expect(groups.indexOf('action')).toBeGreaterThan(
            groups.indexOf('focus'),
        );
        expect(groups.filter(g => g === 'change').length).toBeLessThanOrEqual(
            AI_BRIEF_LIMITS.groups.change,
        );
        expect(groups.filter(g => g === 'focus')).toHaveLength(2);
        expect(groups.filter(g => g === 'action')).toHaveLength(
            AI_BRIEF_LIMITS.groups.action,
        );
        expect(groups.length).toBeLessThanOrEqual(AI_BRIEF_LIMITS.bullets);
    });

    it('заголовок — самое сильное изменение одной фразой', () => {
        expect(templateHeadline(fullPack(), CTX.from, CTX.to)).toBe(
            'Сигналов риска за период: 68 — вдвое больше, чем за прошлый период (31)',
        );
    });

    it('изменения идут от сильного к слабому и несут дельту', () => {
        const bullets = changeBullets(fullPack());

        expect(bullets.map(bullet => bullet.factRefs[0])).toEqual([
            'alerts',
            'attention',
            'plan_vs_fact_sales',
            'discipline_next_step',
        ]);
        expect(bullets[0].text).toBe(
            'Сигналов риска за период: 68 — вдвое больше, чем за прошлый период (31)',
        );
        expect(bullets[0].delta).toBe(37);
        expect(bullets[2].text).toBe(
            'Продаж за период: 3 — меньше на 2, чем за прошлый период (5)',
        );
    });

    it('фокус: до трёх карточек с менеджером и ссылкой', () => {
        const bullets = focusBullets(fullPack());

        expect(bullets).toHaveLength(2);
        expect(bullets[0]).toEqual({
            text: 'Сигналы риска: 3 — Иванов',
            group: 'focus',
            factRefs: ['focus_1'],
            managerId: '12',
            link: LINK,
        });
        expect(bullets[1].link).toBeNull();
    });

    it('действия: неотработанные сигналы → повестка → просевшая дисциплина', () => {
        const bullets = actionBullets(fullPack());

        expect(bullets.map(bullet => bullet.text)).toEqual([
            'Отработать 5 сигналов риска в пульсе',
            'Разобрать на планёрке звонки повестки (3)',
            'Напомнить про следующий шаг с датой: 17,8 % звонков — ниже, чем за прошлый период (было 22,4 %)',
        ]);
        expect(bullets[0].link).toBe(LINK);
        expect(bullets.every(bullet => bullet.group === 'action')).toBe(true);
    });

    it('разрыв к норме и даты в сделках дают свои действия', () => {
        const pack = trimEvidencePack(
            fullFacts().filter(item =>
                (
                    [
                        AI_BRIEF_ACTION_CODES.funnelGap,
                        AI_BRIEF_ACTION_CODES.dataQuality,
                    ] as string[]
                ).includes(item.code),
            ),
        );

        expect(actionBullets(pack).map(bullet => bullet.text)).toEqual([
            'Разобрать шаг «звонок → презентация»: отстаём от нормы на 6 %',
            'Проверить даты в сделках',
        ]);
    });

    it('замечания не про даты — «Проверить качество данных: N замечаний»', () => {
        const pack = trimEvidencePack([
            fact(AI_BRIEF_ACTION_CODES.dataQuality, 'data-quality', 3, {
                signal: AI_BRIEF_DATA_QUALITY_SIGNALS.other,
            }),
        ]);

        expect(actionBullets(pack)[0].text).toBe(
            'Проверить качество данных: 3 замечания',
        );
    });

    it('ниже порогов действий нет: «Отдельных действий не требуется» без ссылок на факты', () => {
        const pack = trimEvidencePack(
            [
                fact(AI_BRIEF_ACTION_CODES.alertsUnhandled, 'alert', 0),
                fact(
                    AI_BRIEF_ACTION_CODES.disciplineNextStep,
                    'discipline',
                    0.21,
                    {
                        prev: 0.224,
                        unit: 'share',
                    },
                ),
                fact(AI_BRIEF_ACTION_CODES.funnelGap, 'deviation', -0.02, {
                    unit: 'share',
                }),
            ],
            { compare: COMPARED },
        );
        const bullets = actionBullets(pack);

        expect(bullets).toEqual([
            { text: AI_BRIEF_NO_ACTIONS_TEXT, group: 'action', factRefs: [] },
        ]);
        expect(factCheckBullets(bullets, pack).passRatePct).toBe(100);
    });

    it('без сравнения фраза о причине идёт один раз первым пунктом, дельт нет', () => {
        const pack = trimEvidencePack(
            fullFacts().map(item => ({
                ...item,
                prev: null,
                delta: null,
                deltaPct: null,
                comparable: false,
            })),
            {
                compare: {
                    previousPeriod: null,
                    reason: AI_BRIEF_COMPARE_REASONS.beforeComparable,
                },
            },
        );
        const bullets = changeBullets(pack);

        expect(bullets[0].text).toBe(
            AI_BRIEF_COMPARE_TEXTS['before-comparable'],
        );
        // Служебная фраза ни на один факт не ссылается.
        expect(bullets[0].factRefs).toEqual([]);
        expect(
            bullets.filter(bullet => bullet.text === bullets[0].text),
        ).toHaveLength(1);
        expect(bullets.every(bullet => bullet.delta === undefined)).toBe(true);
        expect(bullets).toHaveLength(AI_BRIEF_LIMITS.groups.change);
        expect(templateHeadline(pack, CTX.from, CTX.to)).toBe(
            'Сводка отдела продаж за 1–7 сентября 2026: сравнения с прошлым периодом нет',
        );
        expect(factCheckBullets(bullets, pack).passRatePct).toBe(100);
    });

    it('пакет без сравнения не печатает изменений, даже если факты несут прошлые значения', () => {
        for (const reason of Object.values(AI_BRIEF_COMPARE_REASONS)) {
            const pack = fullPack({ previousPeriod: null, reason });
            const brief = buildTemplateBrief(
                pack,
                CTX,
                AI_BRIEF_TEMPLATE_REASONS.noLlmKey,
            );
            const texts = brief.bullets.map(bullet => bullet.text);

            expect(texts[0]).toBe(AI_BRIEF_COMPARE_TEXTS[reason]);
            expect(texts.slice(1).join(' ')).not.toMatch(/прошлый период|было/);
            expect(brief.headline).not.toMatch(/чем за прошлый период/);
            expect(
                brief.bullets.every(bullet => bullet.delta === undefined),
            ).toBe(true);
            // Просевшая дисциплина без сравнения действием не становится.
            expect(texts.join(' ')).not.toMatch(/Напомнить про следующий шаг/);
        }
    });

    it('сравнение есть, но ничего не изменилось — заголовок говорит об этом', () => {
        const pack = trimEvidencePack(
            [
                fact('plan_vs_fact_sales', 'finance', 5, { prev: 5 }),
                fact('calls_over_threshold', 'telephony', 350, { prev: 350 }),
            ],
            { compare: COMPARED },
        );

        expect(templateHeadline(pack, CTX.from, CTX.to)).toBe(
            'Сводка отдела продаж за 1–7 сентября 2026: показатели на уровне прошлого периода',
        );
    });

    it('«действий не требуется» говорится только по фактам, по которым правила решают', () => {
        const withoutInputs = trimEvidencePack(
            [fact('plan_vs_fact_sales', 'finance', 3, { prev: 5 })],
            { compare: COMPARED },
        );
        const withInputs = trimEvidencePack(
            [fact(AI_BRIEF_ACTION_CODES.agenda, 'discipline', 0)],
            { compare: COMPARED },
        );

        expect(actionBullets(withoutInputs)).toEqual([]);
        expect(actionBullets(withInputs).map(bullet => bullet.text)).toEqual([
            AI_BRIEF_NO_ACTIONS_TEXT,
        ]);
    });

    it('шаблон целиком проходит факт-чек и не длиннее лимитов', () => {
        for (const pack of [
            fullPack(),
            fullPack({
                previousPeriod: null,
                reason: AI_BRIEF_COMPARE_REASONS.prevNotReady,
            }),
        ]) {
            const brief = buildTemplateBrief(
                pack,
                CTX,
                AI_BRIEF_TEMPLATE_REASONS.noLlmKey,
            );
            const checked = factCheckBullets(brief.bullets, pack);

            expect(checked.passRatePct).toBe(100);
            expect(brief.headline.length).toBeLessThanOrEqual(
                AI_BRIEF_LIMITS.headline,
            );
            expect(brief.bullets.length).toBeLessThanOrEqual(
                AI_BRIEF_LIMITS.bullets,
            );
            expect(brief.source).toBe('template');
            expect(brief.promptVersion).toBe('brief-2.0.0');
        }
    });

    it('тон: алерты — alarm, отклонения — attention, иначе calm; пустой пакет — без буллетов', () => {
        expect(toneForPack(fullPack())).toBe('alarm');
        expect(
            toneForPack(trimEvidencePack([fact('attention', 'deviation', 1)])),
        ).toBe('attention');
        expect(
            toneForPack(trimEvidencePack([fact('calls', 'telephony', 1)])),
        ).toBe('calm');
        // Ноль сигналов риска и ноль отклонений тон не поднимают.
        expect(
            toneForPack(
                trimEvidencePack([
                    fact(AI_BRIEF_ACTION_CODES.alerts, 'alert', 0),
                    fact('attention', 'deviation', 0),
                ]),
            ),
        ).toBe('calm');
        const empty = buildTemplateBrief(
            trimEvidencePack([]),
            CTX,
            AI_BRIEF_TEMPLATE_REASONS.noLlmKey,
        );
        expect(empty.bullets).toEqual([]);
        expect(empty.headline).toBe(
            'Сводка отдела продаж за 1–7 сентября 2026: данных нет',
        );
    });
});

describe('buildBriefFromLlm: изменения и фокус — от модели, действия — от правил', () => {
    const answer = (headline: string, extra: unknown[] = []) => ({
        headline,
        tone: 'alarm',
        bullets: [
            {
                text: 'Иванов: три сигнала риска за неделю',
                group: 'focus',
                managerId: '12',
                factRefs: ['focus_1'],
                link: LINK,
            },
            {
                text: 'Сигналов риска 68, за прошлый период 31',
                group: 'change',
                factRefs: ['alerts'],
            },
            ...extra,
        ],
    });

    it('change-буллет несёт delta факта, группы идут в порядке витрины', () => {
        const outcome = buildBriefFromLlm(
            answer('Сигналов риска вдвое больше'),
            fullPack(),
            CTX,
        );

        expect(outcome.brief.source).toBe('llm');
        expect(outcome.brief.headline).toBe('Сигналов риска вдвое больше');
        expect(outcome.brief.bullets.map(bullet => bullet.group)).toEqual([
            'change',
            'focus',
            'action',
            'action',
            'action',
        ]);
        expect(outcome.brief.bullets[0].delta).toBe(37);
        expect(outcome.brief.bullets[1].delta).toBeUndefined();
        expect(outcome.brief.bullets[1].link).toBe(LINK);
    });

    it('действия модели не принимаются: в резюме идут действия правил пакета', () => {
        const pack = fullPack();
        const outcome = buildBriefFromLlm(
            answer('Сигналов риска вдвое больше', [
                {
                    text: 'Провести тренинг по работе с возражениями',
                    group: 'action',
                    factRefs: ['alerts'],
                },
            ]),
            pack,
            CTX,
        );
        const actions = outcome.brief.bullets.filter(
            bullet => bullet.group === 'action',
        );

        expect(actions).toEqual(actionBullets(pack));
        expect(outcome.dropped).toEqual([
            {
                text: 'Провести тренинг по работе с возражениями',
                reason: 'group-unknown',
                detail: 'action',
            },
        ]);
        expect(factCheckBullets(outcome.brief.bullets, pack).passRatePct).toBe(
            100,
        );
    });

    it('заголовок модели с числом не из пакета заменяется шаблонным', () => {
        const pack = fullPack();
        const alien = buildBriefFromLlm(
            answer('Сигналов риска стало 70'),
            pack,
            CTX,
        );
        const dated = buildBriefFromLlm(
            answer('За 1–7 сентября 2026 сигналов риска 68 против 31'),
            pack,
            CTX,
        );

        expect(alien.brief.source).toBe('llm');
        expect(alien.brief.headline).toBe(
            templateHeadline(pack, CTX.from, CTX.to),
        );
        expect(alien.errors).toContain(AI_BRIEF_HEADLINE_NUMBER_ERROR);
        // Дата словами числом отчёта не считается.
        expect(dated.brief.headline).toBe(
            'За 1–7 сентября 2026 сигналов риска 68 против 31',
        );
        expect(dated.errors).not.toContain(AI_BRIEF_HEADLINE_NUMBER_ERROR);
    });

    it('у пакета без сравнения буллет модели дельту не получает', () => {
        const outcome = buildBriefFromLlm(
            answer('Сигналов риска 68'),
            fullPack({
                previousPeriod: null,
                reason: AI_BRIEF_COMPARE_REASONS.noData,
            }),
            CTX,
        );

        expect(outcome.brief.source).toBe('llm');
        expect(
            outcome.brief.bullets.every(bullet => bullet.delta === undefined),
        ).toBe(true);
    });
});
