import { createHash } from 'crypto';
import {
    AI_ANALYSIS_SERIES_START,
    PROMPT_SERIES_START,
    versionSeriesDate,
} from '@lib/sales-ai-analytics';
import { FIVE_K_ITEM_KEYS, HVOST_STEP_KEYS } from '@lib/call-lib';
import {
    CHECKLIST_EVIDENCE_SPEC,
    EVIDENCE_QUOTE_RULES,
    NEED_ITEMS_SPEC,
    QUOTE_EVIDENCE_ENABLED,
    SECTION_EVIDENCE_SPEC,
    afterPresentationBlockFor,
    checklistsAskedFor,
} from '../contracts/call-evidence.contract';
import {
    AFTER_PRESENTATION_CLOSING_RULE,
    AFTER_PRESENTATION_STRICT_BLOCK,
    CALL_DEEP_ANALYSIS_SCHEMA,
    CALL_DEEP_ANALYSIS_SYSTEM_PROMPT,
} from '../contracts/call-deep-analysis.contract';
import {
    FOCUS_FORM_PROMPT,
    FOCUS_MOVEMENT_PROMPT,
    FOCUS_SECTION_CODES,
} from '../contracts/call-focus-analysis.contract';
import { CLOSING_CHECKLISTS_SPEC } from '../contracts/call-focus-deal.contract';
import {
    FOCUS_PASSES,
    buildFocusPasses,
    type FocusPass,
} from '../contracts/call-focus-passes.contract';
import {
    CALL_REPORT_PROMPT_VERSION,
    CALL_REPORT_PROMPT_VERSION_BASE,
    promptVersionFor,
} from '../contracts/call-report-versions.const';

/**
 * Задание с цитатами (focus-v3.4) и выключатель: пока он выключен, задание
 * модели прежнее байт в байт — хэши ниже сняты с кода до правки (a818f857,
 * focus-v3.3); с цитатами — строгие схемы с новыми полями.
 */

const hash = (value: unknown): string =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Хэши {prompt, schema} проходов и цельного разбора на a818f857. */
const ORIGINAL_HASHES: Record<string, string> = {
    form: 'a2e027460922b2a9782ea6c046f236f3285bef831041cb7667d3b0c9841230a7',
    content: '577eb8eebf6755174eba6c07ab04e99bcfc75d3ca0c5d377450bba1c55afc364',
    movement:
        'c7c37cde1d36173b1c91b1b53ca48f189553a20790cebf5052084756e348f95f',
    closing: '8f32208834f59cb50ef7a9f091b83306181daf970ac96cb4404a3d8e5e02fef1',
    // Блок обязательной отчётности после презентации (withCheckPresentation).
    afterPresentation:
        '327ec4f9e9e222165ef5a6ca36231049ba2d48fd9f9700b15ad4c3dd5a331251',
    deep: 'f87c1d18bea87cbfcb45e75ee06c1b246dba3a8ea627d7a1cae2833c66cca559',
};

type Schema = Record<string, unknown>;

const propertiesOf = (schema: Schema): Schema => schema.properties as Schema;

/** Все объекты схемы со списком полей — для проверки strict-режима. */
function objectSchemas(schema: unknown): Schema[] {
    if (schema === null || typeof schema !== 'object') return [];
    const node = schema as Schema;
    const own = node.properties ? [node] : [];
    const nested = [
        ...Object.values((node.properties as Schema | undefined) ?? {}),
        node.items,
    ].flatMap(objectSchemas);
    return [...own, ...nested];
}

const passOf = (passes: readonly FocusPass[], key: string): FocusPass => {
    const pass = passes.find(item => item.key === key);
    if (!pass) throw new Error(`нет прохода ${key}`);
    return pass;
};

const sectionItemOf = (pass: FocusPass): Schema =>
    (propertiesOf(pass.schema).sections as Schema).items as Schema;

