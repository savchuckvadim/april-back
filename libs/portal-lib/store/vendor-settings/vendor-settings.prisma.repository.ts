import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import type { VendorSetting } from 'generated/prisma';
import {
    VendorSettingRow,
    VendorSettingsRepository,
    VendorSettingUpsert,
} from './vendor-settings.repository';

/** Prisma-реализация над таблицей vendor_settings (одна строка на ключ). */
@Injectable()
export class VendorSettingsPrismaRepository extends VendorSettingsRepository {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async findAll(): Promise<VendorSettingRow[]> {
        const rows = await this.prisma.vendorSetting.findMany();
        return rows.map(row => this.toRow(row));
    }

    async upsert(row: VendorSettingUpsert): Promise<void> {
        const now = new Date();
        await this.prisma.vendorSetting.upsert({
            where: { key: row.key },
            create: {
                key: row.key,
                value: row.value,
                isSecret: row.isSecret,
                updatedBy: row.updatedBy,
                createdAt: now,
                updatedAt: now,
            },
            update: {
                value: row.value,
                isSecret: row.isSecret,
                updatedBy: row.updatedBy,
                updatedAt: now,
            },
        });
    }

    async remove(key: string): Promise<void> {
        await this.prisma.vendorSetting.deleteMany({ where: { key } });
    }

    private toRow(row: VendorSetting): VendorSettingRow {
        return {
            key: row.key,
            value: row.value,
            isSecret: row.isSecret,
            updatedAt: row.updatedAt,
            updatedBy: row.updatedBy,
        };
    }
}
