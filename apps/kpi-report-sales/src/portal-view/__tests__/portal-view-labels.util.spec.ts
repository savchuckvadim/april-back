import {
    labelsChangeProblem,
    labelsSettingsPatch,
    labelsViewFromSettings,
    normalizeLabelsChange,
    parsePlanColumnsHidden,
    planColumnsChanges,
    reportViewLabelsProblem,
} from '../portal-view-labels.util';
import { changeFields, toSettingsPatch } from '../portal-view.util';
import { INDICATORS, settingValues } from './portal-view.fixtures';

const stamp = {
    updatedBy: 'Иванов Пётр',
    updatedAt: '2026-11-26T09:30:00.000Z',
};

describe('portal-view-labels.util: чтение из настроек', () => {
    it('ничего не сохранено — своих названий нет, колонки планов выключены', () => {
        expect(labelsViewFromSettings(settingValues())).toEqual({
            labels: {},
            plansEvents: false,
            plansMerged: false,
            plansCallings: false,
            planColumnsHidden: [],
        });
    });

    it('сохранённое разбирается: названия, флаги, скрытые плановые колонки', () => {
        const view = labelsViewFromSettings(
            settingValues({
                reportViewLabels:
                    '{"ev:presentation_plan":" Назначенная ","call:30":"От 30 с"}',
                reportViewPlansEvents: true,
                reportViewPlansMerged: false,
                reportViewPlansCallings: true,
                reportViewPlanColumnsHidden: 'sales_count, calls_done',
            }),
        );

        expect(view).toEqual({
            labels: {
                'call:30': 'От 30 с',
                'ev:presentation_plan': 'Назначенная',
            },
            plansEvents: true,
            plansMerged: false,
            plansCallings: true,
            planColumnsHidden: ['sales_count', 'calls_done'],
        });
    });

    it('битый JSON — пустые названия; флаг чужого типа — выключен', () => {
        const view = labelsViewFromSettings(
            settingValues({
                reportViewLabels: '{"ev:call_plan":',
                reportViewPlansEvents: 'да' as unknown as boolean,
            }),
        );

        expect(view.labels).toEqual({});
        expect(view.plansEvents).toBe(false);
    });

    it('скрытые плановые колонки: только известные коды, без дублей', () => {
        expect(
            parsePlanColumnsHidden(
                'sales_count,ghost,sales_count, airtime_minutes ,calls_over_30s',
            ),
        ).toEqual(['sales_count', 'calls_over_30s']);
        expect(parsePlanColumnsHidden(undefined)).toEqual([]);
    });
});

describe('portal-view-labels.util: проверка тела запроса', () => {
    it('годится: объект с ключами по шаблону и строками до предела; пустая строка тоже', () => {
        expect(
            reportViewLabelsProblem({
                'ev:presentation_plan': 'Назначенная',
                'call:30': '',
                'plan:calls_done': ` ${'я'.repeat(60)} `,
            }),
        ).toBeNull();
        expect(reportViewLabelsProblem({})).toBeNull();
    });

    it('не объект, нестроковое значение — labelsShape', () => {
        for (const value of [null, 'текст', 42, ['ev:call_plan']]) {
            expect(reportViewLabelsProblem(value)).toBe('labelsShape');
        }
        expect(reportViewLabelsProblem({ 'ev:call_plan': 5 })).toBe(
            'labelsShape',
        );
        expect(reportViewLabelsProblem({ 'ev:call_plan': { name: 'x' } })).toBe(
            'labelsShape',
        );
    });

    it('ключ не по шаблону, длинное название, много записей', () => {
        expect(reportViewLabelsProblem({ 'xo:call_plan': 'x' })).toBe(
            'labelKey',
        );
        expect(
            reportViewLabelsProblem({ 'ev:call_plan': 'я'.repeat(61) }),
        ).toBe('labelTooLong');
        const many = Object.fromEntries(
            Array.from({ length: 101 }, (_, index) => [`ev:k${index}`, 'x']),
        );
        expect(reportViewLabelsProblem(many)).toBe('tooManyLabels');
    });
});

