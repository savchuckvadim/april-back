import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
    DEFERRED_STEPS_MAX,
    EnumDeferredFlowStepKind,
    EnumDeferredSideFlow,
    EventReportDeferredRequestDto,
} from '../dto/event-report-deferred.dto';
import {
    collectDeferredBatchErrors,
    countBatchCommands,
    describeFailure,
    mapFailuresToSteps,
    resolveStepKindsForCmd,
} from '../services/deferred-batch-outcome.util';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';

/**
 * Контракт ручки досылки: что она принимает и как читает ответ батча.
 *
 * Опции трансформации/валидации — те же, что у глобального `ValidationPipe`
 * приложения (`bootstrap-app`): `whitelist: true` + `enableImplicitConversion`.
 * Иначе тест проверял бы не то, что происходит в бою.
 */
const VALIDATION_OPTIONS = { whitelist: true } as const;
const TRANSFORM_OPTIONS = {
    enableImplicitConversion: true,
} as const;

const parse = (raw: Record<string, unknown>) =>
    plainToInstance(EventReportDeferredRequestDto, raw, TRANSFORM_OPTIONS);

const errorsOf = (raw: Record<string, unknown>) =>
    validateSync(parse(raw), VALIDATION_OPTIONS);

const validBody = (
    steps: Array<Record<string, unknown>>,
): Record<string, unknown> => ({
    domain: 'portal.bitrix24.ru',
    operationId: 'op-1',
    steps,
    payload: { domain: 'portal.bitrix24.ru', operationId: 'op-1' },
});

describe('EventReportDeferredRequestDto — валидация запроса досылки', () => {
    it('минимальный валидный запрос принимается', () => {
        expect(
            errorsOf(validBody([{ kind: EnumDeferredFlowStepKind.kpi }])),
        ).toEqual([]);
    });

    it('пустой список шагов отвергается: досылать нечего', () => {
        const errors = errorsOf(validBody([]));

        expect(errors.map(error => error.property)).toContain('steps');
    });

    it('неизвестный вид шага отвергается — ядро через эту ручку не исполнить', () => {
        const errors = errorsOf(validBody([{ kind: 'entity-flow' }]));

        expect(errors).toHaveLength(1);
        expect(JSON.stringify(errors)).toContain('kind');
    });

    it('чужой поток side-flow отвергается', () => {
        const errors = errorsOf(
            validBody([
                {
                    kind: EnumDeferredFlowStepKind.sideFlow,
                    flow: 'unknown-smart',
                },
            ]),
        );

        expect(JSON.stringify(errors)).toContain('flow');
    });

    it('чужие поля шага отбрасываются whitelist-ом, а не ломают запрос', () => {
        const raw = validBody([
            {
                kind: EnumDeferredFlowStepKind.sideFlow,
                flow: EnumDeferredSideFlow.pres,
                addedTaskId: 777,
                // Попытка протащить исполнение мимо контракта.
                cmd: 'crm.deal.delete',
                fields: { ID: 1 },
            },
        ]);

        const dto = parse(raw);
        expect(validateSync(dto, VALIDATION_OPTIONS)).toEqual([]);
        // Ключи шага — только объявленные контрактом: `cmd`/`fields` срезал
        // whitelist, исполнить произвольную команду через ручку нельзя.
        expect(Object.keys(dto.steps[0]).sort()).toEqual([
            'addedTaskId',
            'createdPresDealId',
            'flow',
            'kind',
        ]);
    });

    it('шагов больше разумного предела — отказ', () => {
        const steps = Array.from({ length: DEFERRED_STEPS_MAX + 1 }, () => ({
            kind: EnumDeferredFlowStepKind.kpi,
        }));

        expect(errorsOf(validBody(steps)).map(e => e.property)).toContain(
            'steps',
        );
    });

    it('запрос без payload отвергается: пересобирать шаги не из чего', () => {
        const raw = validBody([{ kind: EnumDeferredFlowStepKind.kpi }]);
        delete raw.payload;

        expect(errorsOf(raw).map(error => error.property)).toContain('payload');
    });
});

describe('Разбор ответа батча досылки', () => {
    const chunk = (
        result: Record<string, unknown>,
        resultError: Record<string, unknown> | [] = [],
    ): IBitrixBatchResponseResult =>
        ({
            result,
            result_error: resultError,
            result_total: [],
            result_next: [],
        }) as unknown as IBitrixBatchResponseResult;

    it('пустой result_error — массив: ошибок нет', () => {
        expect(
            collectDeferredBatchErrors([chunk({ update_xo_deal_1: true })]),
        ).toEqual([]);
    });

    it('ошибки собираются из ОБОИХ источников склейки', () => {
        const failures = collectDeferredBatchErrors([
            chunk({}, { add_list_item_kpi_1: { error: 'ERROR_CORE' } }),
            chunk({}, { update_xo_deal_1: { error: 'ACCESS_DENIED' } }),
        ]);

        expect(failures.map(failure => failure.cmd)).toEqual([
            'add_list_item_kpi_1',
            'update_xo_deal_1',
        ]);
    });

    it('команды раскладываются по шагам, которым принадлежат', () => {
        expect(resolveStepKindsForCmd('add_list_item_kpi_1')).toEqual(['kpi']);
        expect(resolveStepKindsForCmd('set_pres_deal')).toEqual(['pres-deals']);
        expect(resolveStepKindsForCmd('update_xo_deal_9')).toEqual([
            'xo-deals',
        ]);
        // База/ТМЦ/счётчик переносов принадлежат ПАРЕ шагов: композит
        // связан $result-чейнингом и по воронкам не раскраивается.
        expect(resolveStepKindsForCmd('set_base_deal')).toEqual([
            'pres-deals',
            'xo-deals',
        ]);
        expect(resolveStepKindsForCmd('close_tmc_5')).toEqual([
            'pres-deals',
            'xo-deals',
        ]);
        // Команды ядра ничьи: их досылка не ставит и судить по ним нечего.
        expect(resolveStepKindsForCmd('add_task')).toEqual([]);
        expect(resolveStepKindsForCmd('update_company_1')).toEqual([]);
    });

    it('шаг получает ПЕРВУЮ свою ошибку, чужие его не касаются', () => {
        const byStep = mapFailuresToSteps([
            { cmd: 'add_task', error: { error: 'X', error_description: '' } },
            {
                cmd: 'update_xo_deal_1',
                error: { error: 'ACCESS_DENIED', error_description: 'denied' },
            },
            {
                cmd: 'update_xo_deal_2',
                error: { error: 'OTHER', error_description: '' },
            },
        ]);

        expect([...byStep.keys()]).toEqual(['xo-deals']);
        expect(describeFailure(byStep.get('xo-deals')!)).toBe(
            'update_xo_deal_1: ACCESS_DENIED — denied',
        );
    });

    it('число команд считается по склеенному ответу', () => {
        expect(
            countBatchCommands([chunk({ a: 1, b: 2 }), chunk({ c: 3 })]),
        ).toBe(3);
    });
});
