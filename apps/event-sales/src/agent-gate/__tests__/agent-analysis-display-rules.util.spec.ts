import { Logger } from '@nestjs/common';
import { buildCallReportSmartFields } from '@lib/call-lib/call-report/services/call-report-smart-fields.builder';
import { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import { prepareAgentAnalysis } from '../services/agent-analysis-prepare.util';
import {
    applyChecklistRule,
    applyScriptComplianceRule,
} from '../services/agent-analysis-display-rules.util';
import { buildAgentSmartItemInput } from '../services/agent-analysis-smart-input.mapper';
import { renderMethodologyComments } from '../services/agent-analysis-text-render.util';

const log = jest.fn<void, [string]>();
const warn = jest.fn<void, [string]>();
const logger = { log, warn } as unknown as Logger;

const dtoOf = (
    overrides: Partial<AgentCallAnalysisDto> = {},
): AgentCallAnalysisDto =>
    ({
        callType: 'presentation',
        summary: 'Итог разговора',
        ...overrides,
    }) as AgentCallAnalysisDto;

describe('правила показа при записи разбора: соответствие скрипту', () => {
    beforeEach(() => jest.clearAllMocks());

    it('скрипта в разборе не было — процент модели обнуляется, признак false', () => {
        const fixed = applyScriptComplianceRule(
            '1',
            dtoOf({ scriptCompliance: 40, scriptIncluded: false }),
            logger,
        );
        expect(fixed.scriptCompliance).toBeNull();
        expect(fixed.scriptIncluded).toBe(false);
        expect(log).toHaveBeenCalledWith(
            expect.stringContaining('Соответствие скрипту 40% снято'),
        );
    });

    it('скрипт был — процент сохраняется', () => {
        const fixed = applyScriptComplianceRule(
            '1',
            dtoOf({ scriptCompliance: 80, scriptIncluded: true }),
            logger,
        );
        expect(fixed.scriptCompliance).toBe(80);
        expect(fixed.scriptIncluded).toBe(true);
        expect(log).not.toHaveBeenCalled();
    });

    it('признака нет (внешний агент, старый разбор при перезаписи) — процент не сохраняется', () => {
        const fixed = applyScriptComplianceRule(
            '1',
            dtoOf({ scriptCompliance: 55 }),
            logger,
        );
        expect(fixed.scriptCompliance).toBeNull();
        expect(fixed.scriptIncluded).toBe(false);
    });

    it('исходный разбор не мутируется', () => {
        const source = dtoOf({ scriptCompliance: 40 });
        applyScriptComplianceRule('1', source, logger);
        expect(source.scriptCompliance).toBe(40);
        expect(source.scriptIncluded).toBeUndefined();
    });

    it('общая подготовка разбора (приём, переразбор, догон) применяет правило', () => {
        const withoutScript = prepareAgentAnalysis(
            '1',
            'call-report-analyzer',
            dtoOf({ scriptCompliance: 40, scriptIncluded: false }),
            null,
            logger,
        );
        expect(withoutScript.scriptCompliance).toBeNull();
        expect(withoutScript.scriptIncluded).toBe(false);

        const withScript = prepareAgentAnalysis(
            '1',
            'call-report-analyzer',
            dtoOf({ scriptCompliance: 90, scriptIncluded: true }),
            null,
            logger,
        );
        expect(withScript.scriptCompliance).toBe(90);
        expect(withScript.scriptIncluded).toBe(true);
    });
});

/** Разбор с заполненными чек-листами «Хвост» и 5К. */
const withChecklists = (callType: string): AgentCallAnalysisDto =>
    dtoOf({
        callType,
        hvostDone: true,
        hvostAnalysis: '1. ЖЕЛАНИЕ РАБОТАТЬ — ✓ клиенту понравилось',
        hvostSteps: {
            desire: true,
            offered: true,
            priceReaction: true,
            decisionProcess: true,
            decisionWay: true,
        },
        fiveKDone: false,
        fiveKAnalysis: 'КЛИЕНТ — юрист\nКОЛЛЕГИ — не выяснено',
        fiveKItems: { client: true, colleagues: false },
    });

const CHECKLIST_NULLS = {
    hvostDone: null,
    hvostAnalysis: null,
    hvostSteps: null,
    fiveKDone: null,
    fiveKAnalysis: null,
    fiveKItems: null,
};

/** Поля карточки по разбору — та же раскладка, что у приёма. */
const smartFieldsOf = (dto: AgentCallAnalysisDto): Record<string, unknown> =>
    buildCallReportSmartFields(
        buildAgentSmartItemInput({
            row: { id: '42', activityId: '101', text: 'расшифровка' } as never,
            rowLeadId: undefined,
            family: {} as never,
            dealContext: {},
            callDirection: undefined,
            gigachat: {},
            agentName: 'call-report-analyzer',
            dto,
        }),
        {
            entityTypeId: 1056,
            typeId: 128,
            ufKeyByCode: {},
            enumItems: { CALL_TYPE: { presentation: 51, decision: 52 } },
        },
        logger,
    ) as Record<string, unknown>;

const checklistKeysOf = (fields: Record<string, unknown>): string[] =>
    Object.keys(fields).filter(key => /^ufCrm128(Hvost|FiveK)/.test(key));

describe('правила показа при записи разбора: чек-листы «Хвост» и 5К', () => {
    beforeEach(() => jest.clearAllMocks());

    it('не презентация — все шесть полей обнуляются', () => {
        const fixed = applyChecklistRule('1', withChecklists('call'), logger);
        expect(fixed).toMatchObject(CHECKLIST_NULLS);
        expect(log).toHaveBeenCalledWith(
            expect.stringContaining('Чек-листы «Хвост» и 5К сняты'),
        );
    });

    it('звонок по решению тоже теряет чек-листы (решение владельца: только презентация)', () => {
        expect(
            applyChecklistRule('1', withChecklists('decision'), logger),
        ).toMatchObject(CHECKLIST_NULLS);
    });

    it('презентация — чек-листы как были', () => {
        const source = withChecklists('presentation');
        expect(applyChecklistRule('1', source, logger)).toBe(source);
        expect(log).not.toHaveBeenCalled();
    });

    it('у не-презентации без чек-листов — поля null, без записи в журнал', () => {
        const fixed = applyChecklistRule(
            '1',
            dtoOf({ callType: 'cold' }),
            logger,
        );
        expect(fixed).toMatchObject(CHECKLIST_NULLS);
        expect(log).not.toHaveBeenCalled();
    });

    it('общая подготовка: обнулённое не вызывает ни предупреждения о форме, ни «исправлений» консистентности', () => {
        const prepared = prepareAgentAnalysis(
            '1',
            'call-report-analyzer',
            withChecklists('decision'),
            null,
            logger,
        );
        expect(prepared).toMatchObject(CHECKLIST_NULLS);
        expect(warn).not.toHaveBeenCalled();
        const logged = log.mock.calls.map(([message]) => message).join('\n');
        expect(logged).not.toContain('Консистентность');
        expect(logged).not.toContain('собран кодом из чеклиста');
    });

    it('не презентация — поля HVOST_* и FIVE_K_* в карточку не пишутся, в ленте блоков нет', () => {
        const prepared = prepareAgentAnalysis(
            '1',
            'call-report-analyzer',
            withChecklists('decision'),
            null,
            logger,
        );
        expect(checklistKeysOf(smartFieldsOf(prepared))).toEqual([]);
        expect(renderMethodologyComments(prepared)).toEqual([]);
    });

    it('презентация — поля карточки и блоки ленты как раньше', () => {
        const prepared = prepareAgentAnalysis(
            '1',
            'call-report-analyzer',
            withChecklists('presentation'),
            null,
            logger,
        );
        const fields = smartFieldsOf(prepared);
        expect(fields.ufCrm128HvostDone).toBe(1);
        expect(fields.ufCrm128FiveKDone).toBe(0);
        expect(fields.ufCrm128HvostDesire).toBe(1);
        expect(fields.ufCrm128FiveKColleagues).toBe(0);
        expect(fields.ufCrm128HvostAnalysis).toContain('ЖЕЛАНИЕ РАБОТАТЬ');
        const comments = renderMethodologyComments(prepared);
        expect(comments).toHaveLength(2);
        expect(comments[0]).toContain('Хвост');
        expect(comments[1]).toContain('5К');
    });

    it('процент скрипта при null в карточку не пишется', () => {
        const prepared = prepareAgentAnalysis(
            '1',
            'call-report-analyzer',
            dtoOf({ scriptCompliance: 40, scriptIncluded: false }),
            null,
            logger,
        );
        expect(smartFieldsOf(prepared)).not.toHaveProperty(
            'ufCrm128ScriptCompliance',
        );
        const withScript = prepareAgentAnalysis(
            '1',
            'call-report-analyzer',
            dtoOf({ scriptCompliance: 80, scriptIncluded: true }),
            null,
            logger,
        );
        expect(smartFieldsOf(withScript).ufCrm128ScriptCompliance).toBe(80);
    });
});

describe('правила показа при записи разбора: методика в карточке', () => {
    const withMethodology = (code: string, title: string) =>
        dtoOf({
            methodology: {
                code,
                version: '1.0.0',
                title,
                checkpoints: [],
                checkpointsDone: 0,
                checkpointsTotal: 0,
                spirals: null,
                spiralsFull: null,
                spiralsMinFull: null,
            },
        });

    it('имя методики для людей и версия (решение 18.11.2026)', () => {
        expect(
            smartFieldsOf(withMethodology('polyansky', 'Полянский'))
                .ufCrm128Methodology,
        ).toBe('Методика Полянского 1.0.0');
        expect(
            smartFieldsOf(withMethodology('voronezh', 'Воронеж'))
                .ufCrm128Methodology,
        ).toBe('Методика «Воронеж» 1.0.0');
    });

    it('без методики поле не пишется', () => {
        expect(smartFieldsOf(dtoOf())).not.toHaveProperty(
            'ufCrm128Methodology',
        );
    });
});
