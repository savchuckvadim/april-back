import {
    AI_BRIEF_LIMITS,
    AiBriefFact,
    AiBriefFactKind,
} from '../contracts/ai-brief.contract';
import { formatFactValue } from '../model/brief-numbers';
import {
    buildFactText,
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
    ...over,
});

/** Пакет из 14 фактов всех видов, поданных в «неправильном» порядке. */
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
];

describe('trimEvidencePack: приоритет и лимит фактов', () => {
    it('оставляет 10 фактов по приоритету видов', () => {
        const pack = trimEvidencePack(MIXED);

        expect(pack.facts).toHaveLength(AI_BRIEF_LIMITS.packFacts);
        expect(pack.facts.map(item => item.code).slice(0, 6)).toEqual([
            'al1',
            'al2',
            'dev1',
            'dev2',
            'fin1',
            'fin2',
        ]);
    });

    it('выброшенные факты — хвост приоритета, их коды возвращаются', () => {
        const pack = trimEvidencePack(MIXED);

        expect(pack.droppedCodes).toEqual(['tel3', 'dq1', 'dq2', 'dq3']);
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

    it('обрезает пакет по 4 КБ, отдавая коды выброшенных', () => {
        const long = 'а'.repeat(600);
        const heavy = MIXED.slice(0, 10).map(item => ({
            ...item,
            text: `${item.text} ${long}`,
        }));

        const pack = trimEvidencePack(heavy);

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
            'dev1',
        ]);
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
        };
        const shuffled: AiBriefFact = {
            text: 'Продажи против плана: 62,0 %',
            n: 34,
            unit: 'share',
            value: 0.62,
            title: 'Продажи против плана',
            kind: 'finance',
            code: 'fin1',
        };

        expect(packHash([shuffled])).toBe(packHash([straight]));
    });

    it('отсутствующее и undefined-поле дают один хэш', () => {
        const withUndefined: AiBriefFact = {
            ...fact('al1', 'alert'),
            managerId: undefined,
        };

        expect(packHash([withUndefined])).toBe(
            packHash([fact('al1', 'alert')]),
        );
    });

    it('смена значения хэш меняет', () => {
        const changed = { ...fact('al1', 'alert'), value: 13 };

        expect(packHash([changed])).not.toBe(packHash([fact('al1', 'alert')]));
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
                code: 'e1',
                kind: 'deviation',
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
        expect(findFact(pack, 'dq1')).toBeUndefined();
    });
});
