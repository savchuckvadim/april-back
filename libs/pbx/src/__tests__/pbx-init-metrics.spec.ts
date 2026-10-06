import { register } from 'prom-client';
import { runAsBackground, runAsInteractive } from '@/core/call-context';
import {
    PBX_INIT_DURATION_SECONDS,
    PBX_INIT_STEP,
    PBX_INIT_TOTAL,
    countInit,
    timeInitStep,
} from '../lib/pbx-init-metrics';

/** Значение метрики по набору меток из реестра prom-client. */
const metricValue = async (
    name: string,
    labels: Record<string, string>,
    suffix = '',
): Promise<number> => {
    const metric = register.getSingleMetric(name);
    if (!metric) return 0;
    const { values } = await metric.get();
    const found = values.find(
        value =>
            (suffix === '' ||
                (value as { metricName?: string }).metricName ===
                    `${name}${suffix}`) &&
            Object.entries(labels).every(
                ([key, expected]) => value.labels[key] === expected,
            ),
    );
    return found?.value ?? 0;
};

const stepCount = (step: string): Promise<number> =>
    metricValue(PBX_INIT_DURATION_SECONDS, { step }, '_count');

describe('метрики pbx.init', () => {
    it('шаг отдаёт результат работы и записывает замер', async () => {
        const before = await stepCount(PBX_INIT_STEP.portalModel);

        await expect(
            timeInitStep(PBX_INIT_STEP.portalModel, () => 42),
        ).resolves.toBe(42);

        expect(await stepCount(PBX_INIT_STEP.portalModel)).toBe(before + 1);
    });

    it('упавший шаг тоже замеряется, ошибка уходит вызывающему', async () => {
        const before = await stepCount(PBX_INIT_STEP.externalPortal);

        await expect(
            timeInitStep(PBX_INIT_STEP.externalPortal, () =>
                Promise.reject(new Error('online недоступен')),
            ),
        ).rejects.toThrow('online недоступен');

        expect(await stepCount(PBX_INIT_STEP.externalPortal)).toBe(before + 1);
    });

    it('счётчик вызовов различает менеджеров и фон по порталу', async () => {
        const domain = 'metrics-test.bitrix24.ru';
        const count = (callClass: string) =>
            metricValue(PBX_INIT_TOTAL, { domain, call_class: callClass });

        runAsInteractive('test', () => countInit(domain));
        runAsBackground('test', () => countInit(domain));
        runAsBackground('test', () => countInit(domain));

        expect(await count('interactive')).toBe(1);
        expect(await count('background')).toBe(2);
    });
});
