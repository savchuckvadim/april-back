import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import { PlansConfigService } from '../services/plans-config.service';
import {
    PLAN_INDICATOR_CODES,
    PLAN_INDICATORS,
    PLAN_PERIOD_TYPE,
} from '../constants/plan-indicators.const';

const DOMAIN = 'april.bitrix24.ru';
const PORTAL = { id: 7, domain: DOMAIN };

function makePrisma(row: { id: number; other: string | null } | null) {
    return {
        portal: { findFirst: jest.fn().mockResolvedValue(PORTAL) },
        report_settings: {
            findFirst: jest.fn().mockResolvedValue(row),
            update: jest.fn().mockResolvedValue({}),
            create: jest.fn().mockResolvedValue({}),
        },
    } as unknown as PrismaService & {
        report_settings: {
            findFirst: jest.Mock;
            update: jest.Mock;
            create: jest.Mock;
        };
    };
}

describe('PlansConfigService', () => {
    it('без строки — дефолт: полный каталог, всё выключено, месяц', async () => {
        const service = new PlansConfigService(makePrisma(null));
        const config = await service.getConfig(DOMAIN);

        expect(config.indicators).toHaveLength(PLAN_INDICATORS.length);
        expect(
            config.indicators.every(
                item =>
                    !item.enabled &&
                    item.customName === null &&
                    item.periodType === PLAN_PERIOD_TYPE.month,
            ),
        ).toBe(true);
    });

    it('нормализация: сохранённые значения поверх дефолтов, чужие коды отброшены', async () => {
        const stored = {
            version: 1,
            updatedAt: 'x',
            config: {
                version: 1,
                indicators: [
                    {
                        code: PLAN_INDICATOR_CODES.calls_done,
                        enabled: true,
                        customName: 'План звонков',
                        periodType: PLAN_PERIOD_TYPE.quarter,
                    },
                    {
                        code: 'no_such_indicator',
                        enabled: true,
                        customName: null,
                        periodType: PLAN_PERIOD_TYPE.month,
                    },
                ],
            },
        };
        const service = new PlansConfigService(
            makePrisma({ id: 1, other: JSON.stringify(stored) }),
        );
        const config = await service.getConfig(DOMAIN);

        const calls = config.indicators.find(
            item => item.code === PLAN_INDICATOR_CODES.calls_done,
        )!;
        expect(calls.enabled).toBe(true);
        expect(calls.customName).toBe('План звонков');
        expect(calls.periodType).toBe(PLAN_PERIOD_TYPE.quarter);
        // чужой код не пролез, каталог полный
        expect(config.indicators).toHaveLength(PLAN_INDICATORS.length);
    });

    it('битый JSON в other — дефолт без падения', async () => {
        const service = new PlansConfigService(
            makePrisma({ id: 1, other: '{broken' }),
        );
        const config = await service.getConfig(DOMAIN);
        expect(config.indicators.every(item => !item.enabled)).toBe(true);
    });

    it('save: существующая строка обновляется, новой не создаётся', async () => {
        const prisma = makePrisma({ id: 42, other: null });
        const service = new PlansConfigService(prisma);
        await service.saveConfig(DOMAIN, {
            version: 1,
            indicators: [
                {
                    code: PLAN_INDICATOR_CODES.sales_count,
                    enabled: true,
                    customName: null,
                    periodType: PLAN_PERIOD_TYPE.year,
                },
            ],
        });

        expect(prisma.report_settings.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 42 } }),
        );
        expect(prisma.report_settings.create).not.toHaveBeenCalled();
        const savedOther = (
            prisma.report_settings.update.mock.calls[0][0] as {
                data: { other: string };
            }
        ).data.other;
        const envelope = JSON.parse(savedOther);
        expect(envelope.config.indicators).toHaveLength(PLAN_INDICATORS.length);
    });

    it('портал не найден → NotFound', async () => {
        const prisma = makePrisma(null);
        (prisma.portal.findFirst as jest.Mock).mockResolvedValue(null);
        await expect(
            new PlansConfigService(prisma).getConfig(DOMAIN),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
