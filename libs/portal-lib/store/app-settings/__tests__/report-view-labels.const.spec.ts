import { PBX_SALES_USER_PLAN_FIELDS } from '@lib/portal-lib/pbx-domain/field/type/sales/user/pbx-sales-user-plan-field.type';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    type PortalAppSettingDescriptor,
} from '../portal-app-settings.schema';
import {
    isReportViewLabelKey,
    isReportViewPlanColumnCode,
    normalizeReportViewLabel,
    parseReportViewLabels,
    REPORT_VIEW_LABEL_LIMITS,
    REPORT_VIEW_LABEL_PREFIXES,
    REPORT_VIEW_PLAN_COLUMN_CODES,
    REPORT_VIEW_PLAN_COLUMN_OPTIONS,
    reportViewLabelKey,
    serializeReportViewLabels,
} from '../lib/report-view-labels.const';

/**
 * Свои названия показателей KPI-отчёта: хранятся JSON-объектом по коду
 * показателя. Разбор не падает на мусоре из админки, сборка даёт
 * стабильную строку (ключи по алфавиту).
 */
describe('свои названия показателей: ключи', () => {
    it('ключ собирается из приставки и кода показателя', () => {
        expect(
            reportViewLabelKey(
                REPORT_VIEW_LABEL_PREFIXES.event,
                'presentation_plan',
            ),
        ).toBe('ev:presentation_plan');
        expect(reportViewLabelKey(REPORT_VIEW_LABEL_PREFIXES.calling, 30)).toBe(
            'call:30',
        );
        expect(
            reportViewLabelKey(REPORT_VIEW_LABEL_PREFIXES.plan, 'calls_done'),
        ).toBe('plan:calls_done');
    });

    it('шаблон ключа: только ev/call/plan, строчная латиница, цифры и «_»', () => {
        for (const good of [
            'ev:presentation_plan',
            'call:all',
            'call:600',
            'plan:calls_over_30s',
        ]) {
            expect(`${good}:${isReportViewLabelKey(good)}`).toBe(
                `${good}:true`,
            );
        }
        for (const bad of [
            'ev:',
            'xo:call_plan',
            'EV:call_plan',
            'ev:Call_plan',
            'ev:call-plan',
            'ev:call plan',
            'call_plan',
            ' ev:call_plan',
        ]) {
            expect(`${bad}:${isReportViewLabelKey(bad)}`).toBe(`${bad}:false`);
        }
    });

    it('название: обрезаются пробелы, пусто и длиннее предела — null', () => {
        expect(normalizeReportViewLabel('  Назначенная  ')).toBe('Назначенная');
        expect(normalizeReportViewLabel('   ')).toBeNull();
        expect(normalizeReportViewLabel(42)).toBeNull();
        const max = 'я'.repeat(REPORT_VIEW_LABEL_LIMITS.nameLength);
        expect(normalizeReportViewLabel(` ${max} `)).toBe(max);
        expect(normalizeReportViewLabel(`${max}я`)).toBeNull();
    });
});

describe('parseReportViewLabels', () => {
    it('пусто, не строка, битый JSON и не объект — пустой набор', () => {
        for (const raw of [
            '',
            '   ',
            undefined,
            null,
            42,
            '{bad json',
            '[]',
            '["ev:call_plan"]',
            '"текст"',
            'null',
            '7',
        ]) {
            expect(parseReportViewLabels(raw)).toEqual({});
        }
    });

    it('ключи не по шаблону, нестроковые и пустые значения отбрасываются', () => {
        const raw = JSON.stringify({
            'ev:presentation_plan': 'Назначенная презентация',
            'xo:call_plan': 'Чужая приставка',
            'ev:Bad': 'Заглавные',
            'call:30': 30,
            'call:60': null,
            'call:all': { name: 'объект' },
            'plan:calls_done': '   ',
            'plan:sales_count': 'Продажи',
        });

        expect(parseReportViewLabels(raw)).toEqual({
            'ev:presentation_plan': 'Назначенная презентация',
            'plan:sales_count': 'Продажи',
        });
    });

    it('пробелы по краям обрезаются, длиннее предела — отбрасывается', () => {
        const tooLong = 'а'.repeat(REPORT_VIEW_LABEL_LIMITS.nameLength + 1);
        const raw = JSON.stringify({
            'ev:call_plan': '  План звонков  ',
            'ev:call_done': tooLong,
        });

        expect(parseReportViewLabels(raw)).toEqual({
            'ev:call_plan': 'План звонков',
        });
    });

    it('записей не больше предела: лишние после сортировки ключей отбрасываются', () => {
        const source: Record<string, string> = {};
        for (let index = 0; index < 105; index += 1) {
            source[`ev:k${String(index).padStart(3, '0')}`] =
                `Название ${index}`;
        }

        const labels = parseReportViewLabels(JSON.stringify(source));

        expect(Object.keys(labels)).toHaveLength(
            REPORT_VIEW_LABEL_LIMITS.entries,
        );
        expect(labels['ev:k000']).toBe('Название 0');
        expect(labels['ev:k104']).toBeUndefined();
    });
});

