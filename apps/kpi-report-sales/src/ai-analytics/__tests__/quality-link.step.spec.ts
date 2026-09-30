import 'reflect-metadata';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AI_QUALITY_LINK_REASONS,
    logit,
    type BetaSample,
} from '@lib/sales-ai-analytics';
import {
    AI_QUALITY_LINK_SECTION_SCALE_PREFIX,
    AI_QUALITY_LINK_SKIP_REASONS,
    AI_QUALITY_LINK_STEP_CODE,
    AI_QUALITY_LINK_STEP_RHYTHMS,
} from '../constants/ai-quality-link.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import { portalRangeUtc } from '../domain/loaders/period.util';
import { contentInputsHashOf } from '../store/snapshot-serialize.util';
import type { QualityLinkBusEntry } from '../steps/quality-link.step';
import {
    QL_MONTH,
    QL_PREVIOUS_MONTH,
    goldenReport,
    portalModelPayload,
    syntheticPortal,
} from './fixtures/quality-link.fixture';
import {
    EASY_GATE,
    busWith,
    harness,
    monthly,
    written,
} from './fixtures/quality-link-step.fixture';

/**
 * Месячный шаг оценки связи «качество → ближний исход» (Фаза 4, П15/П20):
 * ритмы, пропуск при пустом ростере, `insufficient` без истории и без
 * звонков, окно звонков, гистерезис гейта по снапшоту прошлого месяца,
 * запись с ключом месяца, шина, надёжность формы и идемпотентность.
 */

