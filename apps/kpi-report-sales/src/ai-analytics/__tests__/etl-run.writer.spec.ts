import { SnapshotEnvelope } from '@lib/sales-ai-analytics';
import { AI_PIPELINE_METRICS } from '../constants/ai-snapshot.const';
import { AiEtlRunPayload } from '../dto/ai-snapshot.dto';
import { EtlRunWriter } from '../pipeline/etl-run.writer';
import {
    AiPipelineStepResult,
    stepFailed,
    stepOk,
    stepSkipped,
} from '../steps/step.types';

const DOMAIN = 'a.bitrix24.ru';
const DAY = '2026-09-08';

function makeWriter(previousHash?: string) {
    const upsert = jest.fn<
        Promise<{ id: string; supersededIds: string[] }>,
        [SnapshotEnvelope<AiEtlRunPayload>]
    >(() => Promise.resolve({ id: '42', supersededIds: ['41'] }));
    const latest = jest
        .fn()
        .mockResolvedValue(
            previousHash === undefined
                ? null
                : { inputsHash: previousHash, id: '41' },
        );
    const metrics = { observeRun: jest.fn() };
    return {
        writer: new EtlRunWriter({ upsert, latest } as never, metrics as never),
        upsert,
        latest,
        metrics,
    };
}

function write(
    writer: EtlRunWriter,
    steps: AiPipelineStepResult[],
    durationMs = 1500,
) {
    return writer.write({
        domain: DOMAIN,
        day: DAY,
        rhythm: 'nightly',
        calcVersion: 'sam-1.0.0',
        paramsVersion: 'pv-1',
        inputsHash: 'hash-new',
        generatedAt: '2026-09-08T00:45:00.000Z',
        durationMs,
        steps,
    });
}

const OK_STEP = stepOk('calls', {
    ms: 900,
    rows: 120,
    bitrixCalls: 4,
    written: 3,
});

describe('EtlRunWriter — журнал прогона в снапшот ai-analytics-etl-run', () => {
    it('все шаги прошли: статус ok, суммы по шагам и все четыре метрики', async () => {
        const { writer, upsert, metrics } = makeWriter();
        const result = await write(writer, [
            OK_STEP,
            stepOk('kpi', { ms: 600, rows: 30, bitrixCalls: 2, written: 1 }),
        ]);

        expect(result.payload.status).toBe('ok');
        expect(result.payload.rowsLoaded).toBe(150);
        expect(result.payload.bitrixCalls).toBe(6);
        expect(result.payload.durationMs).toBe(1500);
        expect(result.payload.steps).toEqual([
            {
                step: 'calls',
                status: 'ok',
                durationMs: 900,
                rowsLoaded: 120,
                bitrixCalls: 4,
                written: 3,
                reason: null,
                error: null,
            },
            {
                step: 'kpi',
                status: 'ok',
                durationMs: 600,
                rowsLoaded: 30,
                bitrixCalls: 2,
                written: 1,
                reason: null,
                error: null,
            },
        ]);
        expect(Object.keys(result.payload.metrics)).toEqual([
            ...AI_PIPELINE_METRICS,
        ]);
        expect(result.payload.metrics).toEqual({
            ai_analytics_job_duration: 1.5,
            ai_analytics_rows_loaded: 150,
            ai_analytics_bitrix_calls: 6,
            ai_analytics_llm_price: 0,
        });

        const envelope = upsert.mock.calls[0][0];
        expect(envelope).toMatchObject({
            domain: DOMAIN,
            type: 'ai-analytics-etl-run',
            periodKey: DAY,
            managerId: null,
            calcVersion: 'sam-1.0.0',
            paramsVersion: 'pv-1',
            inputsHash: 'hash-new',
        });
        expect(result.id).toBe('42');
        expect(result.supersededIds).toEqual(['41']);
        // те же четыре величины уходят в Prometheus — журнал и график
        // считаются из одного payload
        expect(metrics.observeRun).toHaveBeenCalledWith(
            'nightly',
            'ok',
            result.payload.metrics,
        );
    });

    it('пропущенный шаг → статус partial, причина в журнале', async () => {
        const { writer } = makeWriter();
        const result = await write(writer, [
            OK_STEP,
            stepSkipped('stage-history', 'stage-history-too-short'),
        ]);
        expect(result.payload.status).toBe('partial');
        expect(result.payload.steps[1]).toMatchObject({
            status: 'skipped',
            reason: 'stage-history-too-short',
            error: null,
        });
    });

    it('упавший шаг → статус failed, текст ошибки в error и reason', async () => {
        const { writer } = makeWriter();
        const result = await write(writer, [
            stepSkipped('stage-history', 'stage-history-too-short'),
            stepFailed('kpi', 'kpi-report недоступен', { ms: 10 }),
        ]);
        expect(result.payload.status).toBe('failed');
        expect(result.payload.steps[1]).toMatchObject({
            status: 'failed',
            reason: 'kpi-report недоступен',
            error: 'kpi-report недоступен',
        });
    });

    it('стоимость LLM суммируется по шагам', async () => {
        const { writer } = makeWriter();
        const result = await write(writer, [
            stepOk('brief', { llmPrice: 1.25 }),
            stepOk('brief-2', { llmPrice: 0.75 }),
        ]);
        expect(result.payload.metrics.ai_analytics_llm_price).toBe(2);
    });

    it('дрейф входов: другой inputsHash прошлого прогона → true, тот же → false, первый прогон → false', async () => {
        const drifted = makeWriter('hash-old');
        expect(
            (await write(drifted.writer, [OK_STEP])).payload.inputsDrift,
        ).toBe(true);
        expect(drifted.latest).toHaveBeenCalledWith(
            DOMAIN,
            'ai-analytics-etl-run',
            null,
        );

        const same = makeWriter('hash-new');
        expect((await write(same.writer, [OK_STEP])).payload.inputsDrift).toBe(
            false,
        );

        const first = makeWriter();
        expect((await write(first.writer, [OK_STEP])).payload.inputsDrift).toBe(
            false,
        );
    });

    it('повтор за ту же дату пишется тем же ключом (снапшоты не плодятся)', async () => {
        const { writer, upsert } = makeWriter('hash-new');
        await write(writer, [OK_STEP]);
        await write(writer, [OK_STEP]);
        const [first, second] = upsert.mock.calls.map(call => call[0]);
        expect(first.periodKey).toBe(second.periodKey);
        expect(second.periodKey).toBe(DAY);
    });
});
