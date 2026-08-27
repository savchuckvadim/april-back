import { CallComplianceReviewService } from '../services/call-compliance-review.service';
import { CallReportSmartWriterService } from '@lib/call-lib/call-report/services/call-report-smart-writer.service';

jest.mock(
    '@lib/call-lib/call-report/services/call-report-smart-writer.service',
);

const MockedWriter = CallReportSmartWriterService as jest.MockedClass<
    typeof CallReportSmartWriterService
>;

const TRANSCRIPT =
    'Менеджер: Здравствуйте, это Пётр из Гаранта. Аналитика входит в ' +
    'базовый комплект, подключим бесплатно. Клиент: а сколько стоит? ' +
    'Менеджер: сделаю вам скидку тридцать процентов, обещаю.';

const ROW = {
    id: '42',
    domain: 'alfacentr.bitrix24.ru',
    activityId: '101',
    text: TRANSCRIPT,
    entityType: 'deal',
    entityId: '555',
    userId: '7',
    callStartedAt: new Date('2026-08-27T08:00:00Z'),
    durationSec: '900',
} as never;

/** Ответ модели: две находки с подлинными цитатами. */
const MODEL_RESULT = {
    scriptChecklist: [
        {
            point: 'Назвать сроки внедрения',
            status: 'missed',
            quote: null,
            source: 'script.md',
        },
        {
            point: 'Представиться',
            status: 'done',
            quote: 'Здравствуйте, это Пётр из Гаранта',
            source: 'script.md',
        },
    ],
    violations: [
        {
            rule: 'Скидки согласуются с руководителем',
            what: 'Пообещал скидку без согласования',
            quote: 'сделаю вам скидку тридцать процентов, обещаю',
            source: 'regulation.md',
            severity: 'high',
        },
    ],
    factErrors: [
        {
            claim: 'Аналитика входит в базовый комплект',
            quote: 'Аналитика входит в базовый комплект, подключим бесплатно',
            factFromBase: 'Аналитика — только в расширенном комплекте',
            source: 'product-facts.md',
            severity: 'high',
        },
    ],
    betterLines: [
        {
            moment: 'Вопрос о цене',
            asWas: 'скидка',
            asShouldBe: 'сначала ценность',
            why: 'рано',
        },
        { moment: 'Второй', asWas: 'а', asShouldBe: 'б', why: 'в' },
        { moment: 'Третий (лишний)', asWas: 'а', asShouldBe: 'б', why: 'в' },
    ],
    verdict: 'Нужно вмешательство: обещана несогласованная скидка.',
    scriptCompliance: 50,
};

const makeDeps = (options?: {
    modelResult?: unknown;
    aiRecords?: unknown[];
    materials?: string;
}) => {
    const updateExisting = jest.fn().mockResolvedValue(7);
    MockedWriter.mockImplementation(() => ({ updateExisting }) as never);

    const timeline = { addTimelineComment: jest.fn().mockResolvedValue({}) };
    const pbxService = {
        init: jest.fn().mockResolvedValue({ bitrix: { timeline } }),
    };
    const aiService = {
        findByTranscriptionIds: jest.fn().mockResolvedValue(
            options?.aiRecords ?? [
                {
                    type: 'agent-analysis',
                    user_result: {
                        callType: 'presentation',
                        summary: 'Презентация',
                        presentationDone: true,
                    },
                },
            ],
        ),
        create: jest.fn().mockResolvedValue({ id: '19' }),
    };
    const smartResolver = {
        resolve: jest
            .fn()
            .mockResolvedValue({ entityTypeId: 1056, typeId: 128 }),
    };
    const materials = {
        collect: jest
            .fn()
            .mockImplementation(
                (_domain: string, requests: { kind: string }[]) =>
                    Promise.resolve(
                        requests.map(request => ({
                            kind: request.kind,
                            text:
                                options?.materials === ''
                                    ? ''
                                    : `ДОКУМЕНТ[${request.kind}]`,
                            chars: 10,
                            truncated: false,
                        })),
                    ),
            ),
    };
    const vibeCodeClient = {
        structuredCompletion: jest
            .fn()
            .mockResolvedValue(options?.modelResult ?? MODEL_RESULT),
    };
    const vibeKeyResolver = { resolve: jest.fn().mockResolvedValue('key') };

    const service = new CallComplianceReviewService(
        pbxService as never,
        aiService as never,
        smartResolver as never,
        materials as never,
        vibeCodeClient as never,
        vibeKeyResolver as never,
    );
    return {
        service,
        aiService,
        updateExisting,
        timeline,
        materials,
        vibeCodeClient,
    };
};

