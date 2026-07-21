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
}) => {
    const store = {
        findDonePipeline: jest.fn().mockResolvedValue(options.rows),
        findPipelineById: jest.fn().mockResolvedValue(options.rows[0]),
    };
    const aiService = {
        findByTranscriptionIds: jest.fn().mockResolvedValue(
            (options.agentAnalyzedIds ?? []).map(id => ({
                type: 'agent-analysis',
                transcription_id: id,
            })),
        ),
    };
    const pbxService = {
        init: jest.fn().mockResolvedValue({
            bitrix: {
                api: { call: jest.fn().mockResolvedValue({ result: null }) },
                listItem: { get: jest.fn().mockResolvedValue({ result: [] }) },
            },
            portal: { lists: [], bitrixLists: [] },
        }),
    };
    const service = new AgentCallPackageService(
        store as never,
        aiService as never,
        pbxService as never,
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
    });
});
