import { parseMethodology } from '../methodology.validator';
import { POLYANSKY_METHODOLOGY } from '../polyansky.methodology';
import { CORE_CAPS } from '../core-caps.const';

/** Минимальный валидный конфиг — база для отрицательных случаев. */
const minimal = (): Record<string, unknown> => ({
    code: 'garant-own',
    title: 'Своя методика',
    version: '1.0.0',
    types: ['presentation', 'refine'],
    checkpoints: [
        {
            code: 'pres.needs_confirmed',
            title: 'Подтвердил потребности вслух',
            types: ['presentation'],
            evidence: 'quote',
            mandatory: true,
        },
    ],
});

/**
 * Валидатор конфига методики: все ошибки сразу и по-русски, лишнее
 * отбрасывается, дефолты для необязательных блоков, встроенные конфиги
 * проходят проверку.
 */
describe('parseMethodology', () => {
    it('минимальный конфиг проходит: дефолты для версии, правил, ограничителей и спиралей', () => {
        const input = minimal();
        delete input.version;
        const result = parseMethodology(input);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toMatchObject({
            code: 'garant-own',
            version: '1.0.0',
            principles: [],
            caps: [],
            spirals: { enabled: false, minFull: 0, types: [] },
        });
        expect(result.value.sectionAnchors).toBeUndefined();
        expect(result.value.knowledge).toBeUndefined();
    });

    it('собирает все ошибки сразу: код, название, версия, типы, пункт', () => {
        const result = parseMethodology({
            code: 'Полянский',
            title: '  ',
            version: 'v1',
            types: ['presentation', 'webinar'],
            checkpoints: [
                {
                    code: 'Bad Code',
                    title: 'x',
                    types: ['presentation'],
                    evidence: 'quote',
                    mandatory: true,
                },
                {
                    code: 'pres.ok',
                    title: '',
                    types: ['cold'],
                    evidence: 'proof',
                    mandatory: 'yes',
                },
            ],
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.stringContaining('code: код методики'),
                expect.stringContaining('title: нужно название'),
                expect.stringContaining('version: вид major.minor.patch'),
                expect.stringContaining('неизвестный тип звонка «webinar»'),
                expect.stringContaining('checkpoints[0].code'),
                expect.stringContaining('checkpoints[1].title'),
                expect.stringContaining('checkpoints[1].evidence'),
                expect.stringContaining('checkpoints[1].mandatory'),
                expect.stringContaining('тип «cold» не входит в типы методики'),
            ]),
        );
    });

    it('повтор кода пункта и ссылка ограничителя на несуществующий пункт — ошибки', () => {
        const input = minimal();
        (input.checkpoints as unknown[]).push({
            code: 'pres.needs_confirmed',
            title: 'Дубль',
            types: ['presentation'],
            evidence: 'fact',
            mandatory: false,
        });
        input.caps = [
            {
                code: 'pres.cap',
                title: 'потолок',
                when: [{ op: 'checkpoint_missed', checkpoint: 'pres.unknown' }],
                target: 'PRESENTATION',
                max: 6,
            },
            {
                code: 'bad',
                title: 'без условий',
                when: [],
                target: 'SUMMARY',
                max: 11,
            },
        ];
        const result = parseMethodology(input);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'пункт «pres.needs_confirmed» повторяется',
                ),
                expect.stringContaining('caps[0].when[0].checkpoint'),
                expect.stringContaining('caps[1].when: нужен непустой список'),
                expect.stringContaining('caps[1].target'),
                expect.stringContaining('caps[1].max'),
            ]),
        );
    });

    it('условия: неизвестная операция, факт и типы значений', () => {
        const input = minimal();
        input.caps = [
            {
                code: 'cap',
                title: 'потолок',
                when: [
                    { op: 'equals', field: 'needsFound', value: false },
                    { op: 'is', field: 'needsCount2', value: 1 },
                    { op: 'gte', field: 'spiralsFull', value: 'три' },
                    { op: 'is', field: 'needsFound', value: { nested: true } },
                ],
                target: 'total',
                max: 6,
            },
        ];
        const result = parseMethodology(input);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'caps[0].when[0].op: неизвестная операция',
                ),
                expect.stringContaining(
                    'caps[0].when[1].field: неизвестный факт',
                ),
                expect.stringContaining(
                    'caps[0].when[2].value: для gte нужно число',
                ),
                expect.stringContaining(
                    'caps[0].when[3].value: для is нужно значение',
                ),
            ]),
        );
    });

    it('якоря, приоры и справочники: чужие разделы, полосы и значения вне диапазона', () => {
        const input = minimal();
        input.sectionAnchors = {
            PRESENTATION: { '1-2': 'нет показа', '11-12': 'лишняя полоса' },
            SUMMARY: { '1-2': 'нет такого раздела' },
        };
        input.relevance = {
            presentation: { PRESENTATION: 100, PRICE: 101 },
            cold: { GREETING: 50 },
        };
        input.knowledge = {
            'presentation-playbook': 'polyansky',
            'Bad Kind': 'x',
        };
        const result = parseMethodology(input);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'sectionAnchors.PRESENTATION: неизвестная полоса «11-12»',
                ),
                expect.stringContaining(
                    'sectionAnchors: неизвестный раздел «SUMMARY»',
                ),
                expect.stringContaining('relevance.presentation.PRICE'),
                expect.stringContaining('relevance: тип «cold» не входит'),
                expect.stringContaining('knowledge.Bad Kind'),
            ]),
        );
    });

    it('пустая методика без пунктов, ограничителей и спиралей отклоняется', () => {
        const input = minimal();
        input.checkpoints = [];
        const result = parseMethodology(input);
        expect(result).toEqual({
            ok: false,
            errors: [expect.stringContaining('методика пуста')],
        });
    });

    it('лишние поля отбрасываются, строки обрезаются, правила пунктов нормализуются', () => {
        const input = minimal();
        input.extra = 'мусор';
        (input.checkpoints as Record<string, unknown>[])[0] = {
            code: 'pres.spirals_min',
            title: '  Три спирали  ',
            types: ['presentation'],
            evidence: 'fact',
            mandatory: true,
            hint: '  считать кодом ',
            rule: [{ op: 'gte', field: 'spiralsFull', value: 3, junk: 1 }],
        };
        const result = parseMethodology(input);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).not.toHaveProperty('extra');
        expect(result.value.checkpoints[0]).toEqual({
            code: 'pres.spirals_min',
            title: 'Три спирали',
            types: ['presentation'],
            evidence: 'fact',
            mandatory: true,
            hint: 'считать кодом',
            rule: [{ op: 'gte', field: 'spiralsFull', value: 3 }],
        });
    });

    it('встроенный конфиг Полянского проходит проверку и совпадает сам с собой', () => {
        const result = parseMethodology(
            JSON.parse(JSON.stringify(POLYANSKY_METHODOLOGY)),
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toEqual(POLYANSKY_METHODOLOGY);
    });

    it('ограничители ядра валидны как часть методики без пунктов', () => {
        const result = parseMethodology({
            code: 'core',
            title: 'Ядро',
            types: [
                'cold',
                'call',
                'presentation',
                'refine',
                'decision',
                'payment',
            ],
            checkpoints: [],
            caps: CORE_CAPS,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.caps).toHaveLength(CORE_CAPS.length);
    });
});
