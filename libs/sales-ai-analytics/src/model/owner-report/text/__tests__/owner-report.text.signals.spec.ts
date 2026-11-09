import type { OwnerReportQualityLink } from '../../owner-report.quality-link';
import { pctText } from '../owner-report.format';
import {
    buildQualityLinkText,
    reactivationSourcesNote,
} from '../owner-report.text.signals';

const link = (
    overrides: Partial<OwnerReportQualityLink>,
): OwnerReportQualityLink => ({
    status: 'preliminary',
    monthKey: '2026-10',
    presentations: 48,
    events: 19,
    managers: 6,
    sRef: 6.5,
    pRef: 0.404,
    plusStep: { p: 0.574, low: 0.413, high: 0.721 },
    presentationsLeft: 70,
    monthsLeft: 2.3,
    ...overrides,
});

describe('buildQualityLinkText — связь качества показа и продаж словами', () => {
    it('без снапшота — «данных ещё нет»; без оценки — сколько показов и сколько ещё нужно', () => {
        expect(buildQualityLinkText(null)).toEqual({
            status: 'none',
            lines: [
                'Связь качества показа и продаж пока не оценена: данных о показах с известным исходом ещё нет. Уточняется ежемесячно.',
            ],
        });
        expect(
            buildQualityLinkText(
                link({
                    status: 'none',
                    sRef: null,
                    pRef: null,
                    plusStep: null,
                }),
            ).lines,
        ).toEqual([
            'Связь качества показа и продаж пока не оценена: показов с известным исходом — 48, до первой оценки нужно ещё ≈ 70 показов (около 3 месяцев при текущем темпе). Уточняется ежемесячно.',
        ]);
        expect(
            buildQualityLinkText(
                link({
                    status: 'none',
                    plusStep: null,
                    presentationsLeft: null,
                    monthsLeft: null,
                }),
            ).lines[0],
        ).toBe(
            'Связь качества показа и продаж пока не оценена: показов с известным исходом — 48. Уточняется ежемесячно.',
        );
    });

    it('предварительная: выборка, опорная точка, +2 балла, широкий разброс и сколько осталось', () => {
        const text = buildQualityLinkText(link({}));
        expect(text.status).toBe('preliminary');
        expect(text.lines).toEqual([
            `Предварительная оценка по 48 показам у 6 сотрудников (уточняется ежемесячно): при качестве показа 6,5 из 10 счёт или КП следуют в ${pctText(40)} случаев, при качестве на 2 балла выше — около ${pctText(57)}.`,
            `Разброс пока широкий: от ${pctText(41)} до ${pctText(72)}; до устойчивой оценки нужно ещё ≈ 70 показов.`,
        ]);
    });

    it('подтверждённая: одна фраза «по данным портала» с диапазоном', () => {
        const text = buildQualityLinkText(
            link({
                status: 'confirmed',
                sRef: 7,
                presentations: 1,
                managers: 3,
            }),
        );
        expect(text.lines).toEqual([
            `По данным портала (1 показу у 3 сотрудников): при качестве показа 7 из 10 счёт или КП следуют в ${pctText(40)} случаев, при качестве на 2 балла выше — ${pctText(57)} (от ${pctText(41)} до ${pctText(72)}).`,
        ]);
    });
});

describe('reactivationSourcesNote — источники отказа у возвратов', () => {
    it('нет возвратов — null; только финалы — одна фраза; есть вторичные — раскладка с оговоркой', () => {
        expect(
            reactivationSourcesNote({
                calls: 0,
                bySource: { stage: 0, history: 0, fields: 0 },
            }),
        ).toBeNull();
        expect(
            reactivationSourcesNote({
                calls: 4,
                bySource: { stage: 4, history: 0, fields: 0 },
            }),
        ).toBe(
            'Возвратов ушедших и отказавших — 4 разговора, все по финалам сделок «ОП Основная»; записи «ОП История» типа «Отказ» и поля сделки дополнительных не дали.',
        );
        const note = reactivationSourcesNote({
            calls: 7,
            bySource: { stage: 4, history: 2, fields: 1 },
        });
        expect(note).toContain(
            'Возвратов ушедших и отказавших — 7 разговоров: отказ виден по финалу сделки «ОП Основная» у 4, по записи «ОП История» типа «Отказ» — у 2, по полям сделки',
        );
        expect(note).toContain('у 1.');
        expect(note).toContain('вторичный источник');
    });
});
