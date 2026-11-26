import {
    CALL_LONG_SUMMARY_PROMPT,
    CALL_LONG_SUMMARY_SCHEMA,
    CALL_LONG_SUMMARY_SCHEMA_NAME,
} from '../contracts/call-long-summary.contract';
import {
    LONG_CALL_DIRECTIONS,
    LONG_CALL_EVENT_KINDS,
    LONG_CALL_THREAD_STATUSES,
} from '../long-call/long-call.const';

describe('call_long_summary — задание «сводка разговора»', () => {
    it('имя роли — call_long_summary', () => {
        expect(CALL_LONG_SUMMARY_SCHEMA_NAME).toBe('call_long_summary');
    });

    it('задание называет все поля ответа, все виды, статусы и направления', () => {
        for (const word of [
            'story',
            'threads',
            'result',
            'endedAbruptly',
            'windows',
            ...LONG_CALL_EVENT_KINDS,
            ...LONG_CALL_THREAD_STATUSES,
            ...LONG_CALL_DIRECTIONS,
        ]) {
            expect(CALL_LONG_SUMMARY_PROMPT).toContain(word);
        }
        expect(CALL_LONG_SUMMARY_PROMPT).toContain('не больше 12');
        expect(CALL_LONG_SUMMARY_PROMPT).toContain('не больше 6 отрезков');
        expect(CALL_LONG_SUMMARY_PROMPT).toContain('не длиннее 120 секунд');
    });

    describe('схема ответа', () => {
        const { windows } = CALL_LONG_SUMMARY_SCHEMA.properties;
        const thread = CALL_LONG_SUMMARY_SCHEMA.properties.threads.items;

        it('строгая: все поля в required, additionalProperties: false на каждом уровне', () => {
            expect(CALL_LONG_SUMMARY_SCHEMA.additionalProperties).toBe(false);
            expect(CALL_LONG_SUMMARY_SCHEMA.required).toEqual(
                Object.keys(CALL_LONG_SUMMARY_SCHEMA.properties),
            );
            expect(thread.additionalProperties).toBe(false);
            expect(thread.required).toEqual(Object.keys(thread.properties));
            expect(windows.additionalProperties).toBe(false);
        });

        it('windows — объект с пятью обязательными полями-массивами по направлениям', () => {
            expect(Object.keys(windows.properties)).toEqual([
                'form',
                'content',
                'movement',
                'closing',
                'methodology',
            ]);
            expect(windows.required).toEqual([...LONG_CALL_DIRECTIONS]);
            for (const direction of LONG_CALL_DIRECTIONS) {
                const list = windows.properties[direction];
                expect(list.type).toBe('array');
                expect(list.items.required).toEqual([
                    'fromSec',
                    'toSec',
                    'why',
                ]);
                expect(list.items.additionalProperties).toBe(false);
            }
        });

        it('вид линии и статус — только из констант', () => {
            expect(thread.properties.kind.enum).toEqual([
                ...LONG_CALL_EVENT_KINDS,
            ]);
            expect(thread.properties.status.enum).toEqual([
                ...LONG_CALL_THREAD_STATUSES,
            ]);
        });
    });
});
