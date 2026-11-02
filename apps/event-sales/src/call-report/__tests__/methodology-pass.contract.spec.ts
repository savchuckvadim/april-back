import { POLYANSKY_METHODOLOGY } from '@lib/call-lib';
import {
    buildMethodologyPassPrompt,
    buildMethodologyPassSchema,
    modelCheckpointsFor,
    parseMethodologyPass,
    spiralsEnabledFor,
} from '../contracts/methodology-pass.contract';

/**
 * Контракт прохода «методика»: схема только из модельных пунктов типа,
 * спирали по включённости, промпт с формулировками и статусами, разбор
 * ответа с отбросом мусора и полнотой витка кодом.
 */
describe('methodology-pass.contract', () => {
    it('схема презентации: коды модельных пунктов (без правил), спирали — массив', () => {
        const schema = buildMethodologyPassSchema(
            POLYANSKY_METHODOLOGY,
            'presentation',
        );
        expect(schema).not.toBeNull();
        const items = (
            schema as {
                properties: {
                    checkpoints: {
                        items: { properties: { code: { enum: string[] } } };
                    };
                };
            }
        ).properties.checkpoints.items.properties.code.enum;
        expect(items).toContain('pres.needs_confirmed');
        // Пункты с правилом кода у модели не спрашиваются.
        expect(items).not.toContain('pres.spirals_min');
        expect(items).not.toContain('pres.dialogue');
        expect(items).toEqual(
            modelCheckpointsFor(POLYANSKY_METHODOLOGY, 'presentation').map(
                c => c.code,
            ),
        );
        const spirals = (
            schema as { properties: { spirals: { type: unknown } } }
        ).properties.spirals.type;
        expect(spirals).toEqual(['array', 'null']);
        expect(spiralsEnabledFor(POLYANSKY_METHODOLOGY, 'presentation')).toBe(
            true,
        );
    });

    it('холодный: спирали не считаются (type null); тип вне методики — схемы нет', () => {
        const cold = buildMethodologyPassSchema(
            POLYANSKY_METHODOLOGY,
            'cold',
        ) as {
            properties: { spirals: { type: unknown } };
        };
        expect(cold.properties.spirals.type).toBe('null');
        expect(spiralsEnabledFor(POLYANSKY_METHODOLOGY, 'cold')).toBe(false);
        expect(
            buildMethodologyPassSchema(POLYANSKY_METHODOLOGY, 'event_invite'),
        ).toBeNull();
        expect(
            buildMethodologyPassSchema(POLYANSKY_METHODOLOGY, null),
        ).toBeNull();
    });

    it('промпт несёт название методики, правила, формулировки пунктов, пометки о цитате и статусы', () => {
        const prompt = buildMethodologyPassPrompt(
            POLYANSKY_METHODOLOGY,
            'presentation',
        );
        expect(prompt).toContain('ПРОВЕРКА ПО МЕТОДИКЕ «Полянский»');
        expect(prompt).toContain(
            'Скидка — только после выяснения причины сомнения.',
        );
        expect(prompt).toContain(
            'pres.needs_confirmed — Резюмировал потребности вслух',
        );
        expect(prompt).toContain('[нужна дословная цитата]');
        expect(prompt).toContain('- not_applicable');
        expect(prompt).toContain('СПИРАЛИ ПРЕЗЕНТАЦИИ');
        // Пункты-правила в промпт не попадают.
        expect(prompt).not.toContain('pres.spirals_min');
        const cold = buildMethodologyPassPrompt(POLYANSKY_METHODOLOGY, 'cold');
        expect(cold).toContain('spirals — верни null');
        expect(cold).toContain('[факт разговора, цитата по возможности]');
    });

    it('разбор ответа: чужие коды и статусы отброшены, дубль — первый, цитата и таймкоды нормализованы, full считает код', () => {
        const parsed = parseMethodologyPass(
            {
                checkpoints: [
                    {
                        code: 'pres.needs_confirmed',
                        status: 'done',
                        quote: '  Итак… ',
                        startSec: 12.4,
                        endSec: 20,
                    },
                    {
                        code: 'pres.needs_confirmed',
                        status: 'missed',
                        quote: null,
                        startSec: null,
                        endSec: null,
                    },
                    {
                        code: 'pres.unknown',
                        status: 'done',
                        quote: null,
                        startSec: null,
                        endSec: null,
                    },
                    {
                        code: 'pres.desire',
                        status: 'maybe',
                        quote: null,
                        startSec: null,
                        endSec: null,
                    },
                    {
                        code: 'pres.desire',
                        status: 'missed',
                        quote: '',
                        startSec: -3,
                        endSec: null,
                    },
                ],
                spirals: [
                    {
                        need: 'практика',
                        feature: 'поиск',
                        link: 'по вашим делам',
                        benefit: 'час вместо дня',
                        question: 'подходит?',
                        clientAnswer: 'да',
                    },
                    {
                        need: null,
                        feature: 'формы',
                        link: null,
                        benefit: null,
                        question: null,
                        clientAnswer: null,
                    },
                    'мусор',
                ],
            },
            ['pres.needs_confirmed', 'pres.desire'],
        );
        expect(parsed).toEqual({
            checkpoints: [
                {
                    code: 'pres.needs_confirmed',
                    status: 'done',
                    quote: 'Итак…',
                    startSec: 12,
                    endSec: 20,
                },
                {
                    code: 'pres.desire',
                    status: 'missed',
                    quote: null,
                    startSec: null,
                    endSec: null,
                },
            ],
            spirals: [
                expect.objectContaining({ need: 'практика', full: true }),
                expect.objectContaining({
                    need: null,
                    feature: 'формы',
                    full: false,
                }),
            ],
        });
    });

    it('ответ не объект или без спиралей — null и spirals null', () => {
        expect(parseMethodologyPass(null, [])).toBeNull();
        expect(parseMethodologyPass('text', [])).toBeNull();
        expect(
            parseMethodologyPass({ checkpoints: [], spirals: null }, []),
        ).toEqual({
            checkpoints: [],
            spirals: null,
        });
    });
});
