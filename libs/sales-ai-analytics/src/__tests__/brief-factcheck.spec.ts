import {
    AI_BRIEF_DROP_REASONS,
    AI_BRIEF_LIMITS,
    AI_BRIEF_MODEL_GROUPS,
    AI_BRIEF_TEMPLATE_REASONS,
    AiBriefBullet,
    AiBriefBulletGroup,
    AiBriefFact,
} from '../contracts/ai-brief.contract';
import {
    AI_BRIEF_COMPARE_TEXTS,
    AI_BRIEF_NO_ACTIONS_TEXT,
} from '../contracts/ai-brief.rules';
import {
    AI_BRIEF_JSON_SCHEMA,
    AI_BRIEF_MODEL_BULLETS,
} from '../contracts/ai-brief.schema';
import { factCheckBullets } from '../model/brief-factcheck';
import { extractNumbers, formatFactValue } from '../model/brief-numbers';
import { trimEvidencePack } from '../model/brief-pack';
import { validateBriefPayload } from '../model/brief-payload';
import {
    buildBriefFromLlm,
    buildTemplateBrief,
    type BriefContext,
} from '../model/brief-template';

const LINK = 'https://april.bitrix24.ru/crm/type/1036/details/128/';

const FACTS: AiBriefFact[] = [
    {
        code: 'alert.promise',
        kind: 'alert',
        title: 'Невыполненные обещания',
        value: 3,
        unit: 'count',
        n: 57,
        text: 'Невыполненные обещания: 3 (было 7)',
        managerId: '12',
        prev: 7,
        delta: -4,
        deltaPct: -57.1,
        comparable: true,
        link: LINK,
    },
    {
        code: 'edge.e1',
        kind: 'deviation',
        title: 'Конверсия звонок в презентацию',
        value: 0.4523,
        unit: 'share',
        n: 112,
        text: 'Конверсия звонок в презентацию: 45,2 %',
        norm: 0.5,
        comparable: false,
    },
    {
        code: 'fin.advance',
        kind: 'finance',
        title: 'Аванс против плана',
        value: 1234567,
        unit: 'rub',
        n: 34,
        text: `Аванс против плана: ${formatFactValue(1234567, 'rub')}`,
        plan: 2000000,
        comparable: false,
    },
    {
        code: 'disc.plan',
        kind: 'discipline',
        title: 'План CRM выполнен',
        value: 62,
        unit: 'pct',
        n: 80,
        text: 'План CRM выполнен: 62,0 %',
        comparable: false,
    },
    {
        code: 'tel.long',
        kind: 'telephony',
        title: 'Доля звонков дольше 300 секунд',
        value: 0.38,
        unit: 'share',
        n: 400,
        text: 'Доля звонков дольше 300 секунд: 38,0 %',
        comparable: false,
    },
];

const PACK = trimEvidencePack(FACTS);

const CTX: BriefContext = {
    from: '2026-09-01',
    to: '2026-09-07',
    generatedAt: '2026-09-08T06:15:00.000Z',
};

const bullet = (
    text: string,
    refs: string[],
    group: AiBriefBulletGroup = 'change',
    extra: Partial<AiBriefBullet> = {},
): AiBriefBullet => ({ text, group, factRefs: refs, ...extra });

const payload = (
    bullets: AiBriefBullet[],
    headline = 'Итоги недели',
): unknown => ({
    headline,
    tone: 'attention',
    bullets: bullets.map(item => ({ ...item, factRefs: [...item.factRefs] })),
});

