import {
    CALL_REPORT_ISSUE_CODES,
    CALL_REPORT_ISSUE_ITEMS,
    CALL_REPORT_NEXT_STEP_KIND_ITEMS,
    CALL_REPORT_NEXT_STEP_KINDS,
    CALL_REPORT_OBJECTION_TOPIC_ITEMS,
    CALL_REPORT_OBJECTION_TOPICS,
    CALL_REPORT_OUTCOME_CODES,
    CALL_REPORT_OUTCOME_ITEMS,
} from '@lib/call-lib';
import {
    CALL_DEEP_ANALYSIS_SCHEMA,
    DEEP_ANALYSIS_OUTPUT_SPEC,
    NEXT_STEP_SCHEMA,
    OBJECTION_SCHEMA,
} from '../contracts/call-deep-analysis.contract';
import {
    FOCUS_CLOSING_PROMPT,
    FOCUS_CLOSING_SCHEMA,
    FOCUS_FORM_PROMPT,
    FOCUS_FORM_SCHEMA,
    FOCUS_MOVEMENT_PROMPT,
    FOCUS_MOVEMENT_SCHEMA,
} from '../contracts/call-focus-analysis.contract';
import {
    FOCUS_CONTENT_PROMPT,
    FOCUS_CONTENT_SCHEMA,
} from '../contracts/call-focus-analysis.contract';
import {
    CLOSING_FACTS_REQUIRED,
    CONTENT_MOMENTS_REQUIRED,
    FORM_FACTS_REQUIRED,
    ISSUES_SCHEMA,
    MOVEMENT_FACTS_REQUIRED,
    MOVEMENT_FACTS_SPEC,
    OBJECTIONS_PRICE_FACTS_REQUIRED,
    PRICES_SCHEMA,
} from '../contracts/call-report-facts.contract';
import { CALL_REPORT_PROMPT_VERSION } from '../contracts/call-report-versions.const';

const requiredOf = (schema: Record<string, unknown>): string[] =>
    schema.required as string[];
const propertiesOf = (schema: Record<string, unknown>): string[] =>
    Object.keys(schema.properties as Record<string, unknown>);

