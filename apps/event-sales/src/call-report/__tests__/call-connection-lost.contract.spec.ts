import { POLYANSKY_METHODOLOGY } from '@lib/call-lib';
import {
    CALL_REPORT_ISSUE_CODES,
    CALL_REPORT_ISSUE_CONNECTION_LOST,
    CALL_REPORT_OUTCOME_CODES,
    CALL_REPORT_OUTCOME_CONNECTION_LOST,
} from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-report-facts.type';
import { CALL_CONNECTION_LOST_RULE } from '../contracts/call-connection-lost.contract';
import {
    CALL_DEEP_ANALYSIS_SYSTEM_PROMPT,
    DEEP_ANALYSIS_CORE_RULES,
    DEEP_ANALYSIS_RULES_WITH_CONNECTION_LOST,
    SECTION_FIELDS_SPEC,
} from '../contracts/call-deep-analysis.contract';
import { FOCUS_SYNTHESIS_PROMPT } from '../contracts/call-focus-analysis.contract';
import { buildFocusPasses } from '../contracts/call-focus-passes.contract';
import { COMPLIANCE_REVIEW_PROMPT } from '../contracts/call-compliance-review.contract';
import { CALL_REVISION_PROMPT } from '../contracts/call-revision.contract';
import {
    ISSUES_SCHEMA,
    MOVEMENT_FACTS_SPEC,
    OUTCOME_SCHEMA,
} from '../contracts/call-report-facts.contract';
import {
    FACTS_CATCHUP_PROMPT,
    FACTS_CATCHUP_SCHEMA,
} from '../contracts/call-report-facts-catchup.contract';
import { RISK_FLAGS_SPEC } from '../contracts/call-risk-flags.contract';
import { PRESENTATION_AUDIT_PROMPT } from '../contracts/presentation-audit.contract';
import { buildMethodologyPassPrompt } from '../contracts/methodology-pass.contract';

/**
 * Обрыв связи — не вина менеджера (focus-v3.5 / v3.6, 26.11.2026): общее
 * правило стоит ровно один раз в каждом задании, где модель оценивает конец
 * разговора или ставит исход; новые коды исхода и сбоя принимает схема.
 */

const occurrences = (text: string, part: string): number =>
    text.split(part).length - 1;

/** Начало правила — по нему считаем, сколько раз оно встретилось. */
const RULE_HEAD = 'ОБРЫВ СВЯЗИ. Если запись кончается на полуслове';

/** Правило в тексте ровно один раз — целиком, а не обрывком. */
const expectRuleOnce = (prompt: string): void => {
    expect(occurrences(prompt, RULE_HEAD)).toBe(1);
    expect(occurrences(prompt, CALL_CONNECTION_LOST_RULE)).toBe(1);
};

const flat = (text: string): string => text.replace(/\s+/g, ' ');

describe('общее правило «обрыв связи»', () => {
    it('текст правила — по ключевым требованиям задания', () => {
        const rule = flat(CALL_CONNECTION_LOST_RULE);
        expect(rule).toContain('это обрыв связи, а не поступок менеджера');
        expect(rule).toContain('«бросил трубку»');
        expect(rule).toContain('«не завершил разговор»');
        expect(rule).toContain('недостижимый этап');
        expect(rule).toContain(
            'то, что прозвучало до обрыва, оценивай как обычно',
        );
        expect(rule).toContain(
            'сомневаешься, оборвалась связь или разговор закончили, — считай, что оборвалась связь',
        );
        // Модель читает правило как текст для людей: кодов в нём нет.
        expect(rule).not.toContain(CALL_REPORT_OUTCOME_CONNECTION_LOST);
    });

    it('ядро правил остаётся прежним, а версия с правилом — ядро плюс правило', () => {
        expect(DEEP_ANALYSIS_CORE_RULES).not.toContain(RULE_HEAD);
        expect(DEEP_ANALYSIS_RULES_WITH_CONNECTION_LOST).toBe(
            `${DEEP_ANALYSIS_CORE_RULES}\n\n${CALL_CONNECTION_LOST_RULE}`,
        );
        expectRuleOnce(DEEP_ANALYSIS_RULES_WITH_CONNECTION_LOST);
    });
});

describe('правило «обрыв связи» в заданиях модели — ровно один раз', () => {
    it('цельный глубокий разбор', () => {
        expectRuleOnce(CALL_DEEP_ANALYSIS_SYSTEM_PROMPT);
    });

    it('синтез', () => {
        expectRuleOnce(FOCUS_SYNTHESIS_PROMPT);
    });

    it('все четыре фокус-прохода прежнего задания', () => {
        const passes = buildFocusPasses({
            quoteEvidence: false,
            callType: 'presentation',
        });
        expect(passes.map(pass => pass.key)).toEqual([
            'form',
            'content',
            'movement',
            'closing',
        ]);
        for (const pass of passes) expectRuleOnce(pass.prompt);
    });

    it('все четыре фокус-прохода задания с цитатами — для презентации и для остальных типов', () => {
        for (const callType of ['presentation', 'cold', null]) {
            const passes = buildFocusPasses({ quoteEvidence: true, callType });
            expect(passes).toHaveLength(4);
            for (const pass of passes) expectRuleOnce(pass.prompt);
        }
    });

    it('проход «методика»: с пунктами и спиралями и для типа без спиралей', () => {
        for (const callType of ['presentation', 'cold']) {
            expectRuleOnce(
                buildMethodologyPassPrompt(POLYANSKY_METHODOLOGY, callType),
            );
        }
    });

    it('догон признаков', () => {
        expectRuleOnce(FACTS_CATCHUP_PROMPT);
    });

    it('сверка с регламентом, ночной ревизор и сверка отчётности конец разговора не оценивают — правила в них нет', () => {
        for (const prompt of [
            COMPLIANCE_REVIEW_PROMPT,
            CALL_REVISION_PROMPT,
            PRESENTATION_AUDIT_PROMPT,
        ]) {
            expect(prompt).not.toContain(RULE_HEAD);
        }
    });
});

