import { CallReportSmartWriterService } from '../services/call-report-smart-writer.service';
import { CallReportSmartInfo } from '../services/call-report-smart-resolver.service';

const SMART_INFO: CallReportSmartInfo = {
    // UF-ключи собираются по typeId (128); entityTypeId — адресация item.add.
    entityTypeId: 1056,
    typeId: 128,
    ufKeyByCode: {},
    enumItems: {
        CALL_TYPE: { presentation: 51, cold: 50 },
        KPI_ITEM_STATUS: { confirmed: 60, suspected: 61 },
        HISTORY_ITEM_STATUS: { confirmed: 70, suspected: 71 },
        INTERLOCUTOR_ROLE: { lpr: 80 },
        SPECIALIST: { accountant: 85 },
        OBJECTION_CATEGORIES: { price: 90, need: 91 },
        COMPETITORS: { consultant: 95 },
        COACHING_PRIORITY: { urgent: 97 },
    },
};

const makeBitrix = () => ({
    item: {
        add: jest.fn().mockResolvedValue({ result: { item: { id: 7 } } }),
        list: jest.fn().mockResolvedValue({ result: { items: [] } }),
        update: jest.fn().mockResolvedValue({ result: {} }),
    },
    timeline: {
        addTimelineComment: jest.fn().mockResolvedValue({}),
    },
});

