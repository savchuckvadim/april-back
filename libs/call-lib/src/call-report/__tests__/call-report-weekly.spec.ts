import * as ExcelJS from 'exceljs';
import { CallReportExcelBuilder } from '../weekly-report/call-report-excel.builder';
import { CallReportWeeklyDataService } from '../weekly-report/call-report-weekly-data.service';
import { CallReportWeeklyDeliveryService } from '../weekly-report/call-report-weekly-delivery.service';
import { SendCallReportWeeklyUseCase } from '../weekly-report/send-call-report-weekly.use-case';
import { CallReportWeeklyDataset } from '../weekly-report/call-report-weekly.types';

const FROM = new Date('2026-08-21T00:00:00Z');
const TO = new Date('2026-08-27T00:00:00Z');

const CALL_ROW = {
    id: '42',
    dedupKey: 'alfacentr.bitrix24.ru:101',
    domain: 'alfacentr.bitrix24.ru',
    activityId: '101',
    callId: 'ext_1',
    callStartedAt: new Date('2026-08-26T08:25:00Z'),
    provider: 'yandex',
    status: 'done',
    text: 'полный транскрипт разговора',
    durationSec: '840',
    entityType: 'deal',
    entityId: '555',
    userId: '7',
    createdAt: new Date('2026-08-26T08:40:00Z'),
    updatedAt: new Date('2026-08-26T08:40:00Z'),
};

const ANALYSIS = {
    callType: 'presentation',
    summary: 'Презентация СПС для юриста',
    score: 4,
    weightedScore: 41,
    productive: true,
    talkRatioPct: 72,
    questionsCount: 3,
    needs: ['практика по 44-ФЗ'],
    productsOffered: ['СПС Гарант'],
    objections: [{ objection: 'дорого', handling: 'сравнил с ценой юриста' }],
    riskFlags: ['обещание прислать КП'],
    recommendations: ['назначить дату решения'],
    // Ровно те тексты, которые в карточке смарта живут только в сокращении.
    speechAnalysis: 'ПОЛНЫЙ разбор речи менеджера '.repeat(60),
    hvostAnalysis: '1. Вопросы ценности — ✗ не проговорена польза',
    fiveKAnalysis: 'Клиент — Юлия, юрист\nКоллеги — не выяснено',
    reportComparison: 'Менеджер отметил 5К закрытым — в звонке не выяснено',
    nextStep: { set: false, description: null, date: null },
    sections: [
        {
            section: 'GREETING',
            relevance: 100,
            score: 5,
            analysis: 'ПОЛНЫЙ разбор приветствия '.repeat(40),
            advice: 'быстрый вход: имя, компания, причина',
        },
    ],
};

const makeDataDeps = () => {
    const transcriptionStore = {
        findDoneInPeriod: jest.fn().mockResolvedValue([CALL_ROW]),
    };
    const aiService = {
        findByTranscriptionIds: jest.fn().mockResolvedValue([
            {
                type: 'agent-analysis',
                transcription_id: '42',
                report_item_id: '206',
                user_result: ANALYSIS,
            },
            // Чужие записи конвейера в отчёт не попадают.
            { type: 'call-resume', transcription_id: '42', user_result: {} },
        ]),
    };
    const smartResolver = {
        resolve: jest.fn().mockResolvedValue({ entityTypeId: 1056 }),
    };
    const service = new CallReportWeeklyDataService(
        transcriptionStore as never,
        aiService as never,
        smartResolver as never,
    );
    return { service, transcriptionStore, aiService, smartResolver };
};