describe('validateBriefPayload: строгая схема ответа', () => {
    it('заголовок длиннее 140 символов отклоняется целиком', () => {
        const result = validateBriefPayload(
            payload(
                [bullet('Невыполненных обещаний 3', ['alert.promise'])],
                'я'.repeat(141),
            ),
            PACK,
        );

        expect(result.payload).toBeNull();
        expect(result.errors).toEqual(['headline-too-long']);
    });

    it('каузальный заголовок отклоняется', () => {
        const result = validateBriefPayload(
            payload(
                [bullet('Невыполненных обещаний 3', ['alert.promise'])],
                'Продажи упали из-за качества презентаций',
            ),
            PACK,
        );

        expect(result.payload).toBeNull();
        expect(result.errors).toEqual(['headline-causal-claim']);
    });

    it('буллет длиннее 30 слов выбрасывается', () => {
        const long = Array.from({ length: 31 }, () => 'слово').join(' ');
        const result = validateBriefPayload(
            payload([
                bullet(long, ['alert.promise']),
                bullet('Невыполненных обещаний 3', ['alert.promise']),
            ]),
            PACK,
        );

        expect(result.payload?.bullets).toHaveLength(1);
        expect(result.dropped[0].reason).toBe(
            AI_BRIEF_DROP_REASONS.tooManyWords,
        );
    });

    it('группа обязательна и известна: буллет без группы отбрасывается', () => {
        const result = validateBriefPayload(
            {
                headline: 'Итоги',
                tone: 'calm',
                bullets: [
                    { text: 'Обещаний 3', factRefs: ['alert.promise'] },
                    {
                        text: 'Обещаний 3',
                        group: 'summary',
                        factRefs: ['alert.promise'],
                    },
                    bullet('Обещаний 3', ['alert.promise'], 'focus'),
                ],
            },
            PACK,
        );

        expect(result.payload?.bullets).toHaveLength(1);
        expect(result.dropped.map(item => item.reason)).toEqual([
            AI_BRIEF_DROP_REASONS.groupUnknown,
            AI_BRIEF_DROP_REASONS.groupUnknown,
        ]);
        expect(result.dropped[1].detail).toBe('summary');
    });

    it('пятый буллет группы change и четвёртый группы focus отклоняются лимитом группы', () => {
        const five = Array.from({ length: 5 }, (_, index) =>
            bullet(`Невыполненных обещаний 3 (${index})`, ['alert.promise']),
        );
        const byGroup = validateBriefPayload(payload(five), PACK);

        expect(byGroup.payload?.bullets).toHaveLength(
            AI_BRIEF_LIMITS.groups.change,
        );
        expect(byGroup.dropped).toEqual([
            {
                text: 'Невыполненных обещаний 3 (4)',
                reason: AI_BRIEF_DROP_REASONS.groupOverLimit,
                detail: 'change',
            },
        ]);

        const nine = [
            ...Array.from({ length: 5 }, () =>
                bullet('Обещаний 3', ['alert.promise'], 'change'),
            ),
            ...Array.from({ length: 4 }, () =>
                bullet('Обещаний 3', ['alert.promise'], 'focus'),
            ),
        ];
        const total = validateBriefPayload(payload(nine), PACK);

        expect(total.payload?.bullets).toHaveLength(AI_BRIEF_MODEL_BULLETS);
        expect(total.dropped.map(item => item.detail)).toEqual([
            'change',
            'focus',
        ]);
    });

    it('действие в ответе модели не принимается: действия выводят правила пакета', () => {
        const result = validateBriefPayload(
            payload([
                bullet('Обещаний 3', ['alert.promise'], 'change'),
                bullet('Провести тренинг', ['alert.promise'], 'action'),
                bullet('Отдельных действий не требуется', [], 'action'),
            ]),
            PACK,
        );

        expect(result.payload?.bullets.map(item => item.group)).toEqual([
            'change',
        ]);
        expect(result.dropped).toEqual([
            {
                text: 'Провести тренинг',
                reason: AI_BRIEF_DROP_REASONS.groupUnknown,
                detail: 'action',
            },
            {
                text: 'Отдельных действий не требуется',
                reason: AI_BRIEF_DROP_REASONS.groupUnknown,
                detail: 'action',
            },
        ]);
        const schema = AI_BRIEF_JSON_SCHEMA as {
            properties: {
                bullets: {
                    maxItems: number;
                    items: { properties: { group: { enum: string[] } } };
                };
            };
        };
        expect(schema.properties.bullets.items.properties.group.enum).toEqual([
            ...AI_BRIEF_MODEL_GROUPS,
        ]);
        expect(schema.properties.bullets.maxItems).toBe(AI_BRIEF_MODEL_BULLETS);
    });

    it('битая форма ответа и пустой пакет отклоняются', () => {
        expect(validateBriefPayload('не объект', PACK).payload).toBeNull();
        expect(
            validateBriefPayload(
                payload([bullet('Обещаний 3', ['alert.promise'])]),
                trimEvidencePack([]),
            ).errors,
        ).toEqual(['empty-pack']);
    });
});

