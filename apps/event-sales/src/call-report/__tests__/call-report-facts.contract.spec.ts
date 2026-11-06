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
    FOCUS_FORM_PROMPT,
    FOCUS_FORM_SCHEMA,
    FOCUS_MOVEMENT_PROMPT,
    FOCUS_MOVEMENT_SCHEMA,
} from '../contracts/call-focus-analysis.contract';
import {
    FORM_FACTS_REQUIRED,
    MOVEMENT_FACTS_REQUIRED,
    MOVEMENT_FACTS_SPEC,
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

    it('промпт фокуса «движение сделки» объясняет каждый код исхода, темы и сбоя', () => {
        for (const code of [
            ...CALL_REPORT_OUTCOME_CODES,
            ...CALL_REPORT_OBJECTION_TOPICS,
            ...CALL_REPORT_ISSUE_CODES,
            ...CALL_REPORT_NEXT_STEP_KINDS,
        ]) {
            expect(MOVEMENT_FACTS_SPEC).toContain(`${code} —`);
        }
        expect(FOCUS_MOVEMENT_PROMPT).toContain(MOVEMENT_FACTS_SPEC);
        expect(FOCUS_FORM_PROMPT).toContain('selfIntro —');
        expect(DEEP_ANALYSIS_OUTPUT_SPEC).toContain(MOVEMENT_FACTS_SPEC);
        expect(DEEP_ANALYSIS_OUTPUT_SPEC).toContain('selfIntro —');
    });

    it('схемы фокусов и цельного разбора требуют факты; шаг и возражение несут вид и тему', () => {
        for (const field of MOVEMENT_FACTS_REQUIRED) {
            expect(propertiesOf(FOCUS_MOVEMENT_SCHEMA)).toContain(field);
            expect(requiredOf(FOCUS_MOVEMENT_SCHEMA)).toContain(field);
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
        expect(CALL_REPORT_PROMPT_VERSION).toBe('focus-v3.1-2026-11-06');
    });
});
