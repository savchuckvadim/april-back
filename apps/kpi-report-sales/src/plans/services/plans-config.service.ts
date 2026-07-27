import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import {
    PLAN_CONFIG_SENTINEL_BX_USER_ID,
    PLAN_INDICATORS,
    PLAN_PERIOD_TYPE,
    PLANS_CONFIG_VERSION,
} from '../constants/plan-indicators.const';
import {
    PlanIndicatorConfigDto,
    PlansConfigDto,
} from '../dto/plans-config.dto';

/** Envelope конфига в свободной колонке report_settings.other. */
interface PlansConfigEnvelope {
    version: number;
    updatedAt: string;
    config: PlansConfigDto;
}

/**
 * Портальный конфиг планов: строка-сентинел report_settings
 * (portalId, bxUserId=0) — реальные Bitrix id ≥ 1, коллизий с user-строками
 * ui-settings нет. Versioned envelope в LongText `other` (без миграций,
 * durable — паттерн ui-settings). Таблица без unique-индекса —
 * find-then-update, как в report-settings.service.
 */
@Injectable()
export class PlansConfigService {
    private readonly logger = new Logger(PlansConfigService.name);

    constructor(private readonly prisma: PrismaService) {}

    /** Конфиг портала; отсутствует/битый — дефолт (все выключены). */
    async getConfig(domain: string): Promise<PlansConfigDto> {
        const portal = await this.findPortal(domain);
        const row = await this.prisma.report_settings.findFirst({
            where: {
                portalId: Number(portal.id),
                bxUserId: PLAN_CONFIG_SENTINEL_BX_USER_ID,
            },
        });
        const stored = this.parseEnvelope(row?.other ?? null);
        return this.normalize(stored?.config ?? null);
    }

    /** Сохраняет конфиг (создаёт/обновляет строку-сентинел). */
    async saveConfig(
        domain: string,
        config: PlansConfigDto,
    ): Promise<PlansConfigDto> {
        const portal = await this.findPortal(domain);
        const normalized = this.normalize(config);
        const envelope: PlansConfigEnvelope = {
            version: PLANS_CONFIG_VERSION,
            updatedAt: new Date().toISOString(),
            config: normalized,
        };
        const other = JSON.stringify(envelope);

        const existing = await this.prisma.report_settings.findFirst({
            where: {
                portalId: Number(portal.id),
                bxUserId: PLAN_CONFIG_SENTINEL_BX_USER_ID,
            },
        });
        if (existing) {
            await this.prisma.report_settings.update({
                where: { id: existing.id },
                data: { other, updated_at: new Date() },
            });
        } else {
            await this.prisma.report_settings.create({
                data: {
                    domain,
                    portalId: Number(portal.id),
                    bxUserId: PLAN_CONFIG_SENTINEL_BX_USER_ID,
                    other,
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            });
        }
        this.logger.log(
            `Конфиг планов сохранён (${domain}): ` +
                `${normalized.indicators.filter(i => i.enabled).length} включено`,
        );
        return normalized;
    }

    /**
     * Нормализация к полному каталогу: каждый показатель ровно один раз
     * (недостающие — дефолт «выключен, месяц»; чужие коды отброшены).
     */
    private normalize(config: PlansConfigDto | null): PlansConfigDto {
        const byCode = new Map<string, PlanIndicatorConfigDto>(
            (config?.indicators ?? []).map(item => [item.code, item]),
        );
        return {
            version: PLANS_CONFIG_VERSION,
            indicators: PLAN_INDICATORS.map(indicator => {
                const stored = byCode.get(indicator.code);
                return {
                    code: indicator.code,
                    enabled: stored?.enabled ?? false,
                    customName: stored?.customName ?? null,
                    periodType: stored?.periodType ?? PLAN_PERIOD_TYPE.month,
                };
            }),
        };
    }

    private parseEnvelope(raw: string | null): PlansConfigEnvelope | null {
        if (!raw) return null;
        try {
            return JSON.parse(raw) as PlansConfigEnvelope;
        } catch {
            this.logger.warn('Битый envelope конфига планов — дефолт');
            return null;
        }
    }

    private async findPortal(domain: string) {
        const portal = await this.prisma.portal.findFirst({
            where: { domain },
        });
        if (!portal) {
            throw new NotFoundException(`Портал ${domain} не найден`);
        }
        return portal;
    }
}
