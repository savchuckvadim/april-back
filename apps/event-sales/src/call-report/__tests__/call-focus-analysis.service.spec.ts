import { Logger } from '@nestjs/common';
import {
    CALL_REPORT_SECTION_CODES,
    POLYANSKY_METHODOLOGY,
    type ResolvedMethodology,
} from '@lib/call-lib';
import { LlmUnavailableError } from '@lib/llm-gateway';
import { FOCUS_SECTION_CODES } from '../contracts/call-focus-analysis.contract';
import { CallFocusAnalysisService } from '../services/call-focus-analysis.service';

const focusResult = (overrides?: Record<string, unknown>) => ({
    sections: [],
    ...overrides,
});

/** usage провайдера одного вызова: 100 токенов промпта, 20 — ответа. */
const USAGE = { promptTokens: 100, completionTokens: 20, totalTokens: 120 };

/** Сводная ошибка шлюза: VibeCode не дождался ответа, запасной отказал 413. */
const providerTimeout = () =>
    new LlmUnavailableError(
        'LLM недоступна: vibecode — Vibecode timeout after 180000 ms; ' +
            'openai-compatible — HTTP 413: Request too large',
        [
            { provider: 'vibecode', transient: true },
            { provider: 'openai-compatible', transient: false },
        ],
    );

/** Сводная ошибка шлюза: модель ответила негодным JSON, запасной — 400. */
const badAnswer = () =>
    new LlmUnavailableError(
        'LLM недоступна: vibecode — Unexpected end of JSON input; ' +
            'openai-compatible — HTTP 400: invalid schema',
        [
            { provider: 'vibecode', transient: false },
            { provider: 'openai-compatible', transient: false },
        ],
    );

const makeDeps = (options?: {
    /** schemaName → ответ (или Error для падения прохода). */
    responses?: Record<string, Record<string, unknown> | Error>;
    /** Методика портала из реестра; нет — разбор одним ядром. */
    methodology?: ResolvedMethodology | null;
}) => {
    const responses = options?.responses ?? {};
    const llm = {
        structuredCompletionWithUsage: jest.fn(
            (
                _system: string,
                _user: string,
                schemaName: string,
            ): Promise<unknown> => {
                const answer = responses[schemaName];
                if (answer instanceof Error) return Promise.reject(answer);
                return Promise.resolve({
                    result: answer ?? focusResult(),
                    usage: USAGE,
                    model: 'bitrix/bitrixgpt-5.5',
                });
            },
        ),
    };
    // Сервис материалов по ролям: по умолчанию база пуста.
    const materials = {
        collect: jest
            .fn()
            .mockImplementation(
                (_domain: string, requests: { kind: string }[]) =>
                    Promise.resolve(
                        requests.map(request => ({
                            kind: request.kind,
                            text: '',
                            chars: 0,
                            truncated: false,
                        })),
                    ),
            ),
    };
    const callTypeRegistry = {
        resolve: jest.fn().mockResolvedValue({ types: {} }),
    };
    // App-настройки event-sales: «5К и хвост» по умолчанию выключен.
    const appSettings = {
        resolve: jest.fn().mockResolvedValue({ withCheckPresentation: false }),
    };
    // Настройки конвейера: строгость презентации по умолчанию strict.
    const reportSettings = {
        resolve: jest
            .fn()
            .mockResolvedValue({ presentationStrictness: 'strict' }),
    };
    // Реестр методик: по умолчанию на портале методика не выбрана.
    const methodologyRegistry = {
        resolve: jest.fn().mockResolvedValue(options?.methodology ?? null),
    };
    const service = new CallFocusAnalysisService(
        llm as never,
        materials as never,
        callTypeRegistry as never,
        appSettings as never,
        reportSettings as never,
        methodologyRegistry as never,
    );
    return {
        service,
        llm,
        appSettings,
        reportSettings,
        materials,
        methodologyRegistry,
    };
};

