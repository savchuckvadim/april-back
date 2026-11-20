import { AGENT_ANALYSIS_TYPE } from '@lib/call-lib';
import {
    DEAL_MOVEMENT_TODO_PROMPT,
    DEAL_MOVEMENT_TODO_SCHEMA,
    DEAL_MOVEMENT_TODO_SCHEMA_NAME,
    type DealMovementVerdict,
} from '@lib/sales-ai-analytics';
import { ETimeZone } from '@lib/shared/lib/date';
import {
    DEAL_MOVEMENT_TODO_SUMMARY_MAX,
    toDealMovementTodoInput,
} from '../lib/deal-movement-todo-input';
import { DealMovementTodoService } from '../services/deal-movement-todo.service';
import type { DealMovementCallPointers } from '../types/deal-movement.types';

const DOMAIN = 'garant.bitrix24.ru';

const verdict: DealMovementVerdict = {
    dealId: '9041',
    status: 'at_risk',
    reasons: ['step_overdue'],
    facts: {
        daysInStage: 12,
        stageLimitDays: 21,
        stageLimitSource: 'default',
        idleDays: null,
        idleLookbackDays: 60,
        recentWork: null,
        stepDate: '2026-11-05',
        lastProgress: 3,
        daysSinceAgreed: null,
    },
};

const pointers: DealMovementCallPointers = {
    // 22:30 UTC 03.11 — уже 04.11 по Москве.
    lastCall: { id: 't9', at: '2026-11-03T22:30:00.000Z' },
    lastAgreement: { id: 't4', date: '2026-11-05' },
};

const analysis = {
    t9: {
        summary: 'Обсудили тариф на 45 000 ₽.',
        dealProgress: { score: 3, after: 'Ждём решения директора.' },
    },
    t4: { nextStep: { set: true, description: 'Покажет демо директору' } },
};

describe('вход модели «что сделать»', () => {
    it('договорённость и последний звонок из разборов, день звонка по поясу портала', () => {
        expect(
            toDealMovementTodoInput({
                verdict,
                pointers,
                lastCallAnalysis: analysis.t9,
                agreementAnalysis: analysis.t4,
                timezone: ETimeZone.EUROPE_MOSCOW,
            }),
        ).toEqual({
            status: 'at_risk',
            reasons: ['договорились на 05.11 — контакта после этого не было'],
            daysInStage: 12,
            agreement: { date: '05.11', text: 'Покажет демо директору' },
            lastCall: {
                date: '04.11',
                summary: 'Обсудили тариф на 45 000 ₽.',
                after: 'Ждём решения директора.',
            },
        });
    });

    it('звонков нет — без договорённости и звонка; длинное резюме обрезается', () => {
        expect(
            toDealMovementTodoInput({
                verdict,
                pointers: null,
                lastCallAnalysis: null,
                agreementAnalysis: null,
                timezone: ETimeZone.EUROPE_MOSCOW,
            }),
        ).toMatchObject({ agreement: null, lastCall: null });
        const long = toDealMovementTodoInput({
            verdict,
            pointers,
            lastCallAnalysis: { summary: 'а'.repeat(2000), dealProgress: 'x' },
            agreementAnalysis: { nextStep: 'чужая форма' },
            timezone: ETimeZone.EUROPE_MOSCOW,
        });
        expect(long.lastCall?.summary).toHaveLength(
            DEAL_MOVEMENT_TODO_SUMMARY_MAX + 1,
        );
        expect(long.lastCall?.after).toBeNull();
        expect(long.agreement?.text).toBeNull();
    });
});

const build = (llm: { result?: unknown; error?: Error } = {}) => {
    const aiService = {
        findByDomainTypeKeys: jest.fn(
            (_d: string, _t: string, keys: { transcriptionIds: string[] }) =>
                Promise.resolve(
                    keys.transcriptionIds.map(id => ({
                        id: `a${id}`,
                        type: AGENT_ANALYSIS_TYPE,
                        status: 'done',
                        transcription_id: id,
                        user_result: analysis[id as keyof typeof analysis],
                    })),
                ),
        ),
    };
    const gateway = {
        structuredCompletionWithUsage: llm.error
            ? jest.fn().mockRejectedValue(llm.error)
            : jest.fn().mockResolvedValue({
                  result: llm.result ?? {
                      actions: [
                          'Позвонить директору до 05.11 и показать демо',
                          'Отправить предложение на 45 000 ₽',
                          'Отправить КП в WhatsApp',
                      ],
                  },
                  usage: null,
                  model: 'm',
                  provider: 'vibecode',
              }),
    };
    const aiSettings = {
        getByDomain: jest
            .fn()
            .mockResolvedValue({ deepAnalysisModel: 'bitrixgpt-5' }),
    };
    const service = new DealMovementTodoService(
        gateway as never,
        aiService as never,
        aiSettings as never,
    );
    return { service, gateway, aiService };
};

const request = {
    domain: DOMAIN,
    model: 'bitrixgpt-5',
    timezone: ETimeZone.EUROPE_MOSCOW,
    verdict,
    pointers,
};

describe('«что сделать» моделью портала', () => {
    it('разборы двух звонков одним запросом, строгая схема, модель портала, строки после проверки', async () => {
        const { service, gateway, aiService } = build();

        const outcome = await service.actionsFor(request);

        expect(aiService.findByDomainTypeKeys).toHaveBeenCalledTimes(1);
        expect(aiService.findByDomainTypeKeys).toHaveBeenCalledWith(
            DOMAIN,
            AGENT_ANALYSIS_TYPE,
            { transcriptionIds: ['t9', 't4'] },
        );
        const call = gateway.structuredCompletionWithUsage.mock
            .calls[0] as unknown[];
        expect(call[0]).toBe(DEAL_MOVEMENT_TODO_PROMPT);
        expect(call[1]).toContain('Резюме звонка: Обсудили тариф');
        expect(call[2]).toBe(DEAL_MOVEMENT_TODO_SCHEMA_NAME);
        expect(call[3]).toBe(DEAL_MOVEMENT_TODO_SCHEMA);
        expect(call[4]).toBe(DOMAIN);
        expect(call[5]).toEqual({ model: 'bitrixgpt-5' });
        // Строка с латиницей выброшена, две годные остались.
        expect(outcome).toEqual({
            actions: [
                'Позвонить директору до 05.11 и показать демо',
                'Отправить предложение на 45 000 ₽',
            ],
            failed: false,
            error: null,
        });
    });

    it('сбой модели — без блока, ошибка словами; ответ не той формы — без блока', async () => {
        const failed = build({ error: new Error('VibeCode 503') });
        expect(await failed.service.actionsFor(request)).toEqual({
            actions: null,
            failed: true,
            error: 'VibeCode 503',
        });
        const wrong = build({ result: { items: [] } });
        expect(await wrong.service.actionsFor(request)).toMatchObject({
            actions: null,
            failed: true,
            error: null,
        });
    });

    it('без модели портала — модель шлюза; без звонков — БД не читаем', async () => {
        const { service, gateway, aiService } = build();

        await service.actionsFor({ ...request, model: null, pointers: null });

        expect(aiService.findByDomainTypeKeys).not.toHaveBeenCalled();
        const call = gateway.structuredCompletionWithUsage.mock
            .calls[0] as unknown[];
        expect(call[5]).toBeUndefined();
        expect(await service.modelOf(DOMAIN)).toBe('bitrixgpt-5');
    });
});
