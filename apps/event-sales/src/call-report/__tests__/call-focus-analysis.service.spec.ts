import { CALL_REPORT_SECTION_CODES } from '@lib/call-lib';
import { FOCUS_SECTION_CODES } from '../contracts/call-focus-analysis.contract';
import { CallFocusAnalysisService } from '../services/call-focus-analysis.service';

const focusResult = (overrides?: Record<string, unknown>) => ({
    sections: [],
    ...overrides,
});

const makeDeps = (options?: {
    /** schemaName → ответ (или Error для падения прохода). */
    responses?: Record<string, Record<string, unknown> | Error>;
}) => {
    const responses = options?.responses ?? {};
    const vibeCodeClient = {
        structuredCompletion: jest.fn(
            (
                _system: string,
                _user: string,
                schemaName: string,
            ): Promise<unknown> => {
                const answer = responses[schemaName];
                if (answer instanceof Error) return Promise.reject(answer);
                return Promise.resolve(answer ?? focusResult());
            },
        ),
    };
    const vibeKeyResolver = { resolve: jest.fn().mockResolvedValue('key') };
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
    const service = new CallFocusAnalysisService(
        vibeCodeClient as never,
        vibeKeyResolver as never,
        materials as never,
        callTypeRegistry as never,
        appSettings as never,
        reportSettings as never,
    );
    return {
        service,
        vibeCodeClient,
        appSettings,
        reportSettings,
        materials,
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
        const { service, vibeCodeClient } = makeDeps({
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
        expect(dto?.priceDiscussed).toBe(false);
        // Все четыре вызова получили паспорт в user-контенте.
        for (const call of vibeCodeClient.structuredCompletion.mock.calls) {
            expect(String(call[1])).toContain('ПАСПОРТ');
        }
    });

    it('один упавший фокус не роняет разбор; его разделы отсутствуют', async () => {
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
    });

    it('материалы по ролям: скрипт во всех проходах, возражения — в «содержании», регламент — в «движении», эталоны — в синтезе', async () => {
        const { service, vibeCodeClient, materials } = makeDeps();
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

        const prompts = vibeCodeClient.structuredCompletion.mock.calls.map(
            call => String((call as unknown[])[0]),
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
        const { service, vibeCodeClient, materials } = makeDeps();
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

        const prompts = vibeCodeClient.structuredCompletion.mock.calls.map(
            call => String((call as unknown[])[0]),
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