describe('serializeReportViewLabels', () => {
    it('пустой набор — пустая строка', () => {
        expect(serializeReportViewLabels({})).toBe('');
        expect(serializeReportViewLabels({ 'ev:call_plan': '  ' })).toBe('');
    });

    it('ключи по алфавиту: порядок ввода не меняет строку', () => {
        const first = serializeReportViewLabels({
            'plan:calls_done': 'План',
            'call:30': 'От 30 с',
            'ev:presentation_plan': 'Назначенная',
        });
        const second = serializeReportViewLabels({
            'ev:presentation_plan': 'Назначенная',
            'plan:calls_done': 'План',
            'call:30': 'От 30 с',
        });

        expect(first).toBe(second);
        expect(first).toBe(
            '{"call:30":"От 30 с","ev:presentation_plan":"Назначенная","plan:calls_done":"План"}',
        );
    });

    it('при сборке та же чистка, что при разборе; разбор собранного даёт тот же набор', () => {
        const raw = serializeReportViewLabels({
            'ev:call_plan': ' Звонки в плане ',
            'bad key': 'мусор',
            'ev:call_done': '',
        });

        expect(raw).toBe('{"ev:call_plan":"Звонки в плане"}');
        expect(parseReportViewLabels(raw)).toEqual({
            'ev:call_plan': 'Звонки в плане',
        });
    });
});

describe('плановые колонки: список кодов и варианты настройки', () => {
    const kpiSales: Record<string, PortalAppSettingDescriptor> =
        PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.kpiSales];

    it('коды — существующие плановые user-поля, без финансов и эфирного времени', () => {
        const fieldCodes: readonly string[] = PBX_SALES_USER_PLAN_FIELDS.map(
            field => field.code,
        );
        for (const code of REPORT_VIEW_PLAN_COLUMN_CODES) {
            expect(fieldCodes).toContain(code);
        }
        expect(isReportViewPlanColumnCode('sales_monthly_amount')).toBe(false);
        expect(isReportViewPlanColumnCode('advance_amount')).toBe(false);
        expect(isReportViewPlanColumnCode('airtime_minutes')).toBe(false);
        expect(isReportViewPlanColumnCode('calls_done')).toBe(true);
    });

    it('варианты настройки скрытых плановых колонок — тот же список, с названиями', () => {
        const descriptor = kpiSales.reportViewPlanColumnsHidden;
        expect(descriptor?.code).toBe('report_view_plan_columns_hidden');
        expect(descriptor?.isList).toBe(true);
        expect(descriptor?.options).toBe(REPORT_VIEW_PLAN_COLUMN_OPTIONS);
        expect(
            REPORT_VIEW_PLAN_COLUMN_OPTIONS.map(option => option.code),
        ).toEqual([...REPORT_VIEW_PLAN_COLUMN_CODES]);
        expect(REPORT_VIEW_PLAN_COLUMN_OPTIONS[0]).toEqual({
            code: 'calls_done',
            name: 'План: Звонки',
        });
    });

    it('свои названия и флаги колонок планов — в схеме kpi-sales с пустыми и выключенными значениями', () => {
        expect(kpiSales.reportViewLabels).toMatchObject({
            code: 'report_view_labels',
            type: 'string',
            default: '',
        });
        for (const key of [
            'reportViewPlansEvents',
            'reportViewPlansMerged',
            'reportViewPlansCallings',
        ]) {
            expect(kpiSales[key]).toMatchObject({
                type: 'boolean',
                default: false,
            });
        }
    });
});