describe('задание фокус-проходов: выключатель цитат', () => {
    it('выключатель по умолчанию выключен, версия — прежняя 3.3', () => {
        expect(QUOTE_EVIDENCE_ENABLED).toBe(false);
        expect(CALL_REPORT_PROMPT_VERSION).toBe('focus-v3.3-2026-11-17');
        expect(promptVersionFor(false)).toBe(CALL_REPORT_PROMPT_VERSION_BASE);
    });

    it('без цитат — тот же список проходов для любого типа звонка', () => {
        for (const callType of ['presentation', 'refine', 'cold', null]) {
            expect(buildFocusPasses({ quoteEvidence: false, callType })).toBe(
                FOCUS_PASSES,
            );
        }
    });

    it('без цитат задание байт в байт прежнее (хэши с a818f857), цельный разбор не тронут', () => {
        for (const pass of FOCUS_PASSES) {
            expect([
                pass.key,
                hash({ prompt: pass.prompt, schema: pass.schema }),
            ]).toEqual([pass.key, ORIGINAL_HASHES[pass.key]]);
        }
        expect(
            hash({
                prompt: CALL_DEEP_ANALYSIS_SYSTEM_PROMPT,
                schema: CALL_DEEP_ANALYSIS_SCHEMA,
            }),
        ).toBe(ORIGINAL_HASHES.deep);
        expect(
            createHash('sha256')
                .update(AFTER_PRESENTATION_STRICT_BLOCK)
                .digest('hex'),
        ).toBe(ORIGINAL_HASHES.afterPresentation);
    });

    it('обязательная отчётность без цитат — прежний блок у презентации и решения', () => {
        for (const callType of ['presentation', 'decision']) {
            expect(afterPresentationBlockFor(callType, false)).toBe(
                AFTER_PRESENTATION_STRICT_BLOCK,
            );
        }
        for (const callType of ['refine', 'cold', null]) {
            expect(afterPresentationBlockFor(callType, false)).toBe('');
        }
    });

    it('версия с цитатами 3.4 — в общей серии оценок', () => {
        const quotes = promptVersionFor(true);
        expect(quotes).toBe('focus-v3.4-2026-11-18');
        expect(Object.keys(PROMPT_SERIES_START)).toContain(quotes);
        expect(versionSeriesDate(quotes)).toBe(AI_ANALYSIS_SERIES_START);
    });
});

