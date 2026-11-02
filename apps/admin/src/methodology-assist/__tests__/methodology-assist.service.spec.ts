import { BadRequestException } from '@nestjs/common';
import {
    buildAssistPrompt,
    cleanAssistDraft,
    METHODOLOGY_ASSIST_SCHEMA,
} from '../services/methodology-assist.contract';
import {
    ASSIST_TEXT_LIMIT_CHARS,
    MethodologyAssistService,
} from '../services/methodology-assist.service';

const MODEL_ANSWER = {
    code: 'garant-own',
    title: 'Своя методика',
    types: ['presentation', 'refine'],
    principles: ['Сначала потребности, потом показ.'],
    checkpoints: [
        {
            code: 'pres.needs_first',
            title: 'Выявил потребности до показа',
            types: ['presentation'],
            evidence: 'quote',
            mandatory: true,
            hint: null,
        },
        {
            code: '',
            title: 'Без кода — отбросить',
            types: ['presentation'],
            evidence: 'fact',
            mandatory: false,
            hint: null,
        },
    ],
    caps: [
        {
            code: 'pres.no_needs',
            title: 'показ без потребностей',
            types: ['presentation'],
            when: [
                {
                    op: 'checkpoint_missed',
                    field: null,
                    value: null,
                    checkpoint: 'pres.needs_first',
                },
                {
                    op: 'is',
                    field: 'presentationDone',
                    value: true,
                    checkpoint: null,
                },
            ],
            target: 'PRESENTATION',
            max: 6,
        },
    ],
    spirals: { enabled: false, minFull: 0, types: [] },
};

const makeService = (over?: {
    answer?: unknown;
    error?: Error;
    extracted?: string;
}) => {
    const gateway = {
        structuredCompletionWithUsage: over?.error
            ? jest.fn().mockRejectedValue(over.error)
            : jest.fn().mockResolvedValue({
                  result: over?.answer ?? MODEL_ANSWER,
                  usage: {
                      promptTokens: 1,
                      completionTokens: 1,
                      totalTokens: 2,
                  },
                  model: 'bitrix/bitrixgpt-5.5',
                  provider: 'vibecode',
              }),
    };
    const fileLoader = {
        extractText: jest
            .fn()
            .mockResolvedValue(over?.extracted ?? 'ТЕКСТ ИЗ ФАЙЛА'),
    };
    const service = new MethodologyAssistService(
        gateway as never,
        fileLoader as never,
    );
    return { service, gateway, fileLoader };
};

/**
 * Помощник брифа: текст и/или файл → модель со строгой схемой → очистка
 * ответа → валидатор; усечение длинного текста; ошибки модели — в ответ,
 * не исключением; без документа — 400.
 */
