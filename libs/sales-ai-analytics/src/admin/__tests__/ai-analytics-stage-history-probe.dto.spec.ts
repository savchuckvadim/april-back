import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
    AI_ANALYTICS_STAGE_HISTORY_PROBE_DEFAULTS,
    AiAnalyticsStageHistoryProbeQueryDto,
} from '../dto/ai-analytics-stage-history-probe.dto';

/** Query приходит строками — как из ValidationPipe с transform: true. */
async function parse(query: Record<string, unknown>) {
    const dto = plainToInstance(AiAnalyticsStageHistoryProbeQueryDto, query);
    const errors = await validate(dto);

    return { dto, errors, failed: errors.map(error => error.property) };
}

describe('AiAnalyticsStageHistoryProbeQueryDto', () => {
    it('умолчания окна: 12 месяцев, границы 1..36', () => {
        expect(AI_ANALYTICS_STAGE_HISTORY_PROBE_DEFAULTS).toEqual({
            months: 12,
            minMonths: 1,
            maxMonths: 36,
        });
    });

    it('domain нормализуется (trim + lower), months из строки становится числом', async () => {
        const { dto, errors } = await parse({
            domain: '  April.Bitrix24.RU ',
            months: '6',
        });
        expect(errors).toEqual([]);
        expect(dto.domain).toBe('april.bitrix24.ru');
        expect(dto.months).toBe(6);
    });

    it('months необязателен: без него валидно и undefined', async () => {
        const { dto, errors } = await parse({ domain: 'd.bitrix24.ru' });
        expect(errors).toEqual([]);
        expect(dto.months).toBeUndefined();
    });

    it('пустой domain — ошибка валидации', async () => {
        const { failed } = await parse({ domain: '   ' });
        expect(failed).toEqual(['domain']);
    });

    it.each([
        ['0', 'меньше минимума'],
        ['37', 'больше максимума'],
        ['6.5', 'не целое'],
        ['abc', 'не число'],
    ])('months = %s (%s) — ошибка валидации', async raw => {
        const { failed } = await parse({
            domain: 'd.bitrix24.ru',
            months: raw,
        });
        expect(failed).toEqual(['months']);
    });

    it.each(['1', '36'])(
        'months = %s — граница входит в допустимое',
        async raw => {
            const { dto, errors } = await parse({
                domain: 'd.bitrix24.ru',
                months: raw,
            });
            expect(errors).toEqual([]);
            expect(dto.months).toBe(Number(raw));
        },
    );
});
