import {
    AI_BRIEF_COMPARE_REASONS,
    AI_BRIEF_LIMITS,
    AiBriefFact,
    AiBriefFactKind,
} from '../contracts/ai-brief.contract';
import { formatFactValue } from '../model/brief-numbers';
import {
    buildFactText,
    factToJson,
    findFact,
    packBytes,
    packHash,
    trimEvidencePack,
} from '../model/brief-pack';

const fact = (
    code: string,
    kind: AiBriefFactKind,
    over: Partial<AiBriefFact> = {},
): AiBriefFact => ({
    code,
    kind,
    title: `Факт ${code}`,
    value: 12,
    unit: 'count',
    text: `Факт ${code}: 12`,
    comparable: false,
    ...over,
});

/** Пакет из 18 фактов всех видов, поданных в «неправильном» порядке. */
const MIXED: AiBriefFact[] = [
    fact('dq1', 'data-quality'),
    fact('tel1', 'telephony'),
    fact('fin1', 'finance'),
    fact('dev1', 'deviation'),
    fact('al1', 'alert'),
    fact('dq2', 'data-quality'),
    fact('dis1', 'discipline'),
    fact('al2', 'alert'),
    fact('tel2', 'telephony'),
    fact('dev2', 'deviation'),
    fact('fin2', 'finance'),
    fact('dis2', 'discipline'),
    fact('dq3', 'data-quality'),
    fact('tel3', 'telephony'),
    fact('al3', 'alert'),
    fact('dev3', 'deviation'),
    fact('fin3', 'finance'),
    fact('dis3', 'discipline'),
];

describe('trimEvidencePack: приоритет и лимит фактов', () => {
    it('оставляет 16 фактов по приоритету видов', () => {
        const pack = trimEvidencePack(MIXED);

        expect(AI_BRIEF_LIMITS.packFacts).toBe(16);
        expect(pack.facts).toHaveLength(AI_BRIEF_LIMITS.packFacts);
        expect(pack.facts.map(item => item.code).slice(0, 6)).toEqual([
            'al1',
            'al2',
            'al3',
            'dev1',
            'dev2',
            'dev3',
        ]);
    });

    it('выброшенные факты — хвост приоритета, их коды возвращаются', () => {
        const pack = trimEvidencePack(MIXED);

        expect(pack.droppedCodes).toEqual(['dq2', 'dq3']);
    });

    it('внутри вида порядок входа сохраняется', () => {
        const pack = trimEvidencePack([
            fact('tel2', 'telephony'),
            fact('tel1', 'telephony'),
            fact('al1', 'alert'),
        ]);

        expect(pack.facts.map(item => item.code)).toEqual([
            'al1',
            'tel2',
            'tel1',
        ]);
    });

    it('обрезает пакет по 8 КБ, отдавая коды выброшенных', () => {
        const long = 'а'.repeat(600);
        const heavy = MIXED.slice(0, 16).map(item => ({
            ...item,
            text: `${item.text} ${long}`,
        }));

        const pack = trimEvidencePack(heavy);

        expect(AI_BRIEF_LIMITS.packBytes).toBe(8192);
        expect(packBytes(heavy)).toBeGreaterThan(AI_BRIEF_LIMITS.packBytes);
        expect(packBytes(pack.facts)).toBeLessThanOrEqual(
            AI_BRIEF_LIMITS.packBytes,
        );
        expect(pack.facts.length).toBeLessThan(heavy.length);
        expect(pack.droppedCodes.length).toBeGreaterThan(0);
    });

    it('лимиты можно сузить параметром', () => {
        const pack = trimEvidencePack(MIXED, { maxFacts: 3 });

        expect(pack.facts.map(item => item.code)).toEqual([
            'al1',
            'al2',
            'al3',
        ]);
    });

    it('по умолчанию сравнения нет с причиной «нет данных»; статус можно задать', () => {
        expect(trimEvidencePack(MIXED).compare).toEqual({
            previousPeriod: null,
            reason: AI_BRIEF_COMPARE_REASONS.noData,
        });
        const compare = {
            previousPeriod: { from: '2026-08-25', to: '2026-08-31' },
            reason: null,
        };
        expect(trimEvidencePack(MIXED, { compare }).compare).toEqual(compare);
    });
});

describe('packHash: детерминизм пакета', () => {
    it('перестановка ключей факта хэш не меняет', () => {
        const straight: AiBriefFact = {
            code: 'fin1',
            kind: 'finance',
            title: 'Продажи против плана',
            value: 0.62,
            unit: 'share',
            n: 34,
            text: 'Продажи против плана: 62,0 %',
            comparable: false,
        };
        const shuffled: AiBriefFact = {
            text: 'Продажи против плана: 62,0 %',
            comparable: false,
            n: 34,
            unit: 'share',
            value: 0.62,
            title: 'Продажи против плана',
            kind: 'finance',
            code: 'fin1',
        };

        expect(packHash([shuffled])).toBe(packHash([straight]));
    });

    it('отсутствующее и undefined-поле дают один хэш; JSON факта без undefined', () => {
        const withUndefined: AiBriefFact = {
            ...fact('al1', 'alert'),
            managerId: undefined,
            prev: undefined,
            link: undefined,
        };

        expect(packHash([withUndefined])).toBe(
            packHash([fact('al1', 'alert')]),
        );
        const json = factToJson(withUndefined);
        expect(Object.values(json).some(value => value === undefined)).toBe(
            false,
        );
        expect(json).toEqual(
            expect.objectContaining({
                prev: null,
                delta: null,
                deltaPct: null,
                comparable: false,
                basis: null,
                norm: null,
                plan: null,
                link: null,
                signal: null,
            }),
        );
    });

    it('смена значения, прошлого периода или статуса сравнения меняет хэш', () => {
        const base = fact('al1', 'alert');
        const changed = { ...base, value: 13 };
        const withPrev = {
            ...base,
            prev: 7,
            delta: 5,
            deltaPct: 71.4,
            comparable: true,
        };

        expect(packHash([changed])).not.toBe(packHash([base]));
        expect(packHash([withPrev])).not.toBe(packHash([base]));
        expect(
            packHash([base], {
                previousPeriod: { from: '2026-08-25', to: '2026-08-31' },
                reason: null,
            }),
        ).not.toBe(packHash([base]));
        expect(
            packHash([base], {
                previousPeriod: null,
                reason: AI_BRIEF_COMPARE_REASONS.prevNotReady,
            }),
        ).not.toBe(packHash([base]));
    });

    it('порядок фактов хэш меняет — пакет упорядочен приоритетом', () => {
        const a = fact('al1', 'alert');
        const b = fact('al2', 'alert');

        expect(packHash([a, b])).not.toBe(packHash([b, a]));
    });
});

describe('фраза факта', () => {
    it('доля печатается процентами с запятой', () => {
        expect(formatFactValue(0.4523, 'share')).toBe('45,2 %');
        expect(
            buildFactText({
                title: 'Конверсия звонок → презентация',
                value: 0.4523,
                unit: 'share',
            }),
        ).toBe('Конверсия звонок → презентация: 45,2 %');
    });

    it('рубли — с разрядами, пустое значение — «нет данных»', () => {
        expect(formatFactValue(1234567, 'rub')).toBe('1 234 567 ₽');
        expect(formatFactValue(null, 'count')).toBe('нет данных');
    });

    it('факт пакета находится по коду', () => {
        const pack = trimEvidencePack(MIXED);

        expect(findFact(pack, 'al1')?.kind).toBe('alert');
        expect(findFact(pack, 'dq2')).toBeUndefined();
    });
});
