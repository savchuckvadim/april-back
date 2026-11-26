import {
    buildCallLongPartPrompt,
    buildCallLongPartUserContent,
    CALL_LONG_PART_SCHEMA,
    CALL_LONG_PART_SCHEMA_NAME,
} from '../contracts/call-long-part.contract';
import { LONG_CALL_EVENT_KINDS } from '../long-call/long-call.const';

describe('call_long_part — задание «конспект части»', () => {
    it('имя роли — call_long_part', () => {
        expect(CALL_LONG_PART_SCHEMA_NAME).toBe('call_long_part');
    });

    describe('задание (system)', () => {
        it('подставляет номер части, число частей и время мм:сс', () => {
            const prompt = buildCallLongPartPrompt({
                number: 2,
                total: 5,
                fromSec: 530,
                toSec: 1100,
            });

            expect(prompt).toContain(
                '№ 2 из 5, время 08:50–18:20 от начала записи. Соседние части',
            );
            expect(prompt).not.toMatch(/\{(n|total|from|to)\}/);
        });

        it('минуты больше 59 подставляются как есть', () => {
            const prompt = buildCallLongPartPrompt({
                number: 7,
                total: 8,
                fromSec: 3903,
                toSec: 4400,
            });

            expect(prompt).toContain('№ 7 из 8, время 65:03–73:20 от начала');
        });

        it('записи без меток времени слова «, время … от начала записи» опущены', () => {
            const prompt = buildCallLongPartPrompt({
                number: 1,
                total: 3,
                fromSec: null,
                toSec: null,
            });

            expect(prompt).toContain('№ 1 из 3. Соседние части');
            expect(prompt).not.toContain(', время');
            expect(prompt).not.toContain('от начала записи');
        });

        it('остальной текст задания одинаков у всех частей', () => {
            const withTime = buildCallLongPartPrompt({
                number: 1,
                total: 2,
                fromSec: 0,
                toSec: 60,
            });
            const withoutTime = buildCallLongPartPrompt({
                number: 2,
                total: 2,
                fromSec: null,
                toSec: null,
            });
            const tail = (prompt: string): string =>
                prompt.slice(prompt.indexOf('Твоя задача'));

            expect(tail(withTime)).toBe(tail(withoutTime));
            expect(tail(withTime)).toContain('events — важные моменты части');
            expect(tail(withTime)).toContain('метка [12:05] — это 725');
        });
    });

    it('вход модели (user) — строка «ЧАСТЬ n ИЗ total:» и текст части', () => {
        expect(
            buildCallLongPartUserContent({
                number: 3,
                total: 6,
                text: '[10:00] Менеджер: Алло',
            }),
        ).toBe('ЧАСТЬ 3 ИЗ 6:\n[10:00] Менеджер: Алло');
    });

    describe('схема ответа', () => {
        const eventSchema = CALL_LONG_PART_SCHEMA.properties.events.items;

        it('строгая: все поля в required, additionalProperties: false', () => {
            expect(CALL_LONG_PART_SCHEMA.additionalProperties).toBe(false);
            expect(CALL_LONG_PART_SCHEMA.required).toEqual(
                Object.keys(CALL_LONG_PART_SCHEMA.properties),
            );
            expect(eventSchema.additionalProperties).toBe(false);
            expect(eventSchema.required).toEqual(
                Object.keys(eventSchema.properties),
            );
        });

        it('вид события — только из констант, секунда необязательна через null', () => {
            expect(eventSchema.properties.kind.enum).toEqual([
                ...LONG_CALL_EVENT_KINDS,
            ]);
            expect(eventSchema.properties.startSec.type).toEqual([
                'integer',
                'null',
            ]);
        });
    });
});
