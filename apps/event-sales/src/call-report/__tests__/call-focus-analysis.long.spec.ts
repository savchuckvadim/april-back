import { Logger } from '@nestjs/common';
import { POLYANSKY_METHODOLOGY, type ResolvedMethodology } from '@lib/call-lib';
import { buildDeepAnalysisUserContent } from '../contracts/call-deep-analysis.contract';
import { CALL_REPORT_PROMPT_VERSION } from '../contracts/call-report-versions.const';
import type { StoredFocusPasses } from '../services/call-focus-stored.util';
import type { LongCallConsumer } from '../long-call/long-call-consumers.const';
import { DOMAIN, makeFocusService } from './call-focus-analysis.long.fixture';
import {
    longCallInput,
    markerOf,
    noLongCall,
    withLongCall,
} from './call-long-input.fake';

/**
 * Этап 4г: длинный разговор идёт в проходы фокус-разбора текстами длинного
 * пути, короткий (prepare → null) — ровно как раньше.
 */
const FULL = 'ПОЛНАЯ-РАСШИФРОВКА: алло, добрый день';
const PASSPORT = 'ПАСПОРТ ЗВОНКА';
const RESOLVED: ResolvedMethodology = {
    methodology: POLYANSKY_METHODOLOGY,
    scope: 'portal',
    source: 'table',
    versionTag: 'polyansky@1.0.0',
};
const SYNTHESIS = { summary: 'Итог', score: 6 };