describe('CallComplianceReviewService', () => {
    afterEach(() => jest.clearAllMocks());

    it('считает нарушения, пропущенные пункты и ошибки о продукте, пишет в поля и таймлайн', async () => {
        const { service, updateExisting, timeline, aiService } = makeDeps();

        const result = await service.run(ROW, 'presentation', 'model-x');

        expect(result?.violations).toHaveLength(1);
        expect(updateExisting).toHaveBeenCalledWith(
            expect.objectContaining({
                activityId: '101',
                complianceDone: true,
                complianceViolations: 1,
                scriptMissed: 1,
                productFactErrors: 1,
                // Худшая из находок — риск для компании.
                complianceSeverity: 'high',
            }),
        );
        const comment = (
            timeline.addTimelineComment.mock.calls[0] as [{ COMMENT: string }]
        )[0].COMMENT;
        expect(comment).toContain('Проверка по документам компании');
        expect(comment).toContain('Назвать сроки внедрения');
        expect(comment).toContain('Аналитика — только в расширенном комплекте');
        // Результат сохранён в ais как маркер идемпотентности.
        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'call-compliance-review' }),
        );
    });

    it('находки с выдуманными цитатами отбрасываются', async () => {
        const { service, updateExisting } = makeDeps({
            modelResult: {
                ...MODEL_RESULT,
                violations: [
                    {
                        rule: 'Правило',
                        what: 'Что-то',
                        // Такой реплики в разговоре НЕТ.
                        quote: 'я гарантирую вам возврат денег в двойном размере',
                        source: null,
                        severity: 'high',
                    },
                ],
                factErrors: [],
            },
        });

        const result = await service.run(ROW, 'presentation');

        expect(result?.violations).toHaveLength(0);
        expect(updateExisting).toHaveBeenCalledWith(
            expect.objectContaining({
                complianceViolations: 0,
                // Подтверждённых находок нет — нарушений нет.
                complianceSeverity: 'none',
            }),
        );
    });

    it('готовых реплик не больше двух', async () => {
        const { service } = makeDeps();
        const result = await service.run(ROW, 'presentation');
        expect(result?.betterLines).toHaveLength(2);
    });

    it('повторный прогон не тратит вызов модели (идемпотентность)', async () => {
        const { service, vibeCodeClient } = makeDeps({
            aiRecords: [
                { type: 'agent-analysis', user_result: { callType: 'cold' } },
                { type: 'call-compliance-review', user_result: {} },
            ],
        });

        const result = await service.run(ROW, 'cold');

        expect(result).toBeNull();
        expect(vibeCodeClient.structuredCompletion).not.toHaveBeenCalled();
    });

    it('без документов компании модель не вызывается', async () => {
        const { service, vibeCodeClient } = makeDeps({ materials: '' });

        const result = await service.run(ROW, 'cold');

        expect(result).toBeNull();
        expect(vibeCodeClient.structuredCompletion).not.toHaveBeenCalled();
    });

    it('без разбора звонка проверять нечего', async () => {
        const { service, vibeCodeClient } = makeDeps({ aiRecords: [] });

        const result = await service.run(ROW, 'cold');

        expect(result).toBeNull();
        expect(vibeCodeClient.structuredCompletion).not.toHaveBeenCalled();
    });

    it('ПРЕЗЕНТАЦИЯ по содержанию: тип «другое», но есть хвост — методология подмешивается', async () => {
        const { service, materials, vibeCodeClient } = makeDeps({
            aiRecords: [
                {
                    type: 'agent-analysis',
                    user_result: {
                        callType: 'other',
                        hvostDone: false,
                        fiveKAnalysis: 'Коллеги — не выяснено',
                    },
                },
            ],
        });

        await service.run(ROW, 'other');

        const requests = (materials.collect.mock.calls[0] as unknown[])[1] as {
            kind: string;
            budgetChars: number;
        }[];
        const playbook = requests.find(
            request => request.kind === 'presentation-playbook',
        );
        expect(playbook?.budgetChars).toBe(6000);
        // В промпт ушёл презентационный блок проверки.
        const prompt = String(
            (vibeCodeClient.structuredCompletion.mock.calls[0] as unknown[])[0],
        );
        expect(prompt).toContain('ОСОБОЕ ВНИМАНИЕ — ПРЕЗЕНТАЦИЯ');
    });

    it('обычный холодный звонок презентационный блок не получает', async () => {
        const { service, vibeCodeClient } = makeDeps({
            aiRecords: [
                {
                    type: 'agent-analysis',
                    user_result: { callType: 'cold', summary: 'холодный' },
                },
            ],
        });

        await service.run(ROW, 'cold');

        const prompt = String(
            (vibeCodeClient.structuredCompletion.mock.calls[0] as unknown[])[0],
        );
        expect(prompt).not.toContain('ОСОБОЕ ВНИМАНИЕ — ПРЕЗЕНТАЦИЯ');
    });

    it('ошибка модели не роняет конвейер', async () => {
        const { service, vibeCodeClient } = makeDeps();
        vibeCodeClient.structuredCompletion.mockRejectedValue(
            new Error('vibecode down'),
        );

        await expect(service.run(ROW, 'cold')).resolves.toBeNull();
    });
});