describe('CallReportSmartWriterService', () => {
    it('создаёт элемент со связями, camelCase UF-полями и enum по id', async () => {
        const bitrix = makeBitrix();
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        const itemId = await writer.addItem({
            activityId: '101',
            dealId: 555,
            companyId: 33,
            contactId: 44,
            managerId: 7,
            callType: 'presentation',
            durationSec: 700,
            needsFound: true,
            presentationDone: false,
            summary: 'Резюме & детали =100%',
            transcriptionId: '42',
        });

        expect(itemId).toBe(7);
        // Элемент создаётся по entityTypeId, UF-ключи — по typeId (128).
        expect(bitrix.item.add).toHaveBeenCalledWith(
            '1056',
            expect.objectContaining({
                parentId2: 555,
                companyId: 33,
                contactId: 44,
                assignedById: 7,
                ufCrm128ActivityId: '101',
                ufCrm128CallType: 51,
                ufCrm128DurationSec: 700,
                ufCrm128NeedsFound: 1,
                ufCrm128PresentationDone: 0,
                ufCrm128Summary: 'Резюме & детали =100%',
                ufCrm128TranscriptionId: '42',
            }),
        );
    });

    it('гранулярный чеклист хвоста/5К пишется boolean-полями, null пункт поле не трогает', async () => {
        const bitrix = makeBitrix();
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await writer.addItem({
            activityId: '101',
            callType: 'presentation',
            transcriptionId: '42',
            hvostDone: false,
            hvostSteps: {
                desire: true,
                offered: false,
                priceReaction: null,
                decisionProcess: false,
                decisionWay: false,
            },
            fiveKItems: {
                client: true,
                company: false,
                colleagues: true,
                criteria: null,
            },
        });

        const fields = (
            bitrix.item.add.mock.calls[0] as unknown[]
        )[1] as Record<string, unknown>;
        expect(fields.ufCrm128HvostDesire).toBe(1);
        expect(fields.ufCrm128HvostOffered).toBe(0);
        // null «не применимо/не определено» — поле не пишется вовсе.
        expect(fields).not.toHaveProperty('ufCrm128HvostPriceReaction');
        expect(fields.ufCrm128HvostDecisionProcess).toBe(0);
        expect(fields.ufCrm128FiveKClient).toBe(1);
        expect(fields.ufCrm128FiveKCompany).toBe(0);
        expect(fields.ufCrm128FiveKColleagues).toBe(1);
        expect(fields).not.toHaveProperty('ufCrm128FiveKCriteria');
    });

    it('пишет связи воронок в формате поля, привязки списков и разделы анализа', async () => {
        const bitrix = makeBitrix();
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await writer.addItem({
            activityId: '101',
            mainDealId: 555,
            presentationDealId: 601,
            xoDealId: 602,
            kpiItem: { itemId: '9001', status: 'confirmed' },
            historyItem: { itemId: '9002', status: 'suspected' },
            sections: [
                {
                    section: 'OBJECTIONS',
                    relevance: 100,
                    score: 6,
                    analysis: 'возражение из-за слабых потребностей',
                    advice: 'потренировать уточняющие вопросы',
                },
                { section: 'PRICE', relevance: 0 },
            ],
        });

        const addCall = bitrix.item.add.mock.calls[0] as unknown[];
        const fields = addCall[1] as Record<string, unknown>;
        // Формат задаёт САМО ПОЛЕ: привязано к одной сущности (DEAL) —
        // хранится голый id ('D_555' отбрасывается, прод 27.08.2026);
        // поле одиночное — значение скаляр, а не массив (массив PHP-Битрикс
        // сохранял литералом «Array», прод-алерт 28.08.2026).
        expect(fields.ufCrm128DealMain).toBe('555');
        expect(fields.ufCrm128DealPresentation).toBe('601');
        expect(fields.ufCrm128DealXo).toBe('602');
        expect(fields.ufCrm128KpiItemId).toBe('9001');
        expect(fields.ufCrm128KpiItemStatus).toBe(60);
        expect(fields.ufCrm128HistoryItemStatus).toBe(71);
        expect(fields.ufCrm128ObjectionsRelevance).toBe(100);
        expect(fields.ufCrm128ObjectionsScore).toBe(6);
        expect(fields.ufCrm128ObjectionsAdvice).toBe(
            'потренировать уточняющие вопросы',
        );
        expect(fields.ufCrm128PriceRelevance).toBe(0);
        expect(fields.ufCrm128PriceScore).toBeUndefined();
    });


    it('одиночное crm-поле получает СКАЛЯР: массив Битрикс сохранил бы литералом «Array»', async () => {
        const bitrix = makeBitrix();
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await writer.addItem({ activityId: '101', mainDealId: 179514 });

        const fields = (
            bitrix.item.add.mock.calls[0] as unknown[]
        )[1] as Record<string, unknown>;
        // Прод-алерт 28.08.2026: отправляли ['179514'] — в эхе приходило
        // «Array», то есть PHP приводил массив к строке и связь терялась.
        expect(Array.isArray(fields.ufCrm128DealMain)).toBe(false);
        expect(fields.ufCrm128DealMain).toBe('179514');
    });

    it('v3: next step, событийные флаги, multi-enum справочники и метрики речи', async () => {
        const bitrix = makeBitrix();
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await writer.addItem({
            activityId: '101',
            interlocutorRole: 'lpr',
            specialist: 'accountant',
            nextStepSet: true,
            nextStep: 'Презентация в четверг, подключает главбуха',
            nextStepDate: '2026-07-24',
            priceDiscussed: true,
            competitorMentioned: true,
            competitors: ['consultant', 'unknown-comp'],
            objectionCategories: ['price', 'need'],
            talkRatioPct: 52,
            questionsCount: 9,
            weightedScore: 62,
            coachingPriority: 'urgent',
        });

        const addCall = bitrix.item.add.mock.calls[0] as unknown[];
        const fields = addCall[1] as Record<string, unknown>;
        expect(fields.ufCrm128InterlocutorRole).toBe(80);
        expect(fields.ufCrm128Specialist).toBe(85);
        expect(fields.ufCrm128NextStepSet).toBe(1);
        expect(fields.ufCrm128NextStepDate).toBe('2026-07-24');
        expect(fields.ufCrm128PriceDiscussed).toBe(1);
        expect(fields.ufCrm128CompetitorMentioned).toBe(1);
        expect(fields.ufCrm128Competitors).toEqual([95]);
        expect(fields.ufCrm128ObjectionCategories).toEqual([90, 91]);
        expect(fields.ufCrm128TalkRatioPct).toBe(52);
        expect(fields.ufCrm128QuestionsCount).toBe(9);
        expect(fields.ufCrm128WeightedScore).toBe(62);
        expect(fields.ufCrm128CoachingPriority).toBe(97);
    });

    it('row size: выброшенный транскрипт постится в таймлайн ЦЕЛИКОМ, части в обратном порядке', async () => {
        const bitrix = makeBitrix();
        const rowSizeError = Object.assign(
            new Error('Request failed with status code 400'),
            {
                response: {
                    data: { error_description: 'Row size too large (> 8126)' },
                },
            },
        );
        // Первый вариант (все поля) падает на row size → второй проходит.
        bitrix.item.add
            .mockRejectedValueOnce(rowSizeError)
            .mockResolvedValue({ result: { item: { id: 7 } } });
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        // 50-минутный звонок: ~50к символов → TRANSCRIPT_1+2 → 7 частей по 8к.
        const transcript = 'а'.repeat(50_000);
        await writer.addItem({ activityId: '101', transcript });

        const comments = bitrix.timeline.addTimelineComment.mock
            .calls as unknown as [{ COMMENT: string }][];
        const transcriptPosts = comments.filter(([dto]) =>
            dto.COMMENT.includes('Транскрипт звонка'),
        );
        expect(transcriptPosts).toHaveLength(7);
        // Обратный порядок постинга: часть 1 запощена последней (сверху).
        expect(transcriptPosts[0][0].COMMENT).toContain('часть 7 из 7');
        expect(transcriptPosts[6][0].COMMENT).toContain('часть 1 из 7');
        // Весь текст доехал без потерь (тело части — после пустой строки).
        const total = transcriptPosts.reduce(
            (sum, [dto]) => sum + (dto.COMMENT.split('\n\n')[1]?.length ?? 0),
            0,
        );
        expect(total).toBe(50_000);
    });

    it('row size на UPDATE существующего элемента: транскрипт НЕ постится повторно', async () => {
        const bitrix = makeBitrix();
        // Элемент уже существует (создан каркасом) — путь update.
        bitrix.item.list.mockResolvedValue({
            result: { items: [{ id: 7 }] },
        });
        const rowSizeError = Object.assign(
            new Error('Request failed with status code 400'),
            {
                response: {
                    data: { error_description: 'Row size too large (> 8126)' },
                },
            },
        );
        bitrix.item.update
            .mockRejectedValueOnce(rowSizeError)
            .mockResolvedValue({ result: {} });
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await writer.addItem({
            activityId: '101',
            transcript: 'а'.repeat(50_000),
        });

        const comments = bitrix.timeline.addTimelineComment.mock
            .calls as unknown as [{ COMMENT: string }][];
        expect(
            comments.filter(([dto]) =>
                dto.COMMENT.includes('Транскрипт звонка'),
            ),
        ).toHaveLength(0);
    });

    it('row size: транскрипт НЕ дублируется в таймлайн, когда диалог постит intake', async () => {
        const bitrix = makeBitrix();
        const rowSizeError = Object.assign(
            new Error('Request failed with status code 400'),
            {
                response: {
                    data: { error_description: 'Row size too large (> 8126)' },
                },
            },
        );
        bitrix.item.add
            .mockRejectedValueOnce(rowSizeError)
            .mockResolvedValue({ result: { item: { id: 7 } } });
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await writer.addItem({
            activityId: '101',
            transcript: 'а'.repeat(50_000),
            transcriptInTimeline: true,
        });

        const comments = bitrix.timeline.addTimelineComment.mock
            .calls as unknown as [{ COMMENT: string }][];
        expect(
            comments.filter(([dto]) =>
                dto.COMMENT.includes('Транскрипт звонка'),
            ),
        ).toHaveLength(0);
    });

    it('длинный транскрипт раскладывается кусками по полям TRANSCRIPT_N', async () => {
        const bitrix = makeBitrix();
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await writer.addItem({
            activityId: '101',
            transcript: 'а'.repeat(90_000),
        });

        const addCall = bitrix.item.add.mock.calls[0] as unknown[];
        const fields = addCall[1] as Record<string, unknown>;
        expect((fields.ufCrm128Transcript1 as string).length).toBe(40_000);
        expect((fields.ufCrm128Transcript2 as string).length).toBe(40_000);
        expect((fields.ufCrm128Transcript3 as string).length).toBe(10_000);
        expect(fields.ufCrm128Transcript4).toBeUndefined();
    });

    it('неизвестный код enum пропускается, поле не пишется', async () => {
        const bitrix = makeBitrix();
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await writer.addItem({ activityId: '101', callType: 'unknown-type' });
        const addCall = bitrix.item.add.mock.calls[0] as unknown[];
        const fields = addCall[1] as Record<string, unknown>;
        expect(fields.ufCrm128CallType).toBeUndefined();
    });

    it('дедуп по xmlId: пишет aicall_{activityId} и не создаёт дубль', async () => {
        const bitrix = makeBitrix();
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await writer.addItem({ activityId: '101' });
        expect(bitrix.item.list).toHaveBeenCalledWith(
            '1056',
            { xmlId: 'aicall_101' },
            ['id', 'xmlId'],
        );
        const addCall = bitrix.item.add.mock.calls[0] as unknown[];
        const fields = addCall[1] as Record<string, unknown>;
        expect(fields.xmlId).toBe('aicall_101');

        // Повтор: элемент уже есть в Bitrix → возвращаем его id без add.
        bitrix.item.list.mockResolvedValue({
            result: { items: [{ id: 42 }] },
        });
        bitrix.item.add.mockClear();
        const itemId = await writer.addItem({ activityId: '101' });
        expect(itemId).toBe(42);
        expect(bitrix.item.add).not.toHaveBeenCalled();
    });

    it('связи потеряны Битриксом (нет в эхе элемента) — error-алерт с перечнем полей', async () => {
        const bitrix = makeBitrix();
        // Битрикс молча отбросил связи: HTTP 200, но в созданном элементе их нет.
        bitrix.item.add.mockResolvedValue({
            result: { item: { id: 7, title: 'Звонок' } },
        });
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        const error = jest
            .spyOn(
                (writer as unknown as { logger: { error: () => void } }).logger,
                'error',
            )
            .mockImplementation(() => undefined);

        await writer.addItem({
            activityId: '101',
            dealId: 555,
            companyId: 33,
            mainDealId: 555,
        });

        expect(error).toHaveBeenCalledTimes(1);
        const [message, meta] = error.mock.calls[0] as unknown as [
            string,
            { telegram?: boolean },
        ];
        expect(message).toContain('НЕ СОХРАНИЛ связи');
        expect(message).toContain('parentId2');
        expect(message).toContain('companyId');
        expect(meta.telegram).toBe(true);
        error.mockRestore();
    });

    it('связи сохранились (есть в эхе) — алерта нет', async () => {
        const bitrix = makeBitrix();
        bitrix.item.add.mockResolvedValue({
            // Битрикс возвращает id строками — сравнение мягкое.
            result: {
                item: {
                    id: 7,
                    parentId2: '555',
                    companyId: '33',
                    ufCrm128DealMain: '555',
                },
            },
        });
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        const error = jest
            .spyOn(
                (writer as unknown as { logger: { error: () => void } }).logger,
                'error',
            )
            .mockImplementation(() => undefined);

        await writer.addItem({
            activityId: '101',
            dealId: 555,
            companyId: 33,
            mainDealId: 555,
        });

        expect(error).not.toHaveBeenCalled();
        error.mockRestore();
    });

    it('связей нет во входе — warn «нечего привязывать», не алерт', async () => {
        const bitrix = makeBitrix();
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        const logger = (
            writer as unknown as {
                logger: { warn: () => void; error: () => void };
            }
        ).logger;
        const warn = jest
            .spyOn(logger, 'warn')
            .mockImplementation(() => undefined);
        const error = jest
            .spyOn(logger, 'error')
            .mockImplementation(() => undefined);

        await writer.addItem({ activityId: '101' });

        expect(error).not.toHaveBeenCalled();
        expect(
            (warn.mock.calls as unknown as [string][]).some(([message]) =>
                message.includes('связи НЕ отправлялись'),
            ),
        ).toBe(true);
        warn.mockRestore();
        error.mockRestore();
    });

    it('дописывающий проход (без паспорта звонка) НЕ перезаписывает название элемента', async () => {
        const bitrix = makeBitrix();
        bitrix.item.list.mockResolvedValue({ result: { items: [{ id: 42 }] } });
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );

        // Ревизор/сверка: связи и рекомендации есть, паспорта звонка нет.
        await writer.updateExisting({
            activityId: '101',
            dealId: 555,
            recommendations: 'Отправить КП',
        });

        const updateCall = bitrix.item.update.mock.calls[0] as unknown[];
        const fields = updateCall[2] as Record<string, unknown>;
        expect(fields).not.toHaveProperty('title');
        expect(fields.parentId2).toBe(555);
    });

    it('создание без паспорта звонка всё же получает техническое название', async () => {
        const bitrix = makeBitrix();
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await writer.addItem({ activityId: '101' });
        const addCall = bitrix.item.add.mock.calls[0] as unknown[];
        const fields = addCall[1] as Record<string, unknown>;
        expect(fields.title).toContain('звонок #101');
    });

    it('сломанный поиск по xmlId не блокирует запись (fail-open)', async () => {
        const bitrix = makeBitrix();
        bitrix.item.list.mockRejectedValue(new Error('list down'));
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        const itemId = await writer.addItem({ activityId: '101' });
        expect(itemId).toBe(7);
    });

    it('бросает ошибку, если Bitrix не вернул id элемента', async () => {
        const bitrix = makeBitrix();
        bitrix.item.add.mockResolvedValue({ result: {} });
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await expect(writer.addItem({ activityId: '101' })).rejects.toThrow(
            'не вернул id',
        );
    });

    it('Row size в БОЕВОЙ форме AxiosError (текст в response.data) включает деградацию', async () => {
        const bitrix = makeBitrix();
        // Прод 06.08.2026: message = «Request failed…», MySQL-текст — в data.
        const axiosError = Object.assign(
            new Error('Request failed with status code 400'),
            {
                response: {
                    status: 400,
                    data: {
                        error: '400',
                        error_description:
                            'Mysql query error: (1118) Row size too large (> 8126). Changing some columns to TEXT or BLOB…',
                    },
                },
            },
        );
        bitrix.item.add
            .mockRejectedValueOnce(axiosError)
            .mockResolvedValue({ result: { item: { id: 7 } } });
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        const itemId = await writer.addItem({
            activityId: '101',
            transcript: 'т'.repeat(100_000),
        });
        expect(itemId).toBe(7);
        expect(bitrix.item.add).toHaveBeenCalledTimes(2);
        const second = (
            bitrix.item.add.mock.calls[1] as unknown[]
        )[1] as Record<string, unknown>;
        expect(second.ufCrm128Transcript1).toBeUndefined();
    });

    it('Row size: ретрай без транскрипта, затем ВСЕ тексты ужимаются под бюджет строки (ничего не пропадает)', async () => {
        const bitrix = makeBitrix();
        const rowSize = new Error(
            'Mysql query error: (1118) Row size too large (> 8126)',
        );
        // Первые две попытки падают по лимиту строки, третья проходит.
        bitrix.item.add
            .mockRejectedValueOnce(rowSize)
            .mockRejectedValueOnce(rowSize)
            .mockResolvedValue({ result: { item: { id: 7 } } });
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        const longText = 'х'.repeat(5000);
        const itemId = await writer.addItem({
            activityId: '101',
            transcript: 'т'.repeat(100_000),
            scoreExplanation: longText,
            // Прод-жалоба 27.08.2026: раньше неприоритетные разборы просто
            // исчезали из карточки («оценка есть, а разбора нет»).
            speechAnalysis: longText,
            sections: [
                {
                    section: 'GREETING',
                    relevance: 100,
                    score: 5,
                    analysis: longText,
                    advice: 'быстрый вход: имя, компания, причина звонка',
                },
            ],
            score: 8,
        });

        expect(itemId).toBe(7);
        expect(bitrix.item.add).toHaveBeenCalledTimes(3);
        const first = (bitrix.item.add.mock.calls[0] as unknown[])[1] as Record<
            string,
            unknown
        >;
        const second = (
            bitrix.item.add.mock.calls[1] as unknown[]
        )[1] as Record<string, unknown>;
        const third = (bitrix.item.add.mock.calls[2] as unknown[])[1] as Record<
            string,
            unknown
        >;
        // 1-я попытка — с транскриптом; 2-я — без него.
        expect(first.ufCrm128Transcript1).toBeDefined();
        expect(second.ufCrm128Transcript1).toBeUndefined();
        // 3-я: ВСЕ длинные тексты ужаты под бюджет строки и остались в
        // полях — включая разбор раздела и спич (раньше их выбрасывало).
        const explanation = String(third.ufCrm128ScoreExplanation);
        expect(explanation.endsWith('…')).toBe(true);
        expect(Buffer.byteLength(explanation, 'utf8')).toBeLessThanOrEqual(
            700 + 3,
        );
        const speech = String(third.ufCrm128SpeechAnalysis);
        expect(speech.endsWith('…')).toBe(true);
        const greeting = String(third.ufCrm128GreetingAnalysis);
        expect(greeting.endsWith('…')).toBe(true);
        // Суммарно тексты укладываются в бюджет строки (~6.5к байт).
        const textBytes = Object.values(third)
            .filter((value): value is string => typeof value === 'string')
            .reduce((sum, value) => sum + Buffer.byteLength(value, 'utf8'), 0);
        expect(textBytes).toBeLessThanOrEqual(6500 + 500);
        // Короткая рекомендация раздела не тронута.
        expect(third.ufCrm128GreetingAdvice).toBe(
            'быстрый вход: имя, компания, причина звонка',
        );
        // Короткие значения не трогаются ни в одном варианте.
        expect(third.ufCrm128Score).toBe(8);
        // Выброшенные тексты ушли полным текстом в таймлайн элемента,
        // ВКЛЮЧАЯ транскрипт (с 16.08.2026 — целиком кусками: intake без
        // dialog транскрипт в таймлайн не постит, а клиент за него платит).
        const comments = bitrix.timeline.addTimelineComment.mock.calls.map(
            call => (call as { COMMENT: string }[])[0].COMMENT,
        );
        expect(
            comments.some(comment => comment.includes('Анализ речи менеджера')),
        ).toBe(true);
        expect(
            comments.some(comment => comment.includes('Объяснение оценки')),
        ).toBe(true);
        expect(comments.some(comment => comment.includes('ттттт'))).toBe(true);
    });

    it('иная ошибка Bitrix пробрасывается без деградационных ретраев', async () => {
        const bitrix = makeBitrix();
        bitrix.item.add.mockRejectedValue(new Error('ACCESS_DENIED'));
        const writer = new CallReportSmartWriterService(
            bitrix as never,
            SMART_INFO,
        );
        await expect(writer.addItem({ activityId: '101' })).rejects.toThrow(
            'ACCESS_DENIED',
        );
        expect(bitrix.item.add).toHaveBeenCalledTimes(1);
    });
});