describe('CallFocusAnalysisService: длинный разговор по частям', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('каждый проход, проход методики и синтез получают свой текст, а не полную расшифровку', async () => {
        const { service, userOf } = makeFocusService({
            longCall: withLongCall(),
            methodology: RESOLVED,
            responses: {
                call_focus_methodology: { checkpoints: [], spirals: [] },
                call_focus_synthesis: SYNTHESIS,
            },
        });

        const dto = await service.run(DOMAIN, FULL, 'presentation', PASSPORT);

        expect(dto).not.toBeNull();
        const own: [string, LongCallConsumer][] = [
            ['call_focus_form', 'form'],
            ['call_focus_content', 'content'],
            ['call_focus_movement', 'movement'],
            ['call_focus_closing', 'closing'],
            ['call_focus_methodology', 'methodology'],
            ['call_focus_synthesis', 'synthesis'],
        ];
        for (const [schema, consumer] of own) {
            const user = userOf(schema);
            // Обёртка та же: тип звонка, паспорт, затем текст.
            expect(user).toContain('Тип звонка по классификатору');
            expect(user).toContain(PASSPORT);
            expect(user).toContain(
                `Разбери звонок по расшифровке:\n\n${markerOf(consumer)}`,
            );
            expect(user).not.toContain(FULL);
            for (const [, other] of own.filter(([, key]) => key !== consumer)) {
                expect(user).not.toContain(markerOf(other));
            }
        }
    });

    it('prepare получает домен, расшифровку и модель; force — только при longParts: force', async () => {
        const plain = makeFocusService({ longCall: withLongCall() });
        await plain.service.run(DOMAIN, FULL, 'call', undefined, {
            model: 'bitrix/own',
        });
        expect(plain.longCall.prepare).toHaveBeenCalledTimes(1);
        expect(plain.longCall.prepare).toHaveBeenCalledWith(DOMAIN, FULL, {
            model: 'bitrix/own',
            force: false,
        });

        const forced = makeFocusService({ longCall: withLongCall() });
        await forced.service.run(DOMAIN, FULL, 'call', undefined, {
            longParts: 'force',
        });
        expect(forced.longCall.prepare).toHaveBeenCalledWith(DOMAIN, FULL, {
            model: undefined,
            force: true,
        });
    });

    it('расход включает ответы подготовки; метка longCall заполнена', async () => {
        const { service } = makeFocusService({
            longCall: withLongCall(),
            responses: { call_focus_synthesis: SYNTHESIS },
        });

        const dto = await service.run(DOMAIN, FULL, 'call');

        // Четыре прохода и синтез по 120, два ответа подготовки по 60.
        expect(dto?.usage).toMatchObject({ tokens: 720, calls: 7 });
        expect(dto?.extra).toEqual({
            longCall: {
                parts: 7,
                partsWithoutDigest: 1,
                hasSummary: true,
                transcriptChars: 58_400,
                sourceChars: 140_200,
            },
        });
    });

    it('сохранённые проходы игнорируются, у неполного разбора focusPasses не пишутся', async () => {
        const stored: StoredFocusPasses = {
            promptVersion: CALL_REPORT_PROMPT_VERSION,
            passes: {
                form: { sections: [], sentiment: 'neutral' },
                content: { sections: [] },
                movement: { sections: [] },
            },
        };
        const { service, schemas } = makeFocusService({
            longCall: withLongCall(),
            responses: {
                call_focus_closing: new Error('down'),
                call_focus_synthesis: SYNTHESIS,
            },
        });

        const dto = await service.run(DOMAIN, FULL, 'call', undefined, {
            stored,
        });

        // Все четыре прохода идут заново, несмотря на сохранённые.
        expect(schemas()).toEqual([
            'call_focus_form',
            'call_focus_content',
            'call_focus_movement',
            'call_focus_closing',
            'call_focus_synthesis',
        ]);
        expect(dto?.incompleteParts).toEqual(['closing']);
        expect(Object.keys(dto?.extra ?? {})).toEqual(['longCall']);
        expect(dto?.extra?.longCall).toMatchObject({ parts: 7 });
    });

    it('сохранённые проходы при коротком разговоре работают как раньше', async () => {
        const stored: StoredFocusPasses = {
            promptVersion: CALL_REPORT_PROMPT_VERSION,
            passes: {
                form: { sections: [] },
                content: { sections: [] },
                movement: { sections: [] },
            },
        };
        const { service, schemas } = makeFocusService({
            longCall: noLongCall(),
            responses: { call_focus_synthesis: SYNTHESIS },
        });

        await service.run(DOMAIN, FULL, 'call', undefined, { stored });

        expect(schemas()).toEqual([
            'call_focus_closing',
            'call_focus_synthesis',
        ]);
    });

    it('короткий разговор (prepare → null): запросы к модели те же, что до правок', async () => {
        const { service, schemas, userOf, longCall } = makeFocusService({
            longCall: noLongCall(),
            responses: { call_focus_synthesis: SYNTHESIS },
        });

        const dto = await service.run(DOMAIN, 'текст разговора', null);

        const same = '\nРазбери звонок по расшифровке:\n\nтекст разговора';
        expect(userOf('call_focus_form')).toBe(same);
        expect(userOf('call_focus_content')).toBe(same);
        expect(userOf('call_focus_movement')).toBe(same);
        expect(userOf('call_focus_closing')).toBe(same);
        expect(userOf('call_focus_synthesis')).toMatch(
            /^ВЫВОДЫ СПЕЦИАЛИЗИРОВАННЫХ РАЗБОРОВ:\n\n[\s\S]*\n\n\nРазбери звонок по расшифровке:\n\nтекст разговора$/,
        );
        expect(schemas()).toEqual([
            'call_focus_form',
            'call_focus_content',
            'call_focus_movement',
            'call_focus_closing',
            'call_focus_synthesis',
        ]);
        expect(longCall.prepare).toHaveBeenCalledTimes(1);
        expect(dto?.usage).toMatchObject({ tokens: 600, calls: 5 });
        expect(dto?.extra).toBeUndefined();
    });

    it('короткий разговор с типом и паспортом: user-часть — как у цельного разбора', async () => {
        const { service, userOf } = makeFocusService({
            longCall: noLongCall(),
            responses: { call_focus_synthesis: SYNTHESIS },
        });

        await service.run(DOMAIN, FULL, 'presentation', PASSPORT);

        expect(userOf('call_focus_form')).toBe(
            buildDeepAnalysisUserContent(FULL, 'presentation', PASSPORT),
        );
    });

    it('сохранённый ответ методики при длинном пути не берётся: проход идёт заново', async () => {
        const stored: StoredFocusPasses = {
            promptVersion: CALL_REPORT_PROMPT_VERSION,
            passes: {
                form: { sections: [] },
                content: { sections: [] },
                movement: { sections: [] },
                closing: { sections: [] },
            },
            methodology: {
                tag: RESOLVED.versionTag,
                result: { checkpoints: [], spirals: [] },
            },
        };
        const { service, schemas } = makeFocusService({
            longCall: withLongCall(),
            methodology: RESOLVED,
            responses: {
                call_focus_methodology: { checkpoints: [], spirals: [] },
                call_focus_synthesis: SYNTHESIS,
            },
        });

        await service.run(DOMAIN, FULL, 'presentation', undefined, { stored });

        expect(schemas()).toEqual(
            expect.arrayContaining([
                'call_focus_form',
                'call_focus_content',
                'call_focus_movement',
                'call_focus_closing',
                'call_focus_methodology',
                'call_focus_synthesis',
            ]),
        );
        expect(schemas()).toHaveLength(6);
    });

    it('без методики и без ответов подготовки расход — только проходы и синтез', async () => {
        const { service, schemas } = makeFocusService({
            longCall: withLongCall(longCallInput({ completions: [] })),
            responses: { call_focus_synthesis: SYNTHESIS },
        });

        const dto = await service.run(DOMAIN, FULL, 'call');

        expect(schemas()).not.toContain('call_focus_methodology');
        expect(dto?.usage).toMatchObject({ tokens: 600, calls: 5 });
    });
});
