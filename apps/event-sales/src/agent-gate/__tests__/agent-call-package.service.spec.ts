import { AgentCallPackageService } from '../services/agent-call-package.service';

const row = (id: string): Record<string, unknown> => ({
    id,
    dedupKey: `test.bitrix24.ru:${id}`,
    domain: 'test.bitrix24.ru',
    activityId: `10${id}`,
    callId: null,
    callStartedAt: null,
    provider: 'yandex',
    status: 'done',
    text: 'текст звонка',
    durationSec: '700',
    entityType: 'deal',
    entityId: '555',
    userId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
});

const makeDeps = (options: {
    rows: ReturnType<typeof row>[];
    agentAnalyzedIds?: string[];
    classifyRecords?: Record<string, unknown>[];
}) => {
    const store = {
        findDonePipeline: jest.fn().mockResolvedValue(options.rows),
        findPipelineById: jest.fn().mockResolvedValue(options.rows[0]),
    };
    const aiService = {
        findByTranscriptionIds: jest.fn().mockResolvedValue([
            ...(options.agentAnalyzedIds ?? []).map(id => ({
                type: 'agent-analysis',
                transcription_id: id,
            })),
            ...(options.classifyRecords ?? []),
        ]),
    };
    // Bitrix-контекст собирает отдельный сервис (свой спек не требуется —
    // логика перенесена как есть); здесь всегда пустой контекст.
    const emptyContext = {
        deal: null,
        company: null,
        contact: null,
        historyCandidates: [],
        kpiCandidates: [],
        dealCandidates: { salesBase: [], salesPresentation: [], salesXo: [] },
        companyFields: [],
    };
    const bitrixContext = {
        load: jest.fn().mockResolvedValue(emptyContext),
        empty: jest.fn().mockReturnValue(emptyContext),
    };
    // Реестр типов: встроенные коды с профилями (как builtin()).
    const registry = {
        codes: ['cold', 'presentation', 'other'],
        types: {
            cold: {
                code: 'cold',
                title: 'Холодный',
                focus: 'Выход на ЛПР',
                sectionRelevance: { GREETING: 100, PRICE: 10 },
                talkRatioNorm: { min: 30, max: 55 },
                questionsNorm: { min: 3, max: 8 },
                knowledgeKind: 'call-analysis-cold',
            },
            presentation: {
                code: 'presentation',
                title: 'Презентация',
                focus: '',
                sectionRelevance: { PRESENTATION: 100 },
                talkRatioNorm: null,
                questionsNorm: null,
                knowledgeKind: 'call-analysis-presentation',
            },
            other: {
                code: 'other',
                title: 'Другое',
                focus: '',
                sectionRelevance: {},
                talkRatioNorm: null,
                questionsNorm: null,
                knowledgeKind: 'call-analysis-other',
            },
        },
        source: 'builtin',
    };
    const callTypeRegistry = {
        resolve: jest.fn().mockResolvedValue(registry),
        builtin: jest.fn().mockReturnValue(registry),
    };
    const service = new AgentCallPackageService(
        store as never,
        aiService as never,
        bitrixContext as never,
        callTypeRegistry as never,
    );
    return { service, store };
};

describe('AgentCallPackageService', () => {
    it('listPending отдаёт только звонки без анализа агента', async () => {
        const { service } = makeDeps({
            rows: [row('1'), row('2'), row('3')],
            agentAnalyzedIds: ['2'],
        });
        const pending = await service.listPending(undefined, 20);
        expect(pending.map(call => call.transcriptionId)).toEqual(['1', '3']);
        expect(pending[0].hasAgentAnalysis).toBe(false);
    });

    it('listPending уважает limit', async () => {
        const { service } = makeDeps({
            rows: [row('1'), row('2'), row('3')],
        });
        const pending = await service.listPending(undefined, 2);
        expect(pending).toHaveLength(2);
    });

    it('изоляция порталов: чужой домен в listPendingScoped — 403, чужой пакет — 404', async () => {
        const { service } = makeDeps({ rows: [row('1')] });
        await expect(
            service.listPendingScoped('other.bitrix24.ru', 20, [
                'gsr.bitrix24.ru',
            ]),
        ).rejects.toThrow('Домен вне разрешённых');

        await expect(
            service.getPackage('1', ['gsr.bitrix24.ru']),
        ).rejects.toThrow('не найдена');
    });

    it('изоляция порталов: свой домен проходит', async () => {
        const { service } = makeDeps({ rows: [row('1')] });
        const pending = await service.listPendingScoped(
            'test.bitrix24.ru',
            20,
            ['test.bitrix24.ru'],
        );
        expect(pending).toHaveLength(1);
        const pkg = await service.getPackage('1', ['test.bitrix24.ru']);
        expect(pkg.call.transcriptionId).toBe('1');
    });

    it('getPackage отклоняет транскрипции не из автоконвейера', async () => {
        const manualRow = { ...row('9'), dedupKey: null };
        const { service, store } = makeDeps({ rows: [manualRow] });
        store.findPipelineById.mockResolvedValue(manualRow);
        await expect(service.getPackage('9')).rejects.toThrow(
            'не из автоконвейера',
        );
    });

    it('getPackage собирает транскрипт и AI-результаты', async () => {
        const { service } = makeDeps({ rows: [row('1')] });
        const pkg = await service.getPackage('1');
        expect(pkg.transcript).toBe('текст звонка');
        expect(pkg.call.transcriptionId).toBe('1');
        expect(pkg.historyCandidates).toEqual([]);
        // Без классификации: профиль типа пуст, но карта профилей есть всегда.
        expect(pkg.classification).toBeNull();
        expect(pkg.typeProfile).toBeNull();
        expect(Object.keys(pkg.typeProfiles)).toEqual(
            expect.arrayContaining(['cold', 'presentation', 'other']),
        );
    });

    it('getPackage включает классификацию и профиль типа звонка', async () => {
        const { service } = makeDeps({
            rows: [row('1')],
            classifyRecords: [
                {
                    type: 'call-classify',
                    transcription_id: '1',
                    result: 'cold',
                    user_result: {
                        callType: 'cold',
                        interlocutorRole: 'secretary',
                        confidence: 0.9,
                        reason: 'Проход секретаря',
                    },
                },
            ],
        });
        const pkg = await service.getPackage('1');
        expect(pkg.call.callType).toBe('cold');
        expect(pkg.classification).toEqual(
            expect.objectContaining({ callType: 'cold', confidence: 0.9 }),
        );
        expect(pkg.typeProfile?.knowledgeKind).toBe('call-analysis-cold');
        expect(pkg.typeProfile?.sectionRelevance.PRICE).toBeLessThan(
            pkg.typeProfile?.sectionRelevance.GREETING ?? 0,
        );
    });

    it('listPending сортирует по (domain, callType), неклассифицированные в конце', async () => {
        const { service } = makeDeps({
            rows: [row('1'), row('2'), row('3')],
            classifyRecords: [
                {
                    type: 'call-classify',
                    transcription_id: '1',
                    result: 'presentation',
                },
                {
                    type: 'call-classify',
                    transcription_id: '3',
                    result: 'cold',
                },
            ],
        });
        const pending = await service.listPending(undefined, 20);
        expect(
            pending.map(call => [call.transcriptionId, call.callType ?? null]),
        ).toEqual([
            ['3', 'cold'],
            ['1', 'presentation'],
            ['2', null],
        ]);
    });
});
