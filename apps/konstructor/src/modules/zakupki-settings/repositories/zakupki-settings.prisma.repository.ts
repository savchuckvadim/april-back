import { Injectable } from '@nestjs/common';
import type { offer_zakupki_settings, Prisma } from 'generated/prisma';
import { PrismaService } from 'src/core/prisma';

export type ZakupkiSettingsRecord = offer_zakupki_settings;

/** Таблица `offer_zakupki_settings` (Laravel-миграция 2025_02_18): настройки «3 КП» портала и пользователей. */
@Injectable()
export class ZakupkiSettingsPrismaRepository {
    constructor(private readonly prisma: PrismaService) {}

    findByDomainAndUser(
        domain: string,
        bxUserId: number,
    ): Promise<ZakupkiSettingsRecord | null> {
        return this.prisma.offer_zakupki_settings.findFirst({
            where: { domain, bxUserId },
            orderBy: { id: 'desc' },
        });
    }

    findDefaultByDomain(domain: string): Promise<ZakupkiSettingsRecord | null> {
        return this.prisma.offer_zakupki_settings.findFirst({
            where: { domain, is_default: true },
            orderBy: { id: 'asc' },
        });
    }

    findAnyByDomain(domain: string): Promise<ZakupkiSettingsRecord | null> {
        return this.prisma.offer_zakupki_settings.findFirst({
            where: { domain },
            orderBy: { id: 'asc' },
        });
    }

    findById(id: number): Promise<ZakupkiSettingsRecord | null> {
        return this.prisma.offer_zakupki_settings.findUnique({
            where: { id: BigInt(id) },
        });
    }

    create(
        data: Prisma.offer_zakupki_settingsUncheckedCreateInput,
    ): Promise<ZakupkiSettingsRecord> {
        return this.prisma.offer_zakupki_settings.create({ data });
    }

    update(
        id: bigint,
        data: Prisma.offer_zakupki_settingsUncheckedUpdateInput,
    ): Promise<ZakupkiSettingsRecord> {
        return this.prisma.offer_zakupki_settings.update({
            where: { id },
            data,
        });
    }

    async delete(id: bigint): Promise<void> {
        await this.prisma.offer_zakupki_settings.delete({ where: { id } });
    }
}
