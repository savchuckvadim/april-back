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
 */

/** Поля контракта в порядке объявления ДО разреза (единый класс). */
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
    'extra',
];

const REQUIRED = {
    callType: 'presentation',
    summary: 'Итог анализа агента',
    needsFound: true,
    presentationDone: false,
};

describe('AgentCallAnalysisDto (слои наследования)', () => {
    it('Swagger видит все 47 полей в прежнем порядке объявления', () => {
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

    it('вложенные DTO базового слоя валидируются: пустая реплика диалога', async () => {
        const instance = plainToInstance(AgentCallAnalysisDto, {
            ...REQUIRED,
            dialog: [{ role: 'manager', text: '' }],
        });

        const errors = await validate(instance, { whitelist: true });

        expect(errors.map(error => error.property)).toEqual(['dialog']);
    });
});
