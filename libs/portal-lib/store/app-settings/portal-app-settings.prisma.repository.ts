import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { Prisma, PortalAppSettings } from 'generated/prisma';
import {
    PortalAppSettingsRecord,
    PortalAppSettingsRepository,
} from './portal-app-settings.repository';
import { EnumPortalAppCode } from './portal-app-settings.schema';

/**
 * Prisma-реализация. JSON-колонка `settings` сливается при upsert:
 * частичный апдейт не теряет остальные ключи. Мусор из БД (JSON мог
 * писаться кем угодно) не роняет чтение — не-объект превращается в {}.
 */
@Injectable()
export class PortalAppSettingsPrismaRepository
    implements PortalAppSettingsRepository
{
    constructor(private readonly prisma: PrismaService) {}

    async findByDomain(
        domain: string,
        appCode: EnumPortalAppCode,
    ): Promise<PortalAppSettingsRecord | null> {
        const row = await this.prisma.portalAppSettings.findFirst({
            where: { domain, appCode },
        });
        return row ? this.toRecord(row) : null;
    }

    async findByPortalId(portalId: number): Promise<PortalAppSettingsRecord[]> {
        const rows = await this.prisma.portalAppSettings.findMany({
            where: { portal_id: BigInt(portalId) },
            orderBy: { appCode: 'asc' },
        });
        return rows.map(row => this.toRecord(row));
    }

    async findByAppCode(
        appCode: EnumPortalAppCode,
    ): Promise<PortalAppSettingsRecord[]> {
        const rows = await this.prisma.portalAppSettings.findMany({
            where: { appCode },
            orderBy: { domain: 'asc' },
        });
        return rows.map(row => this.toRecord(row));
    }

    async upsert(
        portalId: number,
        domain: string,
        appCode: EnumPortalAppCode,
        settings: Record<string, unknown>,
    ): Promise<PortalAppSettingsRecord> {
        const current = await this.prisma.portalAppSettings.findUnique({
            where: {
                portal_id_appCode: {
                    portal_id: BigInt(portalId),
                    appCode,
                },
            },
        });
        const merged: Record<string, unknown> = {
            ...this.toSettingsObject(current?.settings),
            ...settings,
        };
        // null-значение = «сбросить на дефолт»: ключ удаляется из JSON.
        for (const key of Object.keys(merged)) {
            if (merged[key] === null) delete merged[key];
        }
        const json = JSON.parse(
            JSON.stringify(merged),
        ) as Prisma.InputJsonValue;

        const row = await this.prisma.portalAppSettings.upsert({
            where: {
                portal_id_appCode: {
                    portal_id: BigInt(portalId),
                    appCode,
                },
            },
            create: {
                id: randomUUID(),
                portal_id: BigInt(portalId),
                domain,
                appCode,
                settings: json,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            update: { settings: json, domain, updatedAt: new Date() },
        });
        return this.toRecord(row);
    }

    private toRecord(row: PortalAppSettings): PortalAppSettingsRecord {
        return {
            portalId: Number(row.portal_id),
            domain: row.domain,
            appCode: row.appCode as EnumPortalAppCode,
            settings: this.toSettingsObject(row.settings),
            updatedAt: row.updatedAt,
        };
    }

    private toSettingsObject(
        value: Prisma.JsonValue | undefined | null,
    ): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value as Record<string, unknown>;
    }
}