describe('контракт фактов для отчётов (focus-v3.1)', () => {
    it('у каждого кода справочника есть русская подпись', () => {
        const codesOf = (items: readonly { CODE: string }[]) =>
            items.map(item => item.CODE);
        expect(codesOf(CALL_REPORT_OUTCOME_ITEMS)).toEqual([
            ...CALL_REPORT_OUTCOME_CODES,
        ]);
        expect(codesOf(CALL_REPORT_NEXT_STEP_KIND_ITEMS)).toEqual([
            ...CALL_REPORT_NEXT_STEP_KINDS,
        ]);
        expect(codesOf(CALL_REPORT_OBJECTION_TOPIC_ITEMS)).toEqual([
            ...CALL_REPORT_OBJECTION_TOPICS,
        ]);
        expect(codesOf(CALL_REPORT_ISSUE_ITEMS)).toEqual([
            ...CALL_REPORT_ISSUE_CODES,
        ]);
    });

    it('промпты фокусов объясняют каждый код исхода, темы и сбоя: тема и сбои — «возражения и цена», исход и вид шага — «закрытие»', () => {
        for (const code of [
            ...CALL_REPORT_OUTCOME_CODES,
            ...CALL_REPORT_OBJECTION_TOPICS,
            ...CALL_REPORT_ISSUE_CODES,
            ...CALL_REPORT_NEXT_STEP_KINDS,
        ]) {
            expect(MOVEMENT_FACTS_SPEC).toContain(`${code} —`);
        }
        for (const code of [
            ...CALL_REPORT_OBJECTION_TOPICS,
            ...CALL_REPORT_ISSUE_CODES,
        ]) {
            expect(FOCUS_MOVEMENT_PROMPT).toContain(`${code} —`);
        }
        for (const code of [
            ...CALL_REPORT_OUTCOME_CODES,
            ...CALL_REPORT_NEXT_STEP_KINDS,
        ]) {
            expect(FOCUS_CLOSING_PROMPT).toContain(`${code} —`);
        }
        expect(FOCUS_FORM_PROMPT).toContain('selfIntro —');
        expect(DEEP_ANALYSIS_OUTPUT_SPEC).toContain(MOVEMENT_FACTS_SPEC);
        expect(DEEP_ANALYSIS_OUTPUT_SPEC).toContain('selfIntro —');
    });

    it('схемы фокусов и цельного разбора требуют факты; шаг и возражение несут вид и тему', () => {
        for (const field of OBJECTIONS_PRICE_FACTS_REQUIRED) {
            expect(propertiesOf(FOCUS_MOVEMENT_SCHEMA)).toContain(field);
            expect(requiredOf(FOCUS_MOVEMENT_SCHEMA)).toContain(field);
        }
        for (const field of CLOSING_FACTS_REQUIRED) {
            expect(propertiesOf(FOCUS_CLOSING_SCHEMA)).toContain(field);
            expect(requiredOf(FOCUS_CLOSING_SCHEMA)).toContain(field);
        }
        // Два прохода вместе несут все факты прежнего «движения сделки».
        expect(
            [
                ...OBJECTIONS_PRICE_FACTS_REQUIRED,
                ...CLOSING_FACTS_REQUIRED,
            ].sort(),
        ).toEqual([...MOVEMENT_FACTS_REQUIRED].sort());
        for (const field of MOVEMENT_FACTS_REQUIRED) {
            expect(requiredOf(CALL_DEEP_ANALYSIS_SCHEMA)).toContain(field);
        }
        for (const field of FORM_FACTS_REQUIRED) {
            expect(propertiesOf(FOCUS_FORM_SCHEMA)).toContain(field);
            expect(requiredOf(FOCUS_FORM_SCHEMA)).toContain(field);
            expect(requiredOf(CALL_DEEP_ANALYSIS_SCHEMA)).toContain(field);
        }
        expect(NEXT_STEP_SCHEMA.required).toContain('kind');
        expect(OBJECTION_SCHEMA.required).toContain('topic');
        // Каждая подсхема перечисляет null среди значений — старые разборы и
        // нерелевантные звонки не ломают строгий режим ответа.
        expect(NEXT_STEP_SCHEMA.properties.kind.enum).toContain(null);
        expect(OBJECTION_SCHEMA.properties.topic.enum).toContain(null);
    });

    it('версия промпта поднята минорно и остаётся в общей серии', () => {
        expect(CALL_REPORT_PROMPT_VERSION).toBe('focus-v3.3-2026-11-17');
    });

    it('focus-v3.2: сбой «дубль в CRM» разделён на три кода — в справочнике, схеме и тексте промпта', () => {
        const codes: readonly string[] = CALL_REPORT_ISSUE_CODES;
        for (const code of [
            'crm_duplicate',
            'crm_repeat_refused',
            'crm_existing_client',
        ]) {
            expect(codes).toContain(code);
            expect(ISSUES_SCHEMA.items.properties.code.enum).toContain(code);
            expect(MOVEMENT_FACTS_SPEC).toContain(`${code} —`);
        }
        // У каждого кода есть русская подпись для карточки и отчёта.
        expect(CALL_REPORT_ISSUE_ITEMS.map(item => item.CODE).sort()).toEqual(
            [...codes].sort(),
        );
    });

    it('focus-v3.2: время в звонке у сбоев, цен и следующего шага — обязательные поля схемы', () => {
        expect(ISSUES_SCHEMA.items.required).toEqual(
            expect.arrayContaining(['startSec', 'endSec']),
        );
        expect(PRICES_SCHEMA.items.required).toContain('startSec');
        expect(NEXT_STEP_SCHEMA.required).toContain('startSec');
        expect(MOVEMENT_FACTS_SPEC).toContain('nextStep.startSec');
    });

    it('focus-v3.2: начало выяснения потребностей и презентации — в фокусе «содержание» и в цельном разборе', () => {
        for (const field of CONTENT_MOMENTS_REQUIRED) {
            expect(propertiesOf(FOCUS_CONTENT_SCHEMA)).toContain(field);
            expect(requiredOf(FOCUS_CONTENT_SCHEMA)).toContain(field);
            expect(FOCUS_CONTENT_PROMPT).toContain(`${field} —`);
            expect(propertiesOf(CALL_DEEP_ANALYSIS_SCHEMA)).toContain(field);
            expect(requiredOf(CALL_DEEP_ANALYSIS_SCHEMA)).toContain(field);
            expect(DEEP_ANALYSIS_OUTPUT_SPEC).toContain(`${field} —`);
        }
    });
});
