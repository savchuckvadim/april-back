import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { PortalBitrixLoadController } from './portal-bitrix-load.controller';
import { PortalBitrixLoadService } from './portal-bitrix-load.service';
import { PrometheusClient } from './prometheus.client';

/**
 * Нагрузка портала на Битрикс из Prometheus (`admin/portal/:id/bitrix-load`)
 * — только apps/admin. Адрес Prometheus — PROMETHEUS_URL (по умолчанию
 * http://prometheus:9090 — имя сервиса в сети compose).
 */
@Module({
    imports: [PrismaModule, HttpModule],
    controllers: [PortalBitrixLoadController],
    providers: [PrometheusClient, PortalBitrixLoadService],
})
export class PortalBitrixLoadModule {}