describe('factCheckBullets: каждое число — из пакета', () => {
    it('число вне пакета выбрасывает буллет', () => {
        const result = factCheckBullets(
            [
                bullet('Невыполненных обещаний 3', ['alert.promise']),
                bullet('Продажи выросли до 77', ['fin.advance']),
            ],
            PACK,
        );

        expect(result.kept).toHaveLength(1);
        expect(result.dropped[0].reason).toBe(
            AI_BRIEF_DROP_REASONS.numberNotInPack,
        );
        expect(result.passRatePct).toBe(50);
    });

    it('прошлый период, изменение, проценты изменения, норма и план — числа пакета', () => {
        const result = factCheckBullets(
            [
                bullet('Обещаний 3, за прошлый период 7', ['alert.promise']),
                bullet('Обещаний меньше на 4', ['alert.promise']),
                bullet('Обещаний меньше на 57 %', ['alert.promise']),
                bullet('Конверсия 45,2 % при норме 50 %', ['edge.e1']),
                bullet('Аванс 1,2 млн при плане 2 млн', ['fin.advance']),
            ],
            PACK,
        );

        expect(result.passRatePct).toBe(100);
    });

    it('ссылка на несуществующий факт выбрасывает буллет', () => {
        const result = factCheckBullets(
            [bullet('Невыполненных обещаний 3', ['fin.unknown'])],
            PACK,
        );

        expect(result.dropped[0].reason).toBe(
            AI_BRIEF_DROP_REASONS.unknownFactRef,
        );
    });

    it('без ссылок на факты проходят только служебные пункты своей группы', () => {
        const result = factCheckBullets(
            [
                bullet('Невыполненных обещаний 3', []),
                bullet('Отработать 3 обещания', [], 'action'),
                // Придуманное действие без чисел и без факта за ним.
                bullet('Провести тренинг по возражениям', [], 'action'),
                // Служебная фраза чужой группы служебной не считается.
                bullet(AI_BRIEF_NO_ACTIONS_TEXT, [], 'change'),
                bullet(AI_BRIEF_NO_ACTIONS_TEXT, [], 'action'),
                bullet(AI_BRIEF_COMPARE_TEXTS['no-data'], [], 'change'),
            ],
            PACK,
        );

        expect(result.kept.map(item => item.text)).toEqual([
            AI_BRIEF_NO_ACTIONS_TEXT,
            AI_BRIEF_COMPARE_TEXTS['no-data'],
        ]);
        expect(result.dropped.map(item => item.reason)).toEqual([
            AI_BRIEF_DROP_REASONS.noFactRefs,
            AI_BRIEF_DROP_REASONS.noFactRefs,
            AI_BRIEF_DROP_REASONS.noFactRefs,
            AI_BRIEF_DROP_REASONS.noFactRefs,
        ]);
    });

    it('ссылка буллета обязана совпадать со ссылкой факта пакета', () => {
        const result = factCheckBullets(
            [
                bullet('Обещаний 3', ['alert.promise'], 'focus', {
                    link: LINK,
                }),
                bullet('Обещаний 3', ['alert.promise'], 'focus', {
                    link: 'https://evil.example/',
                }),
            ],
            PACK,
        );

        expect(result.kept).toHaveLength(1);
        expect(result.dropped[0].reason).toBe(
            AI_BRIEF_DROP_REASONS.unknownLink,
        );
    });

    it('менеджер буллета фокуса обязан принадлежать факту из ссылок', () => {
        const result = factCheckBullets(
            [
                bullet('Обещаний 3', ['alert.promise'], 'focus', {
                    managerId: '12',
                }),
                bullet('Обещаний 3', ['alert.promise'], 'focus', {
                    managerId: '99',
                }),
                bullet('Обещаний 3', ['alert.promise'], 'change', {
                    managerId: '99',
                }),
            ],
            PACK,
        );

        expect(result.kept).toHaveLength(2);
        expect(result.dropped[0].reason).toBe(
            AI_BRIEF_DROP_REASONS.managerNotInRefs,
        );
    });

    it('стоп-слово «значимо» и каузальный оборот отклоняются', () => {
        const result = factCheckBullets(
            [
                bullet('Конверсия значимо ниже нормы', ['edge.e1']),
                bullet('План CRM 62 % из-за отпуска', ['disc.plan']),
                bullet('Невыполненных обещаний 3', ['alert.promise']),
            ],
            PACK,
        );

        expect(result.kept).toHaveLength(1);
        expect(result.dropped.map(item => item.reason)).toEqual([
            AI_BRIEF_DROP_REASONS.forbiddenWord,
            AI_BRIEF_DROP_REASONS.causal,
        ]);
    });

    it('округление и проценты доли — то же число пакета', () => {
        const result = factCheckBullets(
            [
                bullet('Конверсия 45 %', ['edge.e1']),
                bullet('Конверсия 45,2 %', ['edge.e1']),
                bullet('Конверсия 0,45', ['edge.e1']),
                bullet('Аванс 1,2 млн', ['fin.advance']),
            ],
            PACK,
        );

        expect(result.passRatePct).toBe(100);
    });

    it('даты и недели числами не считаются', () => {
        const result = factCheckBullets(
            [bullet('С 2026-09-01 обещаний 3', ['alert.promise'])],
            PACK,
        );

        expect(result.kept).toHaveLength(1);
    });

    it('даты словами числами не считаются, а год сам по себе — число', () => {
        expect(extractNumbers('За 1–7 сентября 2026 обещаний 3')).toEqual([3]);
        expect(
            extractNumbers('С 25 августа по 7 сентября 2026 года обещаний 3'),
        ).toEqual([3]);
        expect(extractNumbers('К 31 декабря 2026 г. обещаний 3')).toEqual([3]);
        expect(extractNumbers('В 2026 обещаний 3')).toEqual([2026, 3]);
        expect(extractNumbers('За 3 месяца обещаний 7')).toEqual([3, 7]);

        const result = factCheckBullets(
            [
                bullet('За 1–7 сентября 2026 обещаний 3', ['alert.promise']),
                bullet('За 1–7 сентября обещаний 9', ['alert.promise']),
            ],
            PACK,
        );

        expect(result.kept).toHaveLength(1);
        expect(result.dropped[0].reason).toBe(
            AI_BRIEF_DROP_REASONS.numberNotInPack,
        );
    });
});