describe('QualityLinkStep — месячная оценка связи качества', () => {
    it('код и ритмы monthly/backfill', () => {
        const { step } = harness();
        expect(step.code).toBe(AI_QUALITY_LINK_STEP_CODE);
        expect(step.rhythms).toEqual(AI_QUALITY_LINK_STEP_RHYTHMS);
        expect([...step.rhythms]).toEqual(['monthly', 'backfill']);
    });

    it('префикс шкал разделов совпадает с отчётом согласия event-sales', () => {
        expect(AI_QUALITY_LINK_SECTION_SCALE_PREFIX).toBe('section_');
    });

    it('пустой ростер — пропуск, ничего не читается и не пишется', async () => {
        const h = harness();
        const result = await h.step.run(monthly({ managerIds: [] }), busWith());
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_QUALITY_LINK_SKIP_REASONS.rosterEmpty);
        expect(h.loadLite).not.toHaveBeenCalled();
        expect(h.upsert).not.toHaveBeenCalled();
    });

    it('нет эпизодов — снапшот insufficient, серия обнулена, звонки не грузятся', async () => {
        const h = harness({ previousStreak: 1 });
        const bus = busWith([]);
        const result = await h.step.run(monthly(), bus);
        expect(result.status).toBe('ok');
        expect(h.loadLite).not.toHaveBeenCalled();
        const envelope = written(h.upsert);
        expect(envelope.payload.status).toBe('insufficient');
        expect(envelope.payload.reasons[0]).toBe(
            AI_QUALITY_LINK_REASONS.noHistory,
        );
        expect(envelope.payload.gate.streak).toBe(0);
        expect(envelope.payload.pooled).toBeNull();
        expect(envelope.payload.curve).toEqual([]);
        expect(envelope.payload.countdown).toBeNull();
        expect(bus.get<BetaSample>(AI_PIPELINE_BUS_KEYS.betaSample)?.n).toBe(0);
        expect(
            bus.get<QualityLinkBusEntry>(AI_PIPELINE_BUS_KEYS.qualityLink)
                ?.payload.status,
        ).toBe('insufficient');
    });

    it('звонки только чужих менеджеров — insufficient с причиной «нет звонков»', async () => {
        const h = harness();
        await h.step.run(monthly({ managerIds: [999] }), busWith());
        expect(h.loadRefs).not.toHaveBeenCalled();
        expect(written(h.upsert).payload.reasons[0]).toBe(
            AI_QUALITY_LINK_REASONS.noCalls,
        );
    });

    it('событий мало для правила EPV — insufficient «выборка мала», но счётчик до оценки есть', async () => {
        const small = syntheticPortal({ perManager: 2, seed: 7 });
        const h = harness({ rows: small.rows, refs: small.refs });
        await h.step.run(monthly(), busWith(small.episodes));
        const payload = written(h.upsert).payload;
        expect(payload.status).toBe('insufficient');
        expect(payload.reasons[0]).toBe(AI_QUALITY_LINK_REASONS.sampleSmall);
        expect(payload.sample.n).toBe(16);
        expect(payload.pooled).toBeNull();
        expect(payload.gate.passedNow).toBe(false);
        expect(payload.countdown?.presentationsLeft).toBeGreaterThan(0);
    });

    it('звонки за 12 месяцев окна в границах суток портала', async () => {
        const h = harness();
        await h.step.run(monthly(), busWith());
        const range = portalRangeUtc(
            '2025-10-01',
            '2026-09-30',
            'Europe/Moscow',
        );
        expect(h.loadLite).toHaveBeenCalledWith(
            expect.objectContaining({
                domain: 'a.bitrix24.ru',
                from: range.from.toISOString(),
                to: range.to.toISOString(),
            }),
        );
    });

    it('данные есть — оценка, калибровка, кривая и счётчик; запись с ключом месяца', async () => {
        const h = harness();
        const bus = busWith();
        const result = await h.step.run(monthly(), bus);
        expect(result.status).toBe('ok');
        expect(result.written).toBe(1);
        const envelope = written(h.upsert);
        expect(envelope).toMatchObject({
            domain: 'a.bitrix24.ru',
            type: AI_ANALYTICS_SNAPSHOT_TYPE.qualityLink,
            periodKey: QL_MONTH,
            managerId: null,
            calcVersion: 'sam-1.0.0',
            paramsVersion: 'pv-1',
            // Сигнатура — хэш прогона плюс содержимое оценки.
            inputsHash: contentInputsHashOf('hash-1', envelope.payload),
        });
        const payload = envelope.payload;
        expect(payload.monthKey).toBe(QL_MONTH);
        expect(payload.sample.n).toBeGreaterThan(400);
        expect(payload.sample.toMonth).toBe(QL_MONTH);
        expect(payload.pooled?.value).toBeGreaterThan(0.2);
        expect(payload.within).not.toBeNull();
        expect(payload.calibration.slope).not.toBeNull();
        expect(payload.curve).toHaveLength(10);
        expect(payload.sRef).toBe(7);
        expect(payload.pRef).not.toBeNull();
        expect(payload.gate.months).toBe(2);
        expect(payload.meta.modelSnapshotId).toBe('model-8');
        expect(payload.reliability.r).toBeNull();
        expect(bus.get<BetaSample>(AI_PIPELINE_BUS_KEYS.betaSample)?.n).toBe(
            payload.sample.n,
        );
        expect(
            bus.get<QualityLinkBusEntry>(AI_PIPELINE_BUS_KEYS.qualityLink),
        ).toEqual({ id: 'ql-1', payload });
    });

    it('гистерезис: серия из снапшота ПРОШЛОГО месяца, 2 подряд → published', async () => {
        const first = harness();
        await first.step.run(monthly({ registry: EASY_GATE }), busWith());
        expect(first.findByKeys).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            AI_ANALYTICS_SNAPSHOT_TYPE.qualityLink,
            {
                periodKeys: [QL_PREVIOUS_MONTH],
                managerIds: [null],
                latestOnly: true,
            },
        );
        const once = written(first.upsert).payload;
        expect(once.gate.passedNow).toBe(true);
        expect(once.gate.streak).toBe(1);
        expect(once.status).toBe('estimated');
        expect(once.countdown).not.toBeNull();

        const second = harness({ previousStreak: once.gate.streak });
        await second.step.run(monthly({ registry: EASY_GATE }), busWith());
        const twice = written(second.upsert).payload;
        expect(twice.gate.streak).toBe(2);
        expect(twice.gate.published).toBe(true);
        expect(twice.status).toBe('published');
        expect(twice.countdown).toBeNull();
    });

    it('протечка меток времени выше порога — гейт не пройден, серия 0', async () => {
        const h = harness({ previousStreak: 3 });
        await h.step.run(
            monthly({ registry: EASY_GATE }),
            busWith(undefined, { n: 100, leaked: 20, sharePct: 20 }),
        );
        const payload = written(h.upsert).payload;
        expect(payload.gate.timestampLeakOk).toBe(false);
        expect(payload.reasons).toContain('timestamp-leak');
        expect(payload.gate.streak).toBe(0);
        expect(payload.status).toBe('estimated');
    });

    it('надёжность формы — среднее ICC шкал разделов формы из отчёта согласия', async () => {
        const h = harness({
            golden: goldenReport([
                { code: 'section_GREETING', icc21: 0.8 },
                { code: 'section_NEEDS', icc21: 0.6 },
                { code: 'section_OBJECTIONS', icc21: 0.1 },
                { code: 'score', icc21: 0.9 },
            ]),
        });
        await h.step.run(monthly(), busWith());
        const payload = written(h.upsert).payload;
        expect(payload.reliability.r).toBeCloseTo(0.7, 10);
        expect(payload.reliability.pooled).not.toBeNull();
        expect(payload.reliability.rBetween).not.toBeNull();
    });

    it('оффсет — логит нормы «презентация → КП» модели прошлого месяца', async () => {
        const h = harness({
            model: { id: 'model-8', payload: portalModelPayload(0.6) },
        });
        const bus = busWith();
        await h.step.run(monthly(), bus);
        expect(h.latestModel).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            QL_PREVIOUS_MONTH,
        );
        const sample = bus.get<BetaSample>(AI_PIPELINE_BUS_KEYS.betaSample);
        expect(sample?.rows[0]?.offset).toBeCloseTo(logit(0.6), 12);
    });

    it('модели нет — оффсет 0, S_ref — среднее выборки, modelSnapshotId null', async () => {
        const h = harness({ model: null });
        const bus = busWith();
        await h.step.run(monthly(), bus);
        const payload = written(h.upsert).payload;
        const sample = bus.get<BetaSample>(AI_PIPELINE_BUS_KEYS.betaSample);
        expect(sample?.rows.every(row => row.offset === 0)).toBe(true);
        expect(payload.meta.modelSnapshotId).toBeNull();
        expect(payload.sRef).toBeCloseTo(sample?.sBarPortal ?? 0, 12);
    });

    it('идемпотентен: повтор прогона даёт ту же нагрузку и тот же ключ; force из контекста', async () => {
        const h = harness({ previousStreak: 1 });
        await h.step.run(monthly(), busWith());
        await h.step.run(monthly({ forceRefresh: true }), busWith());
        const [first, second] = h.upsert.mock.calls;
        expect(second[0].payload).toEqual(first[0].payload);
        expect(second[0].periodKey).toBe(first[0].periodKey);
        expect(first[1]).toEqual({ force: false });
        expect(second[1]).toEqual({ force: true });
    });

    it('повтор с тем же хэшем прогона, но другой выборкой — другая сигнатура записи', async () => {
        const full = harness();
        await full.step.run(monthly(), busWith());
        const small = syntheticPortal({ perManager: 2, seed: 7 });
        const changed = harness({ rows: small.rows, refs: small.refs });
        await changed.step.run(monthly(), busWith(small.episodes));

        const first = written(full.upsert);
        const second = written(changed.upsert);
        expect(first.inputsHash).not.toBe(second.inputsHash);
        expect(first.inputsHash).not.toBe('hash-1');
    });

    it('модели прошлого месяца нет — самая поздняя модель раньше месяца расчёта, не из будущего', async () => {
        const h = harness();
        h.latestModel.mockResolvedValue(null);
        h.findByKeys.mockImplementation((_: string, type: string) =>
            Promise.resolve(
                type === AI_ANALYTICS_SNAPSHOT_TYPE.portalModel
                    ? [
                          {
                              id: 'model-past',
                              periodKey: '2026-06',
                              managerId: null,
                              payload: portalModelPayload(0.4),
                          },
                          {
                              id: 'model-future',
                              periodKey: '2026-10',
                              managerId: null,
                              payload: portalModelPayload(0.7),
                          },
                      ]
                    : [],
            ),
        );
        const bus = busWith();
        await h.step.run(monthly(), bus);

        const payload = written(h.upsert).payload;
        const sample = bus.get<BetaSample>(AI_PIPELINE_BUS_KEYS.betaSample);
        expect(payload.meta.modelSnapshotId).toBe('model-past');
        expect(sample?.rows[0]?.offset).toBeCloseTo(logit(0.4), 12);
    });

    it('теневой шаг: раннер пропускает его сбой, а не обрывает прогон', () => {
        expect(harness().step.optional).toBe(true);
    });
});