describe('MethodologyAssistService', () => {
    it('текст → черновик, прошедший валидатор: пункт без кода отброшен, null-поля условий убраны, версия 1.0.0', async () => {
        const { service, gateway } = makeService();
        const result = await service.assist({
            text: 'Методика: сначала потребности, потом показ.',
            file: null,
            domain: 'gsr.bitrix24.ru',
            code: null,
            title: null,
        });
        expect(gateway.structuredCompletionWithUsage).toHaveBeenCalledWith(
            expect.stringContaining('КАТАЛОГ ФАКТОВ'),
            expect.stringContaining('ДОКУМЕНТ МЕТОДИКИ'),
            'methodology_brief',
            METHODOLOGY_ASSIST_SCHEMA,
            'gsr.bitrix24.ru',
        );
        expect(result.errors).toEqual([]);
        expect(result.draft).toMatchObject({
            code: 'garant-own',
            version: '1.0.0',
            spirals: { enabled: false, minFull: 0, types: [] },
        });
        expect(result.draft?.checkpoints).toHaveLength(1);
        expect(result.draft?.checkpoints[0]).not.toHaveProperty('hint');
        expect(result.draft?.caps[0].when).toEqual([
            { op: 'checkpoint_missed', checkpoint: 'pres.needs_first' },
            { op: 'is', field: 'presentationDone', value: true },
        ]);
        expect(result.warnings).toEqual([
            'Пункт без кода или формулировки отброшен',
        ]);
        expect(result).toMatchObject({
            provider: 'vibecode',
            model: 'bitrix/bitrixgpt-5.5',
        });
    });

    it('подсказанные код и название перекрывают ответ модели; файл извлекается и склеивается с текстом', async () => {
        const { service, fileLoader, gateway } = makeService();
        const result = await service.assist({
            text: 'дополнение',
            file: { buffer: Buffer.from('x'), originalName: 'method.docx' },
            domain: null,
            code: 'garant-voronezh',
            title: 'Воронеж',
        });
        expect(fileLoader.extractText).toHaveBeenCalledWith(
            expect.stringMatching(/\.docx$/),
        );
        const calls = gateway.structuredCompletionWithUsage.mock
            .calls as unknown as [string, string, string, unknown, string][];
        const userContent = calls[0][1];
        expect(userContent).toContain('ТЕКСТ ИЗ ФАЙЛА');
        expect(userContent).toContain('дополнение');
        expect(result.draft).toMatchObject({
            code: 'garant-voronezh',
            title: 'Воронеж',
        });
        expect(calls[0][4]).toBe('admin.april-app.ru');
    });

    it('длинный текст усекается с предупреждением; невалидный ответ модели — ошибки валидатора, draft null', async () => {
        const { service } = makeService({
            answer: { code: 'x', title: '', checkpoints: 'нет' },
        });
        const result = await service.assist({
            text: 'а'.repeat(ASSIST_TEXT_LIMIT_CHARS + 100),
            file: null,
            domain: null,
            code: null,
            title: null,
        });
        expect(result.textChars).toBe(ASSIST_TEXT_LIMIT_CHARS);
        expect(result.warnings[0]).toContain('усечён');
        expect(result.draft).toBeNull();
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('модель не ответила — ошибка в ответе, не исключение; без документа — 400; неподдерживаемый файл — 400', async () => {
        const down = makeService({
            error: new Error('LLM недоступна: vibecode — нет ключа'),
        });
        const result = await down.service.assist({
            text: 'документ',
            file: null,
            domain: null,
            code: null,
            title: null,
        });
        expect(result.draft).toBeNull();
        expect(result.errors[0]).toContain('Модель не ответила');

        const { service } = makeService();
        await expect(
            service.assist({
                text: '  ',
                file: null,
                domain: null,
                code: null,
                title: null,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.assist({
                text: null,
                file: { buffer: Buffer.from('x'), originalName: 'slides.pptx' },
                domain: null,
                code: null,
                title: null,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('methodology-assist.contract', () => {
    it('промпт содержит каталоги фактов и операций и подсказки по именованию', () => {
        const prompt = buildAssistPrompt({ code: null, title: null });
        expect(prompt).toContain('needsFound — Потребности выявлены');
        expect(prompt).toContain('checkpoint_missed — пункт пропущен');
        expect(prompt).toContain('Код методики придумай сам');
        expect(buildAssistPrompt({ code: 'g-1', title: 'Г' })).toContain(
            'Код методики: g-1.',
        );
    });

    it('cleanAssistDraft: не объект — null с предупреждением; пустой список пунктов — предупреждение', () => {
        expect(cleanAssistDraft('text', { code: null, title: null })).toEqual({
            draft: null,
            warnings: ['Модель вернула не объект'],
        });
        const cleaned = cleanAssistDraft(
            {
                code: 'a-b',
                title: 'А',
                types: ['cold'],
                principles: [],
                checkpoints: [],
                caps: [],
                spirals: { enabled: false, minFull: 0, types: [] },
            },
            { code: null, title: null },
        );
        expect(cleaned.warnings).toEqual([
            'Модель не нашла в документе проверяемых пунктов',
        ]);
        expect(cleaned.draft).toMatchObject({ code: 'a-b', version: '1.0.0' });
    });
});