describe('контракт фокусов', () => {
    it('фокусы покрывают ВСЕ разделы смарта без пересечений', () => {
        const union = Object.values(FOCUS_SECTION_CODES).flat();
        expect([...union].sort()).toEqual(
            [...CALL_REPORT_SECTION_CODES].sort(),
        );
        expect(new Set(union).size).toBe(union.length);
    });
});

describe('CallFocusAnalysisService', () => {
    it('собирает dto из трёх фокусов и синтеза; секции объединяются', async () => {
        const { service, llm } = makeDeps({
            responses: {
                call_focus_form: focusResult({
                    sections: [
                        { section: 'GREETING', relevance: 100, score: 8 },
                    ],
                    sentiment: 'positive',
                }),
                call_focus_content: focusResult({
                    sections: [{ section: 'NEEDS', relevance: 80, score: 6 }],
                    needsFound: true,
                    needs: ['практика 44-ФЗ'],
                }),
                call_focus_movement: focusResult({
                    sections: [{ section: 'PRICE', relevance: 0 }],
                    priceDiscussed: false,
                    nextStep: { set: true, description: 'созвон', date: null },
                }),
                call_focus_synthesis: {
                    summary: 'Итог звонка',
                    score: 7,
                    recommendations: ['приём → «фраза» → зачем'],
                    callTypeRefined: 'presentation',
                    callTypeReason: 'показали систему',
                },
            },
        });
        const dto = await service.run(
            'test.bitrix24.ru',
            'текст разговора',
            'call',
            'ПАСПОРТ',
        );

        expect(dto).not.toBeNull();
        expect(dto?.sections?.map(section => section.section)).toEqual([
            'GREETING',
            'NEEDS',
            'PRICE',
        ]);
        expect(dto?.summary).toBe('Итог звонка');
        expect(dto?.score).toBe(7);
        expect(dto?.callType).toBe('call');
        // Уточнение типа синтезом едет рядом; применяет его процессор.
        expect(dto?.callTypeRefined).toBe('presentation');
        expect(dto?.callTypeReason).toBe('показали систему');
        expect(dto?.priceDiscussed).toBe(false);
        // Все четыре вызова получили паспорт в user-контенте.
        for (const call of llm.structuredCompletionWithUsage.mock.calls) {
            expect(String(call[1])).toContain('ПАСПОРТ');
        }
        // Расход — сумма четырёх вызовов (3 фокуса + синтез).
        expect(dto?.usage).toEqual({
            tokens: 480,
            promptTokens: 400,
            completionTokens: 80,
            calls: 4,
            callsWithUsage: 4,
            model: 'bitrix/bitrixgpt-5.5',
        });
    });

    it('дубли кода внутри прохода схлопываются, чужие коды прохода отбрасываются (три «Приветствия» 29.10.2026)', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const { service } = makeDeps({
            responses: {
                call_focus_form: focusResult({
                    sections: [
                        { section: 'GREETING', relevance: 100, score: 1 },
                        { section: 'GREETING', relevance: 40, score: 4 },
                        { section: 'GREETING', relevance: 100, score: 1 },
                        // Чужой для «формы» раздел — модель нарушила enum.
                        { section: 'NEEDS', relevance: 50, score: 5 },
                    ],
                }),
                call_focus_content: focusResult({
                    sections: [{ section: 'NEEDS', relevance: 80, score: 6 }],
                }),
                call_focus_movement: focusResult({
                    sections: [
                        { section: 'PRICE', relevance: 100, score: 1 },
                        { section: 'CLOSING', relevance: 100, score: 2 },
                        { section: 'PRICE', relevance: 100, score: 1 },
                    ],
                }),
                call_focus_synthesis: { summary: 'Итог', score: 3 },
            },
        });
        const dto = await service.run('test.bitrix24.ru', 'текст', 'call');

        expect(dto?.sections).toEqual([
            { section: 'GREETING', relevance: 100, score: 1 },
            { section: 'NEEDS', relevance: 80, score: 6 },
            { section: 'PRICE', relevance: 100, score: 1 },
            { section: 'CLOSING', relevance: 100, score: 2 },
        ]);
        const warnings = warn.mock.calls
            .map(call => String(call[0]))
            .join('\n');
        expect(warnings).toContain('чужие разделы NEEDS отброшены');
        expect(warnings).toContain('GREETING ×3, PRICE ×2');
        warn.mockRestore();
    });

    it('один упавший фокус не роняет разбор; его разделы отсутствуют, расход — только по удавшимся', async () => {
        const { service } = makeDeps({
            responses: {
                call_focus_content: new Error('vibecode down'),
                call_focus_synthesis: { summary: 'Итог', score: 5 },
            },
        });
        const dto = await service.run('test.bitrix24.ru', 'текст', 'call');
        expect(dto).not.toBeNull();
        expect(
            dto?.sections?.some(section =>
                ['NEEDS', 'PRESENTATION'].includes(section.section),
            ),
        ).toBe(false);
        expect(dto?.usage).toMatchObject({ tokens: 360, calls: 3 });
        // Пометка для догона: какой проход не собрался.
        expect(dto?.incompleteParts).toEqual(['content']);
    });

    it('промпт «движения сделки» несёт блок сигналов руководителю с критериями флагов и доказательствами', async () => {
        const { service, llm } = makeDeps();
        await service.run('test.bitrix24.ru', 'текст', 'cold');

        const movement = llm.structuredCompletionWithUsage.mock.calls.find(
            call => (call as unknown[])[2] === 'call_focus_movement',
        ) as unknown[];
        const prompt = String(movement[0]);
        expect(prompt).toContain('СИГНАЛЫ РУКОВОДИТЕЛЮ');
        expect(prompt).toContain('сомневаешься — не ставь');
        expect(prompt).toContain('door_closed');
        expect(prompt).toContain('riskEvidence');
        const schema = movement[3] as {
            properties: Record<string, unknown>;
            required: string[];
        };
        expect(schema.required).toContain('riskEvidence');
        expect(schema.properties.riskEvidence).toBeDefined();
    });

    /**
     * Тип «Приглашение на мероприятие» (решение владельца 19.10.2026):
     * блок подключается так же, как блоки доработки и решения — ко всем
     * фокусам и синтезу, и только для звонков этого типа.
     */
    it('приглашение на мероприятие: блок EVENT_INVITE идёт во все проходы и синтез, другим типам — нет', async () => {
        const { service, llm } = makeDeps();
        await service.run('test.bitrix24.ru', 'текст', 'event_invite');
        const prompts = llm.structuredCompletionWithUsage.mock.calls.map(call =>
            String((call as unknown[])[0]),
        );
        expect(prompts).toHaveLength(4);
        for (const prompt of prompts) {
            expect(prompt).toContain('ЗВОНОК-ПРИГЛАШЕНИЕ НА МЕРОПРИЯТИЕ');
            expect(prompt).toContain(
                'ЧЕК-ЛИСТЫ ПРЕЗЕНТАЦИИ К ЭТОМУ ЗВОНКУ НЕ ПРИМЕНИМЫ',
            );
        }
        // Синтез знает про новый код в callTypeRefined.
        const synthesis = llm.structuredCompletionWithUsage.mock.calls.find(
            call => (call as unknown[])[2] === 'call_focus_synthesis',
        ) as unknown[];
        expect(String(synthesis[0])).toContain("'event_invite'");

        const other = makeDeps();
        await other.service.run('test.bitrix24.ru', 'текст', 'presentation');
        for (const call of other.llm.structuredCompletionWithUsage.mock.calls) {
            expect(String((call as unknown[])[0])).not.toContain(
                'ЗВОНОК-ПРИГЛАШЕНИЕ НА МЕРОПРИЯТИЕ',
            );
        }
    });

    it('два упавших фокуса → результат отброшен (null)', async () => {
        const { service } = makeDeps({
            responses: {
                call_focus_form: new Error('down'),
                call_focus_content: new Error('down'),
            },
        });
        const dto = await service.run('test.bitrix24.ru', 'текст', 'call');
        expect(dto).toBeNull();
    });

    it('упавший синтез не фатален: секции есть, итоговых полей нет', async () => {
        const { service } = makeDeps({
            responses: {
                call_focus_synthesis: new Error('down'),
            },
        });
        const dto = await service.run('test.bitrix24.ru', 'текст', 'call');
        expect(dto).not.toBeNull();
        expect(dto?.summary).toBeUndefined();
        expect(dto?.incompleteParts).toEqual(['synthesis']);
    });

    it('материалы по ролям: скрипт во всех проходах, возражения — в «содержании», регламент — в «движении», эталоны — в синтезе', async () => {
        const { service, llm, materials } = makeDeps();
        materials.collect.mockImplementation(
            (_domain: string, requests: { kind: string }[]) =>
                Promise.resolve(
                    requests.map(request => ({
                        kind: request.kind,
                        text: `ТЕКСТ[${request.kind}]`,
                        chars: 12,
                        truncated: false,
                    })),
                ),
        );

        await service.run('test.bitrix24.ru', 'текст', 'call');

        const prompts = llm.structuredCompletionWithUsage.mock.calls.map(call =>
            String((call as unknown[])[0]),
        );
        expect(prompts).toHaveLength(4);
        // Скрипт компании — в каждом проходе и в синтезе.
        for (const prompt of prompts) {
            expect(prompt).toContain('ТЕКСТ[sales-script]');
        }
        // Узкие материалы — только в своём проходе.
        const [form, content, movement, synthesis] = prompts;
        expect(content).toContain('ТЕКСТ[objection-playbook]');
        expect(form).not.toContain('ТЕКСТ[objection-playbook]');
        expect(movement).toContain('ТЕКСТ[sales-regulation]');
        expect(content).not.toContain('ТЕКСТ[sales-regulation]');
        expect(synthesis).toContain('ТЕКСТ[call-etalon]');
        expect(form).not.toContain('ТЕКСТ[call-etalon]');
    });

    it('презентация: методология показа запрашивается с увеличенным бюджетом и идёт во все проходы', async () => {
        const { service, llm, materials } = makeDeps();
        materials.collect.mockImplementation(
            (_domain: string, requests: { kind: string }[]) =>
                Promise.resolve(
                    requests.map(request => ({
                        kind: request.kind,
                        text:
                            request.kind === 'presentation-playbook'
                                ? 'МЕТОДОЛОГИЯ ПОКАЗА'
                                : '',
                        chars: 18,
                        truncated: false,
                    })),
                ),
        );

        await service.run('test.bitrix24.ru', 'текст', 'presentation');

        const requests = (materials.collect.mock.calls[0] as unknown[])[1] as {
            kind: string;
            budgetChars: number;
        }[];
        const playbook = requests.find(
            request => request.kind === 'presentation-playbook',
        );
        expect(playbook?.budgetChars).toBe(6000);

        const prompts = llm.structuredCompletionWithUsage.mock.calls.map(call =>
            String((call as unknown[])[0]),
        );
        for (const prompt of prompts) {
            expect(prompt).toContain('МЕТОДОЛОГИЯ ПОКАЗА');
        }
    });

    it('обычный звонок: методология презентации запрашивается по остаточному бюджету', async () => {
        const { service, materials } = makeDeps();

        await service.run('test.bitrix24.ru', 'текст', 'cold');

        const requests = (materials.collect.mock.calls[0] as unknown[])[1] as {
            kind: string;
            budgetChars: number;
        }[];
        const playbook = requests.find(
            request => request.kind === 'presentation-playbook',
        );
        expect(playbook?.budgetChars).toBe(1500);
    });
});

