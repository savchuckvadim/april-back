import {
    FOCUS_CLOSING_PROMPT,
    FOCUS_CLOSING_SCHEMA,
    FOCUS_KEYS,
    FOCUS_MOVEMENT_PROMPT,
    FOCUS_MOVEMENT_SCHEMA,
    FOCUS_SECTION_CODES,
    FOCUS_SYNTHESIS_PROMPT,
} from '../contracts/call-focus-analysis.contract';
import {
    CLOSING_FACTS_PROPERTIES,
    CLOSING_FACTS_SPEC,
    MOVEMENT_FACTS_PROPERTIES,
    MOVEMENT_FACTS_REQUIRED,
    MOVEMENT_FACTS_SPEC,
    OBJECTIONS_PRICE_FACTS_PROPERTIES,
    OBJECTIONS_PRICE_FACTS_SPEC,
} from '../contracts/call-report-facts.contract';
import { RISK_FLAGS_SPEC } from '../contracts/call-risk-flags.contract';
import { MOVEMENT_FACTS_SPEC_BEFORE_SPLIT } from './movement-facts-spec.before-split.fixture';

/**
 * Проход «движение сделки» разделён на два вызова модели (focus-v3.3,
 * 17.11.2026): «возражения и цена» (movement) и «закрытие и следующий шаг»
 * (closing). Итоговый разбор не меняется: объединение двух схем — прежняя
 * схема единого прохода, описания полей перенесены без перефразирования.
 */

/** Поля схемы единого прохода «движение сделки» до деления — выписаны явно. */
const MOVEMENT_FIELDS_BEFORE_SPLIT = [
    'sections',
    'objections',
    'priceDiscussed',
    'competitors',
    'refusalCategory',
    'refusalReason',
    'nextStep',
    'dealProgress',
    'productive',
    'riskFlags',
    'riskEvidence',
    'hvostDone',
    'hvostAnalysis',
    'hvostSteps',
    'fiveKDone',
    'fiveKAnalysis',
    'fiveKItems',
    'flow',
    'outcome',
    'issues',
    'prices',
    'upsell',
];

/** Что остаётся за проходом «возражения и цена». */
const MOVEMENT_FIELDS = [
    'sections',
    'objections',
    'priceDiscussed',
    'competitors',
    'riskFlags',
    'riskEvidence',
    'issues',
    'prices',
];

/** Что переезжает в проход «закрытие и следующий шаг». */
const CLOSING_FIELDS = [
    'sections',
    'refusalCategory',
    'refusalReason',
    'nextStep',
    'dealProgress',
    'productive',
    'hvostDone',
    'hvostAnalysis',
    'hvostSteps',
    'fiveKDone',
    'fiveKAnalysis',
    'fiveKItems',
    'flow',
    'outcome',
    'upsell',
];

const propertiesOf = (schema: Record<string, unknown>): string[] =>
    Object.keys(schema.properties as Record<string, unknown>);
const requiredOf = (schema: Record<string, unknown>): string[] =>
    schema.required as string[];

/** Строка-заголовок описания поля в промпте: «- nextStep.set —», «- issues —». */
const describes = (prompt: string, field: string): boolean =>
    new RegExp(`^- ${field}(\\[\\])?(\\.[A-Za-z]+)? —`, 'm').test(prompt);

