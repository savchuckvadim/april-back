import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import {
    AgentCallAnalysisDto,
    AgentRelatedDealsDto,
} from '../dto/agent-analysis-request.dto';

/**
 * Контракт push-back после разреза AgentCallAnalysisDto на слои
 * наследования (лимит файла, 18.09.2026): набор и порядок полей, Swagger-
 * метаданные и правила class-validator обязаны остаться прежними.
 * 20.10.2026 добавлены riskEvidence (доказательства риск-флагов, сразу
 * после riskFlags) и usage (расход модели, перед extra).
 */

/** Поля контракта в порядке объявления. */
const EXPECTED_FIELDS = [
    'callType',
    'callTypeRefined',
    'callTypeReason',
    'productive',
    'interlocutorRole',
    'specialist',
    'sentiment',
    'nextStep',
    'dialog',
    'priceDiscussed',
    'competitors',
    'objectionCategories',
    'riskFlags',
    'riskEvidence',
    'refusalCategory',
    'refusalReason',
    'talkRatioPct',
    'questionsCount',
    'summary',
    'needsFound',
    'needs',
    'presentationDone',
    'hvostDone',
    'hvostAnalysis',
    'hvostSteps',
    'fiveKDone',
    'fiveKAnalysis',
    'fiveKItems',
    'reportComparison',
    'productsOffered',
    'objections',
    'sections',
    'speechAnalysis',
    'recommendations',
    'score',
    'weightedScore',
    'scriptCompliance',
    'coachingPriority',
    'scoreExplanation',
    'employeeRecommendations',
    'relatedDeals',
    'kpiItem',
    'historyItem',
    'relatedReportIds',
    'agentVersion',
    'versions',
    'flow',
    'usage',
    'extra',
];

const REQUIRED = {
    callType: 'presentation',
    summary: 'Итог анализа агента',
    needsFound: true,
    presentationDone: false,
};

describe('AgentCallAnalysisDto (слои наследования)', () => {
    it('Swagger видит все 49 полей в порядке объявления', () => {
        const keys = (
            Reflect.getMetadata(
                DECORATORS.API_MODEL_PROPERTIES_ARRAY,
                AgentCallAnalysisDto.prototype,
            ) as string[]
        ).map(key => key.slice(1));

        expect(keys).toEqual(EXPECTED_FIELDS);
    });

    it('валидация с whitelist сохраняет поля базовых слоёв и режет неизвестные', async () => {
        const instance = plainToInstance(AgentCallAnalysisDto, {
            ...REQUIRED,
            talkRatioPct: 52,
            score: 7,
            relatedDeals: { mainDealId: 12345 },
            unknownKey: 'x',
        });

        const errors = await validate(instance, { whitelist: true });

        expect(errors).toEqual([]);
        expect(instance).toMatchObject({
            ...REQUIRED,
            talkRatioPct: 52,
            score: 7,
        });
        expect(instance.relatedDeals).toBeInstanceOf(AgentRelatedDealsDto);
        expect(
            (instance as unknown as Record<string, unknown>).unknownKey,
        ).toBeUndefined();
    });

    it('правила базовых слоёв действуют на итоговом классе (слаг типа, диапазон оценки)', async () => {
        const instance = plainToInstance(AgentCallAnalysisDto, {
            ...REQUIRED,
            callType: 'Bad Type',
            score: 11,
        });

        const errors = await validate(instance, { whitelist: true });

        expect(errors.map(error => error.property).sort()).toEqual([
            'callType',
            'score',
        ]);
    });

    it('доказательство риск-флага валидируется: чужой код флага, пустая цитата, чужой speaker', async () => {
        const instance = plainToInstance(AgentCallAnalysisDto, {
            ...REQUIRED,
            riskFlags: ['conflict'],
            riskEvidence: [
                {
                    flag: 'conflict',
                    quote: 'Вы меня не слушаете',
                    speaker: 'manager',
                },
                { flag: 'weird', quote: 'x', speaker: 'client' },
                { flag: 'promise', quote: '', speaker: 'manager' },
                { flag: 'promise', quote: 'y', speaker: 'robot' },
            ],
        });

        const errors = await validate(instance, { whitelist: true });

        expect(errors.map(error => error.property)).toEqual(['riskEvidence']);
        const nested = errors[0].children?.map(child => child.property) ?? [];
        expect(nested).toEqual(['1', '2', '3']);
    });

    it('расход модели принимается с null-разбивкой и отвергает отрицательные токены', async () => {
        const ok = plainToInstance(AgentCallAnalysisDto, {
            ...REQUIRED,
            usage: {
                tokens: 100,
                promptTokens: null,
                completionTokens: null,
                calls: 4,
                callsWithUsage: 0,
                model: null,
            },
        });
        expect(await validate(ok, { whitelist: true })).toEqual([]);

        const bad = plainToInstance(AgentCallAnalysisDto, {
            ...REQUIRED,
            usage: { tokens: -1, calls: 1, callsWithUsage: 1, model: null },
        });
        const errors = await validate(bad, { whitelist: true });
        expect(errors.map(error => error.property)).toEqual(['usage']);
    });

    it('вложенные DTO базового слоя валидируются: пустая реплика диалога', async () => {
        const instance = plainToInstance(AgentCallAnalysisDto, {
            ...REQUIRED,
            dialog: [{ role: 'manager', text: '' }],
        });

        const errors = await validate(instance, { whitelist: true });

        expect(errors.map(error => error.property)).toEqual(['dialog']);
    });
});