/**
 * Проход «методика» (этап 1 плана методики Полянского): на портале с
 * методикой идёт четвёртый вызов по пунктам типа, его ответ раскладывается
 * в dto.methodology, ограничители ядра и методики срезают оценки; без
 * методики — три прохода и синтез, но ограничители ядра всё равно считаются.
 */
describe('CallFocusAnalysisService: методика и ограничители', () => {
    const resolved: ResolvedMethodology = {
        methodology: POLYANSKY_METHODOLOGY,
        scope: 'common',
        source: 'builtin',
        versionTag: 'polyansky@1.0.0',
    };

    it('с методикой: пять вызовов, пункты и спирали в dto, ограничитель методики срезал презентацию', async () => {
        const { service, llm } = makeDeps({
            methodology: resolved,
            responses: {
                call_focus_content: focusResult({
                    sections: [
                        { section: 'NEEDS', relevance: 70, score: 7 },
                        { section: 'PRESENTATION', relevance: 100, score: 9 },
                    ],
                    needsFound: true,
                    needs: ['практика'],
                    presentationDone: true,
                }),
                call_focus_movement: focusResult({
                    sections: [{ section: 'CLOSING', relevance: 90, score: 8 }],
                    nextStep: {
                        set: true,
                        description: 'созвон',
                        date: '2026-11-05',
                        time: '11:00',
                        goal: 'узнать решение',
                        clientAction: 'показать директору',
                        managerAction: 'прислать счёт',
                    },
                    dealProgress: {
                        score: 3,
                        before: 'сомнения',
                        after: 'барьер назван',
                        why: 'есть действие клиента',
                        whyNotHigher: 'решение за директором',
                    },
                }),
                call_focus_synthesis: { summary: 'Итог', score: 8 },
                call_focus_methodology: {
                    checkpoints: [
                        {
                            code: 'pres.needs_confirmed',
                            status: 'done',
                            quote: 'Итак, вам важно…',
                            startSec: 120,
                            endSec: 130,
                        },
                        {
                            code: 'pres.summary_by_needs',
                            status: 'missed',
                            quote: null,
                            startSec: null,
                            endSec: null,
                        },
                    ],
                    spirals: [
                        {
                            need: 'практика',
                            feature: 'поиск',
                            link: 'по вашим делам',
                            benefit: 'час вместо дня',
                            question: null,
                            clientAnswer: null,
                        },
                    ],
                },
            },
        });

        const dto = await service.run(
            'gsr.bitrix24.ru',
            'текст разговора',
            'presentation',
            'ПАСПОРТ',
        );

        expect(dto).not.toBeNull();
        const schemaNames = llm.structuredCompletionWithUsage.mock.calls.map(
            call => String(call[2]),
        );
        expect(schemaNames).toContain('call_focus_methodology');
        expect(schemaNames).toHaveLength(5);
        expect(dto?.methodology).toMatchObject({
            code: 'polyansky',
            version: '1.0.0',
            spiralsFull: 0,
        });
        const byCode = Object.fromEntries(
            (dto?.methodology?.checkpoints ?? []).map(c => [c.code, c.status]),
        );
        expect(byCode['pres.needs_confirmed']).toBe('done');
        expect(byCode['pres.summary_by_needs']).toBe('missed');
        // Один виток без вопроса: обратная связь после блоков пропущена →
        // потолок презентации 7 (ограничитель методики).
        expect(byCode['pres.feedback_per_block']).toBe('missed');
        expect(
            dto?.sections?.find(s => s.section === 'PRESENTATION')?.score,
        ).toBe(7);
        expect(dto?.capsTriggered?.map(c => c.code)).toContain(
            'pres.no_questions_after_blocks',
        );
        expect(dto?.dealProgress).toMatchObject({ score: 3 });
        expect(dto?.usage?.calls).toBe(5);
    });

    it('без методики: четыре вызова, methodology null, ограничитель ядра срезал презентацию без потребностей', async () => {
        const { service, llm } = makeDeps({
            responses: {
                call_focus_content: focusResult({
                    sections: [
                        { section: 'PRESENTATION', relevance: 100, score: 9 },
                    ],
                    needsFound: false,
                    needs: [],
                    presentationDone: true,
                }),
                call_focus_synthesis: { summary: 'Итог', score: 8 },
            },
        });

        const dto = await service.run(
            'test.bitrix24.ru',
            'текст разговора',
            'presentation',
        );

        expect(llm.structuredCompletionWithUsage).toHaveBeenCalledTimes(4);
        expect(dto?.methodology).toBeNull();
        expect(
            dto?.sections?.find(s => s.section === 'PRESENTATION')?.score,
        ).toBe(6);
        expect(dto?.capsTriggered).toEqual([
            expect.objectContaining({
                code: 'core.presentation_without_needs',
                before: 9,
                after: 6,
                applied: true,
            }),
        ]);
    });

    it('методика есть, но тип звонка вне неё — проход не идёт, методика null', async () => {
        const { service, llm } = makeDeps({ methodology: resolved });
        const dto = await service.run(
            'gsr.bitrix24.ru',
            'текст разговора',
            'event_invite',
        );
        expect(llm.structuredCompletionWithUsage).toHaveBeenCalledTimes(4);
        expect(dto?.methodology).toBeNull();
    });

    it('таймаут прохода «методика» причину провала не меняет: решают три фокуса', async () => {
        const { service, llm } = makeDeps({
            methodology: resolved,
            responses: {
                call_focus_form: badAnswer(),
                call_focus_content: badAnswer(),
                call_focus_methodology: providerTimeout(),
            },
        });
        const outcome = await service.runWithOutcome(
            'gsr.bitrix24.ru',
            'текст разговора',
            'presentation',
        );
        const schemaNames = llm.structuredCompletionWithUsage.mock.calls.map(
            call => String(call[2]),
        );
        expect(schemaNames).toContain('call_focus_methodology');
        expect(outcome).toEqual({ analysis: null, providerFailure: false });
    });
});