describe('схемы проходов «возражения и цена» и «закрытие и следующий шаг»', () => {
    it('поля каждого прохода — ровно по плану, required покрывает все поля, лишних полей нет', () => {
        expect([...propertiesOf(FOCUS_MOVEMENT_SCHEMA)].sort()).toEqual(
            [...MOVEMENT_FIELDS].sort(),
        );
        expect([...propertiesOf(FOCUS_CLOSING_SCHEMA)].sort()).toEqual(
            [...CLOSING_FIELDS].sort(),
        );
        for (const schema of [FOCUS_MOVEMENT_SCHEMA, FOCUS_CLOSING_SCHEMA]) {
            expect([...requiredOf(schema)].sort()).toEqual(
                [...propertiesOf(schema)].sort(),
            );
            expect(schema.additionalProperties).toBe(false);
            expect(schema.type).toBe('object');
        }
    });

    it('объединение двух схем — прежняя схема «движения сделки»: ни одно поле не потеряно и не задвоено', () => {
        const union = [
            ...propertiesOf(FOCUS_MOVEMENT_SCHEMA),
            ...propertiesOf(FOCUS_CLOSING_SCHEMA),
        ];
        // Общее поле одно — sections: у каждого прохода свои разделы.
        expect(union.filter(field => field === 'sections')).toHaveLength(2);
        const withoutSections = union.filter(field => field !== 'sections');
        expect(new Set(withoutSections).size).toBe(withoutSections.length);
        expect(['sections', ...withoutSections].sort()).toEqual(
            [...MOVEMENT_FIELDS_BEFORE_SPLIT].sort(),
        );

        const requiredUnion = new Set([
            ...requiredOf(FOCUS_MOVEMENT_SCHEMA),
            ...requiredOf(FOCUS_CLOSING_SCHEMA),
        ]);
        expect([...requiredUnion].sort()).toEqual(
            [...MOVEMENT_FIELDS_BEFORE_SPLIT].sort(),
        );
    });

    it('подсхемы полей — прежние: факты и шаг берутся из тех же констант, разделы ограничены зоной прохода', () => {
        const movement = FOCUS_MOVEMENT_SCHEMA.properties as Record<
            string,
            unknown
        >;
        const closing = FOCUS_CLOSING_SCHEMA.properties as Record<
            string,
            unknown
        >;
        for (const [name, schema] of Object.entries(
            OBJECTIONS_PRICE_FACTS_PROPERTIES,
        )) {
            expect(movement[name]).toBe(schema);
        }
        for (const [name, schema] of Object.entries(CLOSING_FACTS_PROPERTIES)) {
            expect(closing[name]).toBe(schema);
        }
        // Факты двух проходов вместе — все факты цельного разбора.
        expect(
            Object.keys({
                ...OBJECTIONS_PRICE_FACTS_PROPERTIES,
                ...CLOSING_FACTS_PROPERTIES,
            }).sort(),
        ).toEqual(Object.keys(MOVEMENT_FACTS_PROPERTIES).sort());
        for (const [name, schema] of Object.entries(
            MOVEMENT_FACTS_PROPERTIES,
        )) {
            const own =
                name in OBJECTIONS_PRICE_FACTS_PROPERTIES ? movement : closing;
            expect(own[name]).toBe(schema);
        }
        const sectionEnum = (schema: Record<string, unknown>): unknown => {
            const sections = (schema.properties as Record<string, unknown>)
                .sections as {
                items: { properties: { section: { enum: string[] } } };
            };
            return sections.items.properties.section.enum;
        };
        expect(sectionEnum(FOCUS_MOVEMENT_SCHEMA)).toEqual([
            'OBJECTIONS',
            'PRICE',
        ]);
        expect(sectionEnum(FOCUS_CLOSING_SCHEMA)).toEqual([
            'CLOSING',
            'REFUSAL',
        ]);
    });

    it('зоны проходов и список ключей согласованы: четыре ключа, свои разделы у каждого', () => {
        expect([...FOCUS_KEYS]).toEqual([
            'form',
            'content',
            'movement',
            'closing',
        ]);
        expect(Object.keys(FOCUS_SECTION_CODES)).toEqual([...FOCUS_KEYS]);
        expect(FOCUS_SECTION_CODES.movement).toEqual(['OBJECTIONS', 'PRICE']);
        expect(FOCUS_SECTION_CODES.closing).toEqual(['CLOSING', 'REFUSAL']);
    });
});

