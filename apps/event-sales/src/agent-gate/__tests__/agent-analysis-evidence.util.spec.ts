import { Logger } from '@nestjs/common';
import type { TranscriptSegment } from '@lib/call-lib';
import type { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import { verifyAnalysisEvidence } from '../services/agent-analysis-evidence.util';
import { prepareAgentAnalysis } from '../services/agent-analysis-prepare.util';

const segments = (texts: readonly string[]): TranscriptSegment[] =>
    texts.map((text, position) => ({
        startSec: position * 10,
        endSec: position * 10 + 9,
        speaker: 'unknown',
        text,
    }));

const TIMING = {
    durationSec: 70,
    segments: segments([
        'Добрый день, компания Гарант, меня зовут Ирина.',
        'Здравствуйте, слушаю вас.',
        'Скажите, а какие задачи сейчас у вашей бухгалтерии?',
        'Ну, отчётность, НДС, проверяем контрагентов постоянно.',
        'Сколько это стоит в месяц, если на троих?',
        'Мне понравилось, удобно искать по ситуации.',
        'Хорошо, тогда в четверг созвонимся по решению.',
    ]),
};

const makeLogger = () => {
    const logger = new Logger('test');
    const log = jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    return { logger, log };
};

describe('места разбора в разговоре — проверка при приёме', () => {
    it('разбор без мест (прежнее задание) — тот же объект, журнал молчит', () => {
        const { logger, log } = makeLogger();
        const dto = {
            sections: [{ section: 'NEEDS', relevance: 100, asWas: 'было' }],
            needs: ['НДС'],
        } as unknown as AgentCallAnalysisDto;

        expect(verifyAnalysisEvidence('1', dto, TIMING, logger)).toBe(dto);
        const notPresentation = {
            callType: 'refine',
            hvostEvidence: null,
            fiveKEvidence: null,
        } as unknown as AgentCallAnalysisDto;
        expect(
            verifyAnalysisEvidence('1', notPresentation, TIMING, logger),
        ).toBe(notPresentation);
        expect(log).not.toHaveBeenCalled();
    });

    it('разделы и потребности: секунда по найденной реплике, выдуманная — снята', () => {
        const { logger, log } = makeLogger();
        const dto = {
            sections: [
                {
                    section: 'NEEDS',
                    relevance: 100,
                    quote: ' какие задачи сейчас у вашей бухгалтерии ',
                    startSec: 26,
                },
                {
                    section: 'PRICE',
                    relevance: 80,
                    quote: 'это для нас слишком дорого',
                    startSec: 44,
                },
                { section: 'GREETING', relevance: 100 },
            ],
            needItems: [
                {
                    need: 'НДС и контрагенты',
                    quote: 'проверяем контрагентов постоянно',
                    startSec: 31,
                },
                { need: 'Отчётность', quote: null, startSec: 900 },
            ],
        } as unknown as AgentCallAnalysisDto;

        const checked = verifyAnalysisEvidence('7', dto, TIMING, logger);

        expect(checked.sections?.[0]).toMatchObject({
            quote: 'какие задачи сейчас у вашей бухгалтерии',
            startSec: 20,
        });
        expect(checked.sections?.[1]).toMatchObject({
            quote: 'это для нас слишком дорого',
            startSec: null,
        });
        expect(checked.sections?.[2]).toEqual({
            section: 'GREETING',
            relevance: 100,
        });
        expect(checked.needItems).toEqual([
            {
                need: 'НДС и контрагенты',
                quote: 'проверяем контрагентов постоянно',
                startSec: 30,
            },
            { need: 'Отчётность', quote: null, startSec: null },
        ]);
        expect(log).toHaveBeenCalledWith(
            'Цитаты разбора (transcription 7): по тексту 2, рядом со временем 0, ' +
                'без сверки 0, без цитаты 0, места нет 2, время поправлено по тексту 0',
        );
    });

    it('«хвост» и 5К: места только у пунктов со значением true, по одному на пункт, с цитатой', () => {
        const { logger } = makeLogger();
        const dto = {
            hvostSteps: {
                desire: true,
                offered: false,
                priceReaction: true,
                decisionProcess: null,
                decisionWay: true,
            },
            hvostEvidence: [
                {
                    key: 'desire',
                    quote: 'Мне понравилось, удобно',
                    startSec: 50,
                },
                { key: 'desire', quote: 'удобно искать', startSec: 51 },
                { key: 'offered', quote: 'комплект на троих', startSec: 40 },
                {
                    key: 'priceReaction',
                    quote: 'Сколько это стоит в месяц',
                    startSec: 40,
                },
                { key: 'decisionWay', quote: '  ', startSec: 60 },
            ],
            fiveKItems: null,
            fiveKEvidence: [{ key: 'client', quote: 'задачи', startSec: 20 }],
        } as unknown as AgentCallAnalysisDto;

        const checked = verifyAnalysisEvidence('9', dto, TIMING, logger);

        expect(checked.hvostEvidence).toEqual([
            { key: 'desire', quote: 'Мне понравилось, удобно', startSec: 50 },
            {
                key: 'priceReaction',
                quote: 'Сколько это стоит в месяц',
                startSec: 40,
            },
        ]);
        expect(checked.fiveKEvidence).toBeNull();
    });

    it('итоговый тип «презентация», а задание строилось по другому — пометка в журнале', () => {
        const { logger, log } = makeLogger();
        const base = {
            needItems: [
                {
                    need: 'НДС',
                    quote: 'проверяем контрагентов постоянно',
                    startSec: 30,
                },
            ],
        };
        verifyAnalysisEvidence(
            '11',
            {
                ...base,
                callType: 'presentation',
                taskCallType: 'refine',
            } as unknown as AgentCallAnalysisDto,
            TIMING,
            logger,
        );
        expect(log).toHaveBeenLastCalledWith(
            expect.stringContaining(
                '; итоговый тип «presentation», задание — по типу «refine»: «хвоста» и 5К в разборе нет',
            ),
        );

        for (const dto of [
            { ...base, callType: 'presentation', taskCallType: 'presentation' },
            { ...base, callType: 'refine', taskCallType: 'refine' },
            { ...base, callType: 'presentation' },
        ]) {
            verifyAnalysisEvidence(
                '12',
                dto as unknown as AgentCallAnalysisDto,
                TIMING,
                logger,
            );
            expect(log).toHaveBeenLastCalledWith(
                expect.not.stringContaining('итоговый тип'),
            );
        }
    });

    it('без реплик (старая расшифровка) — только «внутри записи»', () => {
        const { logger } = makeLogger();
        const dto = {
            needItems: [
                { need: 'НДС', quote: 'по НДС много вопросов', startSec: 12 },
                { need: 'Кадры', quote: 'приказы по кадрам', startSec: 500 },
            ],
        } as unknown as AgentCallAnalysisDto;

        const checked = verifyAnalysisEvidence(
            '3',
            dto,
            { durationSec: 70, segments: null },
            logger,
        );

        expect(checked.needItems?.map(item => item.startSec)).toEqual([
            12,
            null,
        ]);
    });
});

describe('общая подготовка разбора проверяет места по репликам записи', () => {
    const PRESENTATION = {
        callType: 'presentation',
        summary: 'Показ системы',
        sections: [
            {
                section: 'NEEDS',
                relevance: 100,
                score: 7,
                quote: 'какие задачи сейчас у вашей бухгалтерии',
                startSec: 0,
            },
        ],
        hvostSteps: { desire: true },
        hvostEvidence: [
            { key: 'desire', quote: 'Мне понравилось, удобно', startSec: 50 },
        ],
    };

    it('презентация: секунда раздела — по найденной реплике, место пункта «хвоста» остаётся', () => {
        const { logger } = makeLogger();
        const prepared = prepareAgentAnalysis(
            '5',
            'call-report-analyzer',
            PRESENTATION as unknown as AgentCallAnalysisDto,
            TIMING.durationSec,
            logger,
            TIMING.segments,
        );

        expect(prepared.sections?.[0]?.startSec).toBe(20);
        expect(prepared.hvostEvidence).toEqual(PRESENTATION.hvostEvidence);
    });

    it('не презентация: места пунктов сняты вместе с чек-листами', () => {
        const { logger } = makeLogger();
        const prepared = prepareAgentAnalysis(
            '6',
            'call-report-analyzer',
            {
                ...PRESENTATION,
                callType: 'refine',
            } as unknown as AgentCallAnalysisDto,
            TIMING.durationSec,
            logger,
            TIMING.segments,
        );

        expect(prepared.hvostSteps).toBeNull();
        expect(prepared.hvostEvidence).toBeNull();
        expect(prepared.fiveKEvidence).toBeNull();
    });
});