/**
 * Причина провала для процессора (11.11.2026): проходы оборвались на
 * поставщике модели — цельную страховку не зовут; негодный ответ модели —
 * зовут, как раньше.
 */
describe('CallFocusAnalysisService: причина провала (runWithOutcome)', () => {
    it('собранный разбор — analysis есть, сбоя поставщика нет', async () => {
        const { service } = makeDeps();
        const outcome = await service.runWithOutcome(
            'test.bitrix24.ru',
            'текст',
            'call',
        );
        expect(outcome.analysis).not.toBeNull();
        expect(outcome.providerFailure).toBe(false);
    });

    it('два прохода оборвались по таймауту поставщика — providerFailure, синтез не зовётся', async () => {
        const { service, llm } = makeDeps({
            responses: {
                call_focus_form: providerTimeout(),
                call_focus_content: providerTimeout(),
            },
        });
        const outcome = await service.runWithOutcome(
            'test.bitrix24.ru',
            'текст',
            'call',
        );
        expect(outcome).toEqual({ analysis: null, providerFailure: true });
        expect(llm.structuredCompletionWithUsage).toHaveBeenCalledTimes(3);
    });

    it('модель ответила негодным JSON — причина другая; run отдаёт null, как раньше', async () => {
        const { service } = makeDeps({
            responses: {
                call_focus_form: badAnswer(),
                call_focus_content: badAnswer(),
            },
        });
        await expect(
            service.runWithOutcome('test.bitrix24.ru', 'текст', 'call'),
        ).resolves.toEqual({ analysis: null, providerFailure: false });
        await expect(
            service.run('test.bitrix24.ru', 'текст', 'call'),
        ).resolves.toBeNull();
    });

    it('пустой транскрипт — без вызовов модели и без сбоя поставщика', async () => {
        const { service, llm } = makeDeps();
        await expect(
            service.runWithOutcome('test.bitrix24.ru', '   ', 'call'),
        ).resolves.toEqual({ analysis: null, providerFailure: false });
        expect(llm.structuredCompletionWithUsage).not.toHaveBeenCalled();
    });
});
