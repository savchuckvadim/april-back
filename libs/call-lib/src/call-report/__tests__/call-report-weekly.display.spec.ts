import * as ExcelJS from 'exceljs';
import { CallReportExcelBuilder } from '../weekly-report/call-report-excel.builder';
import { CallReportWeeklyDataService } from '../weekly-report/call-report-weekly-data.service';
import { CallReportWeeklyDataset } from '../weekly-report/call-report-weekly.types';

/**
 * Недельный Excel по правилам показа разбора (решения владельца
 * 18.11.2026): процент соответствия скрипту — только при скрипте в разборе,
 * чек-листы «Хвост» и 5К — только у презентации.
 */
const FROM = new Date('2026-11-09T00:00:00Z');
const TO = new Date('2026-11-16T00:00:00Z');

const CALL_ROW = {
    id: '42',
    domain: 'gsr.bitrix24.ru',
    activityId: '101',
    callStartedAt: new Date('2026-11-12T08:25:00Z'),
    status: 'done',
    text: 'расшифровка',
    durationSec: '840',
    entityType: 'deal',
    entityId: '555',
    userId: '7',
    createdAt: new Date('2026-11-12T08:40:00Z'),
};

const collect = async (
    analysis: Record<string, unknown>,
): Promise<CallReportWeeklyDataset> => {
    const service = new CallReportWeeklyDataService(
        { findDoneInPeriod: jest.fn().mockResolvedValue([CALL_ROW]) } as never,
        {
            findByTranscriptionIds: jest.fn().mockResolvedValue([
                {
                    type: 'agent-analysis',
                    transcription_id: '42',
                    report_item_id: '206',
                    user_result: analysis,
                },
            ]),
        } as never,
        {
            resolve: jest.fn().mockResolvedValue({ entityTypeId: 1056 }),
        } as never,
    );
    return service.collect('gsr.bitrix24.ru', FROM, TO);
};

const callHeaders = async (
    dataset: CallReportWeeklyDataset,
): Promise<string[]> => {
    const buffer = await new CallReportExcelBuilder().build(dataset);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const values = workbook.getWorksheet('Звонки')?.getRow(1).values;
    return Array.isArray(values)
        ? values.filter((value): value is string => typeof value === 'string')
        : [];
};

describe('недельный отчёт: соответствие скрипту', () => {
    it('скрипт был в разборе — процент в строке и столбец «Скрипт, %» на месте', async () => {
        const dataset = await collect({
            callType: 'cold',
            scriptIncluded: true,
            scriptCompliance: 75,
        });
        expect(dataset.rows[0].scriptCompliance).toBe(75);
        expect(await callHeaders(dataset)).toContain('Скрипт, %');
    });

    it('скрипта не было — процента нет, столбца нет', async () => {
        const dataset = await collect({
            callType: 'cold',
            scriptIncluded: false,
            scriptCompliance: 40,
        });
        expect(dataset.rows[0].scriptCompliance).toBeNull();
        expect(await callHeaders(dataset)).not.toContain('Скрипт, %');
    });

    it('старый разбор без признака — процент не показывается', async () => {
        const dataset = await collect({
            callType: 'cold',
            scriptCompliance: 40,
        });
        expect(dataset.rows[0].scriptCompliance).toBeNull();
    });
});

const CHECKLISTS = {
    hvostDone: true,
    hvostSteps: { desire: true, offered: true },
    hvostAnalysis: '1. ЖЕЛАНИЕ РАБОТАТЬ — ✓',
    fiveKDone: false,
    fiveKItems: { client: true, colleagues: false },
    fiveKAnalysis: 'КОЛЛЕГИ — не выяснено',
};

describe('недельный отчёт: чек-листы «Хвост» и 5К', () => {
    it('презентация — чек-листы в строке и на листе презентаций', async () => {
        const dataset = await collect({
            callType: 'presentation',
            ...CHECKLISTS,
        });
        expect(dataset.rows[0]).toMatchObject({
            hvostDone: true,
            fiveKDone: false,
            hvostAnalysis: '1. ЖЕЛАНИЕ РАБОТАТЬ — ✓',
        });
        expect(dataset.presentations).toHaveLength(1);
    });

    it('звонок по решению (старый разбор с чек-листами) — пусто, на лист презентаций не попадает', async () => {
        const dataset = await collect({ callType: 'decision', ...CHECKLISTS });
        expect(dataset.rows[0]).toMatchObject({
            hvostDone: null,
            fiveKDone: null,
            hvostSteps: null,
            fiveKItems: null,
            hvostAnalysis: null,
            fiveKAnalysis: null,
        });
        expect(dataset.presentations).toHaveLength(0);
    });
});