describe('portal-view-labels.util: изменения при сохранении', () => {
    it('normalizeLabelsChange: пробелы обрезаны, пустое значение убирает ключ', () => {
        expect(
            normalizeLabelsChange({
                'ev:presentation_done': '  Проведённая  ',
                'call:30': '',
                'plan:presentations_done': '   ',
            }),
        ).toEqual({ 'ev:presentation_done': 'Проведённая' });
        expect(normalizeLabelsChange({})).toEqual({});
    });

    it('labelsChangeProblem: ключ не из каталога портала — unknownLabel', () => {
        expect(
            labelsChangeProblem({ 'ev:presentation_done': 'Да' }, INDICATORS),
        ).toBeNull();
        expect(labelsChangeProblem({}, INDICATORS)).toBeNull();
        expect(
            labelsChangeProblem(
                { 'ev:ev_invoice_act_send': 'Счёт' },
                INDICATORS,
            ),
        ).toBe('unknownLabel');
        expect(labelsChangeProblem({ 'ev:call_plan': 'x' }, [])).toBe(
            'unknownLabel',
        );
    });

    it('labelsChangeProblem: длина и число записей проверяются и здесь', () => {
        expect(
            labelsChangeProblem(
                { 'ev:presentation_done': 'я'.repeat(61) },
                INDICATORS,
            ),
        ).toBe('labelTooLong');
        const many = Object.fromEntries(
            Array.from({ length: 101 }, (_, index) => [`ev:k${index}`, 'x']),
        );
        expect(labelsChangeProblem(many, INDICATORS)).toBe('tooManyLabels');
    });

    it('planColumnsChanges: только переданные поля; список без дублей', () => {
        expect(planColumnsChanges({})).toEqual({});
        expect(
            planColumnsChanges({
                plansMerged: false,
                planColumnsHidden: ['sales_count', 'sales_count', 'calls_done'],
            }),
        ).toEqual({
            plansMerged: false,
            planColumnsHidden: ['sales_count', 'calls_done'],
        });
    });

    it('labelsSettingsPatch: названия — JSON с ключами по алфавиту, пустой набор — пустая строка', () => {
        expect(
            labelsSettingsPatch({
                labels: { 'plan:calls_done': 'План', 'call:30': 'От 30 с' },
            }),
        ).toEqual({
            reportViewLabels: '{"call:30":"От 30 с","plan:calls_done":"План"}',
        });
        expect(labelsSettingsPatch({ labels: {} })).toEqual({
            reportViewLabels: '',
        });
        expect(labelsSettingsPatch({})).toEqual({});
    });

    it('toSettingsPatch: флаги и список колонок планов уходят в свои ключи', () => {
        expect(
            toSettingsPatch(
                {
                    plansEvents: true,
                    plansMerged: false,
                    plansCallings: true,
                    planColumnsHidden: ['sales_count', 'calls_over_60s'],
                },
                stamp,
            ),
        ).toEqual({
            reportViewPlansEvents: true,
            reportViewPlansMerged: false,
            reportViewPlansCallings: true,
            reportViewPlanColumnsHidden: 'sales_count,calls_over_60s',
            reportViewUpdatedBy: 'Иванов Пётр',
            reportViewUpdatedAt: '2026-11-26T09:30:00.000Z',
        });
        expect(toSettingsPatch({ planColumnsHidden: [] }, stamp)).toEqual(
            expect.objectContaining({ reportViewPlanColumnsHidden: '' }),
        );
    });

    it('журнал «кто менял»: подписи новых полей', () => {
        expect(
            changeFields({
                labels: {},
                plansEvents: true,
                plansMerged: true,
                plansCallings: false,
                planColumnsHidden: [],
            }),
        ).toEqual([
            'названия показателей',
            'колонки планов в событиях',
            'колонки планов в объединённом отчёте',
            'колонки планов в звонках',
            'какие планы колонками',
        ]);
    });
});