describe('CallReportWeeklyDataService', () => {
    it('собирает полные тексты разбора и строки по разделам', async () => {
        const { service } = makeDataDeps();
        const dataset = await service.collect(
            'alfacentr.bitrix24.ru',
            FROM,
            TO,
        );

        expect(dataset.rows).toHaveLength(1);
        const row = dataset.rows[0];
        expect(row.analyzed).toBe(true);
        expect(row.managerId).toBe(7);
        expect(row.durationMin).toBe(14);
        expect(row.callType).toBe('presentation');
        // В карточке эти тексты ужаты — здесь ПОЛНЫЕ.
        expect(row.speechAnalysis).toBe(ANALYSIS.speechAnalysis);
        expect(row.fiveKAnalysis).toContain('Коллеги — не выяснено');
        expect(row.reportComparison).toContain('Менеджер отметил');
        expect(row.transcript).toBe('полный транскрипт разговора');
        expect(row.objections).toBe('дорого → сравнил с ценой юриста');

        expect(dataset.sections).toHaveLength(1);
        expect(dataset.sections[0].section).toBe('GREETING');
        expect(dataset.sections[0].analysis).toBe(
            ANALYSIS.sections[0].analysis,
        );
    });

    it('звонок без глубокого разбора попадает в отчёт с пометкой', async () => {
        const { service, aiService } = makeDataDeps();
        aiService.findByTranscriptionIds.mockResolvedValue([]);

        const dataset = await service.collect(
            'alfacentr.bitrix24.ru',
            FROM,
            TO,
        );
        expect(dataset.rows[0].analyzed).toBe(false);
        expect(dataset.rows[0].transcript).toBe('полный транскрипт разговора');
        expect(dataset.sections).toHaveLength(0);
    });

    it('длинный транскрипт (3 часа) режется на части — ничего не теряется', async () => {
        const { service, transcriptionStore } = makeDataDeps();
        // ~200k символов: примерно трёхчасовой разговор.
        const huge = 'а'.repeat(200_000);
        transcriptionStore.findDoneInPeriod.mockResolvedValue([
            { ...CALL_ROW, text: huge },
        ]);

        const dataset = await service.collect(
            'alfacentr.bitrix24.ru',
            FROM,
            TO,
        );

        expect(dataset.transcripts).toHaveLength(7);
        expect(dataset.transcripts[0].part).toBe(1);
        expect(dataset.transcripts[0].partsTotal).toBe(7);
        // Склейка частей возвращает исходный текст целиком.
        const restored = dataset.transcripts.map(part => part.text).join('');
        expect(restored).toHaveLength(huge.length);
        expect(dataset.transcripts[0].smartItemId).toBe(206);
    });

    it('на лист презентаций звонок попадает по НАЛИЧИЮ хвоста/5К, даже если тип «другое»', async () => {
        const { service, aiService } = makeDataDeps();
        aiService.findByTranscriptionIds.mockResolvedValue([
            {
                type: 'agent-analysis',
                transcription_id: '42',
                report_item_id: '206',
                user_result: {
                    // Классификатор ошибся с типом — разбор при этом есть.
                    callType: 'other',
                    hvostDone: false,
                    hvostSteps: { desire: true, priceReaction: false },
                    fiveKAnalysis: 'Коллеги — не выяснено',
                },
            },
        ]);

        const dataset = await service.collect(
            'alfacentr.bitrix24.ru',
            FROM,
            TO,
        );

        expect(dataset.presentations).toHaveLength(1);
        expect(dataset.presentations[0].callType).toBe('other');
        expect(dataset.presentations[0].hvostSteps?.desire).toBe(true);
    });

    it('звонок без методологического разбора на лист презентаций не попадает', async () => {
        const { service, aiService } = makeDataDeps();
        aiService.findByTranscriptionIds.mockResolvedValue([
            {
                type: 'agent-analysis',
                transcription_id: '42',
                user_result: { callType: 'cold', summary: 'холодный звонок' },
            },
        ]);

        const dataset = await service.collect(
            'alfacentr.bitrix24.ru',
            FROM,
            TO,
        );
        expect(dataset.presentations).toHaveLength(0);
    });
});