describe('тексты заданий про обрыв связи', () => {
    it('описание разделов: обрыв связи — недостижимый этап, закрытие и шаг не оцениваются', () => {
        const spec = flat(SECTION_FIELDS_SPEC);
        expect(spec).toContain(
            'разговор просто не дошёл. Сюда же — обрыв связи посреди разговора: этапы, до которых разговор не успел дойти (закрытие, следующий шаг, работа с отказом), недостижимы.',
        );
        expect(spec).toContain(
            'оцениваются и в таком звонке — кроме обрыва связи: там закрытие и следующий шаг не оцениваются.',
        );
        // Прежнее последнее предложение абзаца заменено, а не продублировано.
        expect(occurrences(spec, 'оцениваются и в таком звонке')).toBe(1);
    });

    it('описание исхода называет код connection_lost и отделяет его от no_contact', () => {
        const spec = flat(MOVEMENT_FACTS_SPEC);
        expect(spec).toContain(
            'connection_lost — разговор по существу шёл и оборвался',
        );
        expect(spec).toContain(
            'успели договориться или клиент отказал до обрыва',
        );
        expect(spec).toContain(
            'связь оборвалась раньше, чем начался разговор по существу',
        );
        // Обрыв больше не перечислен среди причин «без контакта» (прежнее «автоответчик, обрыв»).
        expect(spec).not.toContain('автоответчик, обрыв');
    });

    it('описание сбоев: «телефония» — помехи, «связь прервалась» — запись кончается на полуслове', () => {
        const spec = flat(MOVEMENT_FACTS_SPEC);
        expect(spec).toContain(
            'telephony — помехи, плохо слышно, не дозвонились в договорённое время',
        );
        expect(spec).toContain(
            'connection_lost — связь оборвалась посреди разговора: запись кончается на полуслове или без прощания (цитата — последняя прозвучавшая фраза)',
        );
        expect(spec).not.toContain('telephony — обрыв');
    });

    it('шапка фактов: при сомнении — обрыв связи, а не «более слабый вариант для менеджера»', () => {
        expect(flat(MOVEMENT_FACTS_SPEC)).toContain(
            'выбирай более слабый для менеджера. Исключение — обрыв связи: сомневаешься, оборвалась связь или разговор закончили, — считай, что оборвалась связь.',
        );
    });

    it('риск-флаги: при обрыве связи door_closed не ставится', () => {
        expect(flat(RISK_FLAGS_SPEC)).toContain(
            'При обрыве связи door_closed не ставится: возможности оставить дверь открытой у менеджера не было.',
        );
    });

    it('методика: пункты, до которых разговор не дошёл из-за обрыва, — not_applicable', () => {
        const prompt = flat(
            buildMethodologyPassPrompt(POLYANSKY_METHODOLOGY, 'presentation'),
        );
        expect(prompt).toContain(
            'Пункты, до которых разговор не дошёл из-за обрыва связи (резюме договорённостей, следующий шаг, прощание), — not_applicable, а не missed.',
        );
    });
});

describe('схемы ответа принимают новые коды', () => {
    it('схема исхода собрана из справочника и содержит connection_lost', () => {
        expect(OUTCOME_SCHEMA.enum).toEqual([
            ...CALL_REPORT_OUTCOME_CODES,
            null,
        ]);
        expect(OUTCOME_SCHEMA.enum).toContain(
            CALL_REPORT_OUTCOME_CONNECTION_LOST,
        );
    });

    it('схема кода сбоя собрана из справочника и содержит connection_lost', () => {
        const codes = ISSUES_SCHEMA.items.properties.code.enum;
        expect(codes).toEqual([...CALL_REPORT_ISSUE_CODES]);
        expect(codes).toContain(CALL_REPORT_ISSUE_CONNECTION_LOST);
    });

    it('схема догона признаков принимает те же коды', () => {
        const properties = FACTS_CATCHUP_SCHEMA.properties;
        expect(properties.outcome.enum).toContain(
            CALL_REPORT_OUTCOME_CONNECTION_LOST,
        );
        expect(properties.issues.items.properties.code.enum).toContain(
            CALL_REPORT_ISSUE_CONNECTION_LOST,
        );
    });

    it('текст исхода и сбоя описывает каждый код справочников, включая новый', () => {
        for (const code of [
            ...CALL_REPORT_OUTCOME_CODES,
            ...CALL_REPORT_ISSUE_CODES,
        ]) {
            expect(MOVEMENT_FACTS_SPEC).toContain(`${code} —`);
        }
    });
});
