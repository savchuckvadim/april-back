import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import { createGlobalValidationPipe } from '@lib/core/bootstrap/global-validation-pipe';
import {
    AiAnalyticsSmartBackfillRunDto,
    AiAnalyticsSmartBackfillStatusQueryDto,
} from '../dto/ai-analytics-smart-backfill.dto';
import { AiOwnerReportExportStartDto } from '../dto/ai-owner-report-export.dto';

/**
 * Булевы флаги ручек AI-аналитики админки через тот же ValidationPipe, что
 * в bootstrapApp (whitelist + enableImplicitConversion). До исправления
 * строка 'false' превращалась в true: неявное приведение Boolean('false')
 * срабатывало раньше @Transform.
 */
const pipe = createGlobalValidationPipe();

const transform = async <T extends object>(
    metatype: new () => T,
    type: ArgumentMetadata['type'],
    value: Record<string, unknown>,
): Promise<T> => (await pipe.transform(value, { type, metatype })) as T;

const OWNER_REPORT = {
    domain: 'gsr.bitrix24.ru',
    kind: 'month',
    periodKey: '2026-10',
};
const BACKFILL = { domain: 'gsr.bitrix24.ru' };

const CASES: [string, unknown, boolean][] = [
    ['строка «false»', 'false', false],
    ['строка «true»', 'true', true],
    ['JSON false', false, false],
    ['JSON true', true, true],
];

describe('булевы флаги DTO AI-аналитики', () => {
    it.each(CASES)(
        'forceRefresh выгрузки отчёта собственнику (тело): %s',
        async (_name, value, expected) => {
            const dto = await transform(AiOwnerReportExportStartDto, 'body', {
                ...OWNER_REPORT,
                forceRefresh: value,
            });
            expect(dto.forceRefresh).toBe(expected);
        },
    );

    it.each(CASES)(
        'dryRun запуска дописывания полей (тело): %s',
        async (_name, value, expected) => {
            const dto = await transform(
                AiAnalyticsSmartBackfillRunDto,
                'body',
                {
                    ...BACKFILL,
                    dryRun: value,
                },
            );
            expect(dto.dryRun).toBe(expected);
        },
    );

    it.each([
        ['false', false],
        ['true', true],
    ])('dryRun статуса дописывания (query «%s»)', async (value, expected) => {
        const dto = await transform(
            AiAnalyticsSmartBackfillStatusQueryDto,
            'query',
            { ...BACKFILL, dryRun: value },
        );
        expect(dto.dryRun).toBe(expected);
    });

    it('не передан — остаётся пустым; мусор — 400', async () => {
        const dto = await transform(
            AiOwnerReportExportStartDto,
            'body',
            OWNER_REPORT,
        );
        expect(dto.forceRefresh).toBeUndefined();
        await expect(
            transform(AiOwnerReportExportStartDto, 'body', {
                ...OWNER_REPORT,
                forceRefresh: 'ага',
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