describe('промпты проходов «возражения и цена» и «закрытие и следующий шаг»', () => {
    it('в каждом промпте есть описание всех полей его схемы и нет описаний полей чужой схемы', () => {
        const ownMovement = MOVEMENT_FIELDS.filter(
            field => field !== 'sections',
        );
        const ownClosing = CLOSING_FIELDS.filter(field => field !== 'sections');
        for (const field of ownMovement) {
            expect({
                field,
                described: describes(FOCUS_MOVEMENT_PROMPT, field),
            }).toEqual({ field, described: true });
            expect({
                field,
                described: describes(FOCUS_CLOSING_PROMPT, field),
            }).toEqual({ field, described: false });
        }
        for (const field of ownClosing) {
            expect({
                field,
                described: describes(FOCUS_CLOSING_PROMPT, field),
            }).toEqual({ field, described: true });
            expect({
                field,
                described: describes(FOCUS_MOVEMENT_PROMPT, field),
            }).toEqual({ field, described: false });
        }
    });

    it('зона каждого промпта — разделы только его прохода', () => {
        for (const code of FOCUS_SECTION_CODES.movement) {
            expect(FOCUS_MOVEMENT_PROMPT).toContain(`- '${code}' —`);
            expect(FOCUS_CLOSING_PROMPT).not.toContain(`- '${code}' —`);
        }
        for (const code of FOCUS_SECTION_CODES.closing) {
            expect(FOCUS_CLOSING_PROMPT).toContain(`- '${code}' —`);
            expect(FOCUS_MOVEMENT_PROMPT).not.toContain(`- '${code}' —`);
        }
    });

    it('«сигналы руководителю» — только в проходе «возражения и цена»; «железное правило фактов» — в обоих', () => {
        expect(FOCUS_MOVEMENT_PROMPT).toContain(RISK_FLAGS_SPEC);
        expect(FOCUS_CLOSING_PROMPT).not.toContain('СИГНАЛЫ РУКОВОДИТЕЛЮ');
        expect(FOCUS_CLOSING_PROMPT).not.toContain('door_closed');
        for (const prompt of [FOCUS_MOVEMENT_PROMPT, FOCUS_CLOSING_PROMPT]) {
            expect(prompt).toContain('ЖЕЛЕЗНОЕ ПРАВИЛО ФАКТОВ');
            // Переносы строк в тексте промпта не важны.
            expect(prompt.replace(/\s+/g, ' ')).toContain(
                'НЕ выдумывай разбор несуществующей темы',
            );
        }
        // Правило каждого прохода — со своими примерами полей.
        expect(FOCUS_MOVEMENT_PROMPT).toContain('priceDiscussed=false');
        expect(FOCUS_CLOSING_PROMPT).toContain('nextStep.set=false');
        expect(FOCUS_CLOSING_PROMPT).not.toContain('priceDiscussed=false');
    });

    it('тексты фактов: каждый проход несёт свои, вместе — все факты прежнего текста', () => {
        expect(FOCUS_MOVEMENT_PROMPT).toContain(OBJECTIONS_PRICE_FACTS_SPEC);
        expect(FOCUS_CLOSING_PROMPT).toContain(CLOSING_FACTS_SPEC);
        expect(FOCUS_MOVEMENT_PROMPT).not.toContain(CLOSING_FACTS_SPEC);
        expect(FOCUS_CLOSING_PROMPT).not.toContain(OBJECTIONS_PRICE_FACTS_SPEC);
        // Каждая строка описания факта из прежнего текста есть в одном из двух.
        const lines = MOVEMENT_FACTS_SPEC_BEFORE_SPLIT.split('\n');
        for (const line of lines) {
            const inMovement =
                OBJECTIONS_PRICE_FACTS_SPEC.split('\n').includes(line);
            const inClosing = CLOSING_FACTS_SPEC.split('\n').includes(line);
            expect({ line, found: inMovement || inClosing }).toEqual({
                line,
                found: true,
            });
        }
    });

    it('синтез знает про четыре специализированных разбора с новыми названиями', () => {
        expect(FOCUS_SYNTHESIS_PROMPT).toContain(
            'Четыре специализированных разбора',
        );
        expect(FOCUS_SYNTHESIS_PROMPT).toContain(
            '(форма разговора, содержание продажи, возражения и цена, закрытие и\nследующий шаг)',
        );
        expect(FOCUS_SYNTHESIS_PROMPT).not.toContain('движение сделки');
    });
});

describe('MOVEMENT_FACTS_SPEC после деления на части', () => {
    it('текст байт в байт прежний — цельный разбор и догон признаков пользуются им без изменений', () => {
        expect(MOVEMENT_FACTS_SPEC).toBe(MOVEMENT_FACTS_SPEC_BEFORE_SPLIT);
    });

    it('поля цельного разбора и догона признаков прежние', () => {
        expect(Object.keys(MOVEMENT_FACTS_PROPERTIES)).toEqual([
            'outcome',
            'issues',
            'prices',
            'upsell',
        ]);
        expect([...MOVEMENT_FACTS_REQUIRED]).toEqual([
            'outcome',
            'issues',
            'prices',
            'upsell',
        ]);
    });
});