/** Стили печати числа, которыми модель реально пользуется. */
function styledValue(fact: AiBriefFact, style: number): string {
    const value = fact.value ?? 0;
    const shown = fact.unit === 'share' ? value * 100 : value;
    if (style === 0) {
        return formatFactValue(fact.value, fact.unit);
    }
    if (style === 1) {
        return `${Math.round(shown)}`;
    }
    if (style === 2) {
        return `${Math.round(shown * 10) / 10}`.replace('.', ',');
    }

    return `${shown}`;
}

const GROUPS: AiBriefBulletGroup[] = ['change', 'focus', 'action'];

describe('толерантность факт-чека к форматам чисел (не измерение LLM): 20 прогонов ответов версии 2', () => {
    it('не меньше 95 % буллетов трёх групп проходят факт-чек', () => {
        let total = 0;
        let kept = 0;
        for (let run = 0; run < 20; run += 1) {
            const bullets = [0, 1, 2].map(offset => {
                const fact = PACK.facts[(run + offset) % PACK.facts.length];
                const prev =
                    fact.prev === null || fact.prev === undefined
                        ? ''
                        : `, за прошлый период ${fact.prev}`;

                return bullet(
                    `${fact.title} — ${styledValue(fact, (run + offset) % 4)}${prev}`,
                    [fact.code],
                    GROUPS[offset],
                );
            });
            const result = factCheckBullets(bullets, PACK);
            total += bullets.length;
            kept += result.kept.length;
        }

        expect(total).toBe(60);
        expect((kept / total) * 100).toBeGreaterThanOrEqual(95);
    });
});

describe('buildBriefFromLlm: шаблон как штатная деградация', () => {
    it('меньше двух прошедших буллетов — шаблон с причиной', () => {
        const outcome = buildBriefFromLlm(
            payload([
                bullet('Невыполненных обещаний 3', ['alert.promise']),
                bullet('Продажи выросли до 77', ['fin.advance']),
            ]),
            PACK,
            CTX,
        );

        expect(outcome.brief.source).toBe('template');
        expect(outcome.brief.reason).toBe(
            AI_BRIEF_TEMPLATE_REASONS.factcheckFailed,
        );
        expect(outcome.brief.packHash).toBe(PACK.hash);
    });

    it('два прошедших буллета — резюме модели', () => {
        const outcome = buildBriefFromLlm(
            payload([
                bullet('Невыполненных обещаний 3', ['alert.promise']),
                bullet('Конверсия 45,2 %', ['edge.e1']),
            ]),
            PACK,
            CTX,
        );

        expect(outcome.brief.source).toBe('llm');
        expect(outcome.brief.reason).toBeNull();
        expect(outcome.brief.bullets).toHaveLength(2);
        expect(outcome.passRatePct).toBe(100);
    });

    it('негодная схема ответа — шаблон invalid-payload', () => {
        const outcome = buildBriefFromLlm({ headline: '' }, PACK, CTX);

        expect(outcome.brief.reason).toBe(
            AI_BRIEF_TEMPLATE_REASONS.invalidPayload,
        );
    });

    it('шаблонное резюме само проходит факт-чек', () => {
        const brief = buildTemplateBrief(
            PACK,
            CTX,
            AI_BRIEF_TEMPLATE_REASONS.noLlmKey,
        );
        const checked = factCheckBullets(brief.bullets, PACK);

        expect(brief.tone).toBe('alarm');
        expect(brief.headline.length).toBeLessThanOrEqual(
            AI_BRIEF_LIMITS.headline,
        );
        expect(checked.passRatePct).toBe(100);
    });
});