describe('задание с цитатами (focus-v3.4)', () => {
    const presentation = buildFocusPasses({
        quoteEvidence: true,
        callType: 'presentation',
    });
    const refine = buildFocusPasses({
        quoteEvidence: true,
        callType: 'refine',
    });

    it('ключи, подписи и зоны разделов — прежние', () => {
        expect(
            presentation.map(({ key, label, digestLabel }) => ({
                key,
                label,
                digestLabel,
            })),
        ).toEqual(
            FOCUS_PASSES.map(({ key, label, digestLabel }) => ({
                key,
                label,
                digestLabel,
            })),
        );
        for (const pass of presentation) {
            const section = propertiesOf(sectionItemOf(pass)).section as Schema;
            expect(section.enum).toEqual(FOCUS_SECTION_CODES[pass.key]);
        }
    });

    it('строгие схемы: в каждом объекте required — все поля, лишних полей нет', () => {
        for (const pass of [...presentation, ...refine]) {
            for (const node of objectSchemas(pass.schema)) {
                expect([...(node.required as string[])].sort()).toEqual(
                    Object.keys(propertiesOf(node)).sort(),
                );
                expect(node.additionalProperties).toBe(false);
            }
        }
    });

    it('у раздела — цитата и секунда рядом с asWas, в каждом проходе', () => {
        for (const pass of presentation) {
            const fields = Object.keys(propertiesOf(sectionItemOf(pass)));
            expect(fields).toEqual(
                expect.arrayContaining(['asWas', 'quote', 'startSec']),
            );
            expect(pass.prompt).toContain(EVIDENCE_QUOTE_RULES);
            expect(pass.prompt).toContain(SECTION_EVIDENCE_SPEC);
        }
    });

    it('форма и возражения: прежнее задание плюс блок цитат в конце', () => {
        expect(
            passOf(presentation, 'form').prompt.startsWith(FOCUS_FORM_PROMPT),
        ).toBe(true);
        expect(
            passOf(presentation, 'movement').prompt.startsWith(
                FOCUS_MOVEMENT_PROMPT,
            ),
        ).toBe(true);
    });

    it('содержание: needItems на месте needs, текст needs из задания убран', () => {
        const content = passOf(presentation, 'content');
        const keys = Object.keys(propertiesOf(content.schema));
        const before = Object.keys(
            propertiesOf(passOf([...FOCUS_PASSES], 'content').schema),
        );
        expect(keys).toEqual(
            before.map(key => (key === 'needs' ? 'needItems' : key)),
        );
        expect(content.prompt).toContain(NEED_ITEMS_SPEC);
        expect(content.prompt).not.toContain('- needs —');
    });

    it('закрытие презентации: «хвост» и 5К с местами пунктов, ключи — из анкеты', () => {
        const closing = passOf(presentation, 'closing');
        const properties = propertiesOf(closing.schema);
        expect(Object.keys(properties)).toEqual(
            expect.arrayContaining([
                'hvostDone',
                'hvostSteps',
                'fiveKItems',
                'hvostEvidence',
                'fiveKEvidence',
            ]),
        );
        const keyEnum = (field: string): unknown =>
            propertiesOf((properties[field] as Schema).items as Schema).key;
        expect((keyEnum('hvostEvidence') as Schema).enum).toEqual([
            ...HVOST_STEP_KEYS,
        ]);
        expect((keyEnum('fiveKEvidence') as Schema).enum).toEqual([
            ...FIVE_K_ITEM_KEYS,
        ]);
        expect(closing.prompt).toContain(CLOSING_CHECKLISTS_SPEC);
        expect(closing.prompt).toContain(CHECKLIST_EVIDENCE_SPEC);
    });

    it('закрытие не-презентации: «хвоста» и 5К в задании нет вовсе', () => {
        for (const callType of ['refine', 'decision', 'cold', null]) {
            const closing = passOf(
                buildFocusPasses({ quoteEvidence: true, callType }),
                'closing',
            );
            const keys = Object.keys(propertiesOf(closing.schema));
            expect(keys.filter(key => /hvost|fiveK/.test(key))).toEqual([]);
            expect(closing.prompt).not.toContain('hvost');
            expect(closing.prompt).not.toContain('«хвост»');
            expect(closing.prompt).not.toContain(CHECKLIST_EVIDENCE_SPEC);
        }
    });

    it('обязательная отчётность: у решения — правило оценки закрытия без «хвоста» и 5К, у презентации — весь блок', () => {
        const decision = afterPresentationBlockFor('decision', true);
        expect(decision).toContain(AFTER_PRESENTATION_CLOSING_RULE);
        expect(decision).toContain('не выше 5');
        expect(decision).not.toContain('«хвост»');
        expect(decision).not.toContain('5К');
        expect(afterPresentationBlockFor('presentation', true)).toBe(
            AFTER_PRESENTATION_STRICT_BLOCK,
        );
        for (const callType of ['refine', 'cold', null]) {
            expect(afterPresentationBlockFor(callType, true)).toBe('');
        }
    });

    it('«хвост» и 5К спрашиваются только у презентации', () => {
        expect(checklistsAskedFor('presentation')).toBe(true);
        for (const callType of ['decision', 'refine', 'cold', 'other', null]) {
            expect(checklistsAskedFor(callType)).toBe(false);
        }
    });

    it('прежнее задание блока цитат не содержит', () => {
        for (const pass of FOCUS_PASSES) {
            expect(pass.prompt).not.toContain(EVIDENCE_QUOTE_RULES);
            expect(pass.prompt).not.toContain('needItems');
        }
    });
});
