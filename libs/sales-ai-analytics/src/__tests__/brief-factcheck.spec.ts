import {
    AI_BRIEF_DROP_REASONS,
    AI_BRIEF_LIMITS,
    AI_BRIEF_TEMPLATE_REASONS,
    AiBriefBullet,
    AiBriefFact,
} from '../contracts/ai-brief.contract';
import {
    factCheckBullets,
    validateBriefPayload,
} from '../model/brief-factcheck';
import { formatFactValue } from '../model/brief-numbers';
import { trimEvidencePack } from '../model/brief-pack';
import {
    buildBriefFromLlm,
    buildTemplateBrief,
    type BriefContext,
} from '../model/brief-template';

const FACTS: AiBriefFact[] = [
    {
        code: 'alert.promise',
        kind: 'alert',
        title: 'Невыполненные обещания',
        value: 3,
        unit: 'count',
        n: 57,
        text: 'Невыполненные обещания: 3',
        managerId: '12',
    },
    {
        code: 'edge.e1',
        kind: 'deviation',
        title: 'Конверсия звонок в презентацию',
        value: 0.4523,
        unit: 'share',
        n: 112,
        text: 'Конверсия звонок в презентацию: 45,2 %',
    },
    {
        code: 'fin.advance',
        kind: 'finance',
        title: 'Аванс против плана',
        value: 1234567,
        unit: 'rub',
        n: 34,
        text: `Аванс против плана: ${formatFactValue(1234567, 'rub')}`,
    },
    {
        code: 'disc.plan',
        kind: 'discipline',
        title: 'План CRM выполнен',
        value: 62,
        unit: 'pct',
        n: 80,
        text: 'План CRM выполнен: 62,0 %',
    },
    {
        code: 'tel.long',
        kind: 'telephony',
        title: 'Доля звонков дольше 300 секунд',
        value: 0.38,
        unit: 'share',
        n: 400,
        text: 'Доля звонков дольше 300 секунд: 38,0 %',
    },
];

const PACK = trimEvidencePack(FACTS);

const CTX: BriefContext = {
    from: '2026-09-01',
    to: '2026-09-07',
    generatedAt: '2026-09-08T06:15:00.000Z',
};

const bullet = (text: string, refs: string[]): AiBriefBullet => ({
    text,
    factRefs: refs,
});

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

    it('шестой буллет отклоняется', () => {
        const six = Array.from({ length: 6 }, (_, index) =>
            bullet(`Невыполненных обещаний 3 (${index})`, ['alert.promise']),
        );
        const result = validateBriefPayload(payload(six), PACK);

        expect(result.payload?.bullets).toHaveLength(AI_BRIEF_LIMITS.bullets);
        expect(result.dropped).toHaveLength(1);
        expect(result.dropped[0].reason).toBe(AI_BRIEF_DROP_REASONS.overLimit);
    });

    it('битая форма ответа и пустой пакет отклоняются', () => {
        expect(validateBriefPayload('не объект', PACK).payload).toBeNull();
        expect(
            validateBriefPayload(
                payload([bullet('Обещаний 3', ['alert.promise'])]),
                {
                    facts: [],
                    hash: '',
                    droppedCodes: [],
                },
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

    it('ссылка на несуществующий факт выбрасывает буллет', () => {
        const result = factCheckBullets(
            [bullet('Невыполненных обещаний 3', ['fin.unknown'])],
            PACK,
        );

        expect(result.dropped[0].reason).toBe(
            AI_BRIEF_DROP_REASONS.unknownFactRef,
        );
    });

    it('буллет без ссылок на факты не проходит', () => {
        const result = factCheckBullets(
            [bullet('Невыполненных обещаний 3', [])],
            PACK,
        );

        expect(result.dropped[0].reason).toBe(AI_BRIEF_DROP_REASONS.noFactRefs);
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

describe('приёмка: 20 прогонов синтетических ответов', () => {
    it('не меньше 95 % буллетов проходят факт-чек', () => {
        let total = 0;
        let kept = 0;
        for (let run = 0; run < 20; run += 1) {
            const bullets = [0, 1, 2].map(offset => {
                const fact = PACK.facts[(run + offset) % PACK.facts.length];

                return bullet(
                    `${fact.title} — ${styledValue(fact, (run + offset) % 4)}`,
                    [fact.code],
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