describe('CallReportExcelBuilder', () => {
    const dataset: CallReportWeeklyDataset = {
        domain: 'alfacentr.bitrix24.ru',
        from: FROM,
        to: TO,
        smartEntityTypeId: 1056,
        transcripts: [],
        presentations: [],
        rows: [
            {
                callDate: new Date('2026-08-26T08:25:00Z'),
                managerId: 7,
                durationMin: 14,
                durationSec: 840,
                smartItemId: 206,
                companyId: 33,
                contactId: 44,
                hvostSteps: { desire: true, offered: false, priceReaction: null },
                fiveKItems: { client: true, colleagues: false },
                entityType: 'deal',
                entityId: 555,
                activityId: '101',
                analyzed: true,
                callType: 'presentation',
                productive: true,
                score: 4,
                weightedScore: 41,
                scriptCompliance: null,
                coachingPriority: 'urgent',
                interlocutorRole: 'lpr',
                specialist: 'lawyer',
                sentiment: 'neutral',
                talkRatioPct: 72,
                questionsCount: 3,
                nextStepSet: false,
                nextStep: null,
                nextStepDate: null,
                hvostDone: false,
                fiveKDone: false,
                summary: 'Презентация СПС',
                scoreExplanation: 'слабое закрытие',
                needs: 'практика по 44-ФЗ',
                productsOffered: 'СПС Гарант',
                objections: 'дорого → сравнил',
                refusalCategory: null,
                riskFlags: 'обещание КП',
                recommendations: 'назначить дату решения',
                employeeRecommendations: null,
                speechAnalysis: 'разбор речи',
                hvostAnalysis: 'хвост не пройден',
                fiveKAnalysis: '5К не закрыто',
                reportComparison: 'менеджер приукрасил',
                // Больше лимита ячейки Excel — должен быть обрезан с пометкой.
                transcript: 'т'.repeat(40_000),
            },
        ],
        sections: [
            {
                callDate: new Date('2026-08-26T08:25:00Z'),
                managerId: 7,
                activityId: '101',
                callType: 'presentation',
                section: 'GREETING',
                relevance: 100,
                score: 5,
                analysis: 'разбор приветствия',
                advice: 'быстрый вход',
            },
        ],
    };

    it('строит книгу: все листы, закреплённая шапка, автофильтр, ширины', async () => {
        const buffer = await new CallReportExcelBuilder().build(dataset);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
        expect(workbook.worksheets.map(sheet => sheet.name)).toEqual([
            'Сводка',
            'Звонки',
            'Звонки от 5 минут',
            'Презентации (хвост и 5К)',
            'Разделы разговора',
            'Транскрипции',
        ]);

        const calls = workbook.getWorksheet('Звонки');
        expect(calls).toBeDefined();
        // Шапка закреплена, чтобы не терялась при прокрутке.
        expect(calls?.views?.[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
        expect(calls?.autoFilter).toBeDefined();
        // Ширины заданы явно — таблица открывается «ровной».
        expect(calls?.getColumn(1).width).toBeGreaterThan(0);
        // Фиксированная высота строк данных.
        expect(calls?.getRow(2).height).toBe(30);
        expect(calls?.getRow(2).getCell(1).value).toBeInstanceOf(Date);
    });

    it('текст длиннее лимита ячейки обрезается с явной пометкой', async () => {
        const buffer = await new CallReportExcelBuilder().build(dataset);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
        const calls = workbook.getWorksheet('Звонки');
        const headers = (calls?.getRow(1).values as string[]) ?? [];
        const transcriptIndex = headers.indexOf('Транскрипт');
        const value = calls?.getRow(2).getCell(transcriptIndex).value as string;
        expect(value.length).toBeLessThanOrEqual(32_100);
        expect(value).toContain('текст обрезан под лимит ячейки Excel');
    });

    it('связи CRM — кликабельные гиперссылки на карточки портала', async () => {
        const buffer = await new CallReportExcelBuilder().build(dataset);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
        const calls = workbook.getWorksheet('Звонки');
        const headers = (calls?.getRow(1).values as string[]) ?? [];

        const entityCell = calls
            ?.getRow(2)
            .getCell(headers.indexOf('Объект CRM')).value as {
            text?: string;
            hyperlink?: string;
        };
        expect(entityCell.hyperlink).toBe(
            'https://alfacentr.bitrix24.ru/crm/deal/details/555/',
        );
        expect(entityCell.text).toBe('Сделка 555');

        const smartCell = calls
            ?.getRow(2)
            .getCell(headers.indexOf('Карточка разбора')).value as {
            hyperlink?: string;
        };
        expect(smartCell.hyperlink).toBe(
            'https://alfacentr.bitrix24.ru/crm/type/1056/details/206/',
        );

        const companyCell = calls
            ?.getRow(2)
            .getCell(headers.indexOf('Компания')).value as {
            hyperlink?: string;
        };
        expect(companyCell.hyperlink).toBe(
            'https://alfacentr.bitrix24.ru/crm/company/details/33/',
        );
    });

    it('лист «Звонки от 5 минут» отбирает только длинные разговоры', async () => {
        const shortCall = {
            ...dataset.rows[0],
            durationSec: 120,
            durationMin: 2,
            activityId: '102',
        };
        const buffer = await new CallReportExcelBuilder().build({
            ...dataset,
            rows: [...dataset.rows, shortCall],
        });
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

        expect(workbook.getWorksheet('Звонки')?.rowCount).toBe(3);
        // Короткий звонок на лист длинных не попал.
        expect(workbook.getWorksheet('Звонки от 5 минут')?.rowCount).toBe(2);
    });
});

describe('SendCallReportWeeklyUseCase', () => {
    const makeDeps = (options?: {
        recipients?: number[];
        calls?: number;
        delivery?: 'chat' | 'task' | 'notify';
    }) => {
        const dataset: CallReportWeeklyDataset = {
            domain: 'alfacentr.bitrix24.ru',
            from: FROM,
            to: TO,
            smartEntityTypeId: 1056,
            transcripts: [],
            presentations: [],
            rows: Array.from(
                { length: options?.calls ?? 1 },
                () => ({}) as CallReportWeeklyDataset['rows'][number],
            ),
            sections: [],
        };
        const bitrix = {
            disk: {
                folder: { uploadfile: jest.fn() },
                storage: { uploadfile: jest.fn(), getlist: jest.fn() },
            },
            imNotify: { systemAdd: jest.fn().mockResolvedValue(1) },
        };
        const pbxService = { init: jest.fn().mockResolvedValue({ bitrix }) };
        const settings = {
            getByDomain: jest.fn().mockResolvedValue({
                weeklyReportRecipients: options?.recipients ?? [12, 25],
                weeklyReportFolderId: 4321,
                weeklyReportDelivery: options?.delivery ?? null,
            }),
        };
        const data = { collect: jest.fn().mockResolvedValue(dataset) };
        const excel = {
            build: jest.fn().mockResolvedValue(Buffer.from('xlsx')),
        };
        const recipients = options?.recipients ?? [12, 25];
        const delivery = {
            sendToChat: jest.fn().mockResolvedValue(recipients),
            createTask: jest.fn().mockResolvedValue(777),
            upload: jest.fn().mockResolvedValue({
                fileId: 8891,
                fileUrl: 'https://alfacentr.bitrix24.ru/disk/showFile/8891/',
            }),
            notify: jest
                .fn()
                .mockResolvedValue(options?.recipients ?? [12, 25]),
        };
        const useCase = new SendCallReportWeeklyUseCase(
            pbxService as never,
            settings as never,
            data as never,
            excel as never,
            delivery as never,
        );
        return { useCase, delivery, excel, data };
    };

    it('строит файл и кладёт его в папку из настроек портала', async () => {
        const { useCase, delivery } = makeDeps();
        const result = await useCase.execute('alfacentr.bitrix24.ru');

        expect(result.calls).toBe(1);
        expect(result.fileId).toBe(8891);
        expect(result.notifiedUserIds).toEqual([12, 25]);
        // Папка группы из настроек портала.
        expect(delivery.upload).toHaveBeenCalledWith(
            expect.anything(),
            expect.stringMatching(/^call-report_alfacentr_.*\.xlsx$/),
            expect.any(Buffer),
            4321,
        );
        const message = (delivery.sendToChat.mock.calls[0] as unknown[])[4];
        expect(String(message)).toContain('Недельный отчёт по звонкам');
    });

    it('без звонков за период файл не создаётся и никто не беспокоится', async () => {
        const { useCase, delivery, excel } = makeDeps({ calls: 0 });
        const result = await useCase.execute('alfacentr.bitrix24.ru');

        expect(result.calls).toBe(0);
        expect(result.fileId).toBeNull();
        expect(excel.build).not.toHaveBeenCalled();
        expect(delivery.upload).not.toHaveBeenCalled();
        expect(delivery.notify).not.toHaveBeenCalled();
    });

    it('пустой список получателей: файл кладётся на Диск, уведомлений нет', async () => {
        const { useCase, delivery } = makeDeps({ recipients: [] });
        const result = await useCase.execute('alfacentr.bitrix24.ru');

        expect(delivery.upload).toHaveBeenCalled();
        expect(delivery.notify).not.toHaveBeenCalled();
        expect(result.notifiedUserIds).toEqual([]);
    });

    it('по умолчанию файл уходит СООБЩЕНИЕМ В ЧАТ каждому получателю', async () => {
        const { useCase, delivery } = makeDeps();
        const result = await useCase.execute('alfacentr.bitrix24.ru');

        expect(delivery.sendToChat).toHaveBeenCalledWith(
            expect.anything(),
            [12, 25],
            expect.stringMatching(/\.xlsx$/),
            expect.any(Buffer),
            expect.stringContaining('Недельный отчёт по звонкам'),
        );
        expect(delivery.notify).not.toHaveBeenCalled();
        expect(result.notifiedUserIds).toEqual([12, 25]);
    });

    it('чат не сработал для части получателей — им уходит уведомление со ссылкой', async () => {
        const { useCase, delivery } = makeDeps();
        delivery.sendToChat.mockResolvedValue([12]);
        delivery.notify.mockResolvedValue([25]);

        const result = await useCase.execute('alfacentr.bitrix24.ru');

        expect(delivery.notify).toHaveBeenCalledWith(
            expect.anything(),
            [25],
            expect.any(String),
        );
        expect(result.notifiedUserIds).toEqual([12, 25]);
    });

    it('режим task: создаётся задача с файлом с Диска', async () => {
        const { useCase, delivery } = makeDeps({ delivery: 'task' });
        const result = await useCase.execute('alfacentr.bitrix24.ru');

        expect(delivery.createTask).toHaveBeenCalledWith(
            expect.anything(),
            [12, 25],
            expect.stringContaining('Недельный отчёт по звонкам'),
            expect.any(String),
            8891,
        );
        expect(delivery.sendToChat).not.toHaveBeenCalled();
        expect(result.notifiedUserIds).toEqual([12, 25]);
    });

    it('режим notify: только уведомление со ссылкой', async () => {
        const { useCase, delivery } = makeDeps({ delivery: 'notify' });
        await useCase.execute('alfacentr.bitrix24.ru');

        expect(delivery.notify).toHaveBeenCalled();
        expect(delivery.sendToChat).not.toHaveBeenCalled();
        expect(delivery.createTask).not.toHaveBeenCalled();
    });

    it('ручная отправка: получатели из запроса перекрывают настройки портала', async () => {
        const { useCase, delivery } = makeDeps();
        const result = await useCase.execute('alfacentr.bitrix24.ru', {
            recipients: [622],
        });

        // Настройки портала (12, 25) не участвуют — файл ушёл только 622.
        expect(delivery.sendToChat).toHaveBeenCalledWith(
            expect.anything(),
            [622],
            expect.any(String),
            expect.any(Buffer),
            expect.any(String),
        );
        expect(result.delivery).toBe('chat');
    });

    it('ручная отправка: способ доставки из запроса перекрывает настройки', async () => {
        const { useCase, delivery } = makeDeps({ delivery: 'chat' });
        await useCase.execute('alfacentr.bitrix24.ru', {
            recipients: [622],
            delivery: 'notify',
        });

        expect(delivery.notify).toHaveBeenCalledWith(
            expect.anything(),
            [622],
            expect.any(String),
        );
        expect(delivery.sendToChat).not.toHaveBeenCalled();
    });

    it('пустой список в запросе не отменяет получателей из настроек', async () => {
        const { useCase, delivery } = makeDeps();
        await useCase.execute('alfacentr.bitrix24.ru', { recipients: [] });

        expect(delivery.sendToChat).toHaveBeenCalledWith(
            expect.anything(),
            [12, 25],
            expect.any(String),
            expect.any(Buffer),
            expect.any(String),
        );
    });
});

describe('CallReportWeeklyDeliveryService', () => {
    it('сбой загрузки файла не роняет отчёт (fail-open)', async () => {
        const service = new CallReportWeeklyDeliveryService();
        const bitrix = {
            disk: {
                folder: {
                    uploadfile: jest
                        .fn()
                        .mockRejectedValue(new Error('ACCESS_DENIED')),
                },
            },
        };
        const result = await service.upload(
            bitrix as never,
            'report.xlsx',
            Buffer.from('x'),
            4321,
        );
        expect(result).toEqual({ fileId: null, fileUrl: null });
    });

    it('падение уведомления одному получателю не мешает остальным', async () => {
        const service = new CallReportWeeklyDeliveryService();
        const bitrix = {
            imNotify: {
                systemAdd: jest
                    .fn()
                    .mockRejectedValueOnce(new Error('user not found'))
                    .mockResolvedValue(1),
            },
        };
        const delivered = await service.notify(
            bitrix as never,
            [12, 25],
            'текст',
        );
        expect(delivered).toEqual([25]);
    });
});
