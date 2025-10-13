import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { BitrixSettingRepository } from './bitrix-setting.repository';
import { BitrixSettingEntity } from '../model/bitrix-setting.model';

@Injectable()
export class BitrixSettingPrismaRepository implements BitrixSettingRepository {
    constructor(private readonly prisma: PrismaService) { }

    // BitrixSetting methods
    async store(setting: Partial<BitrixSettingEntity>): Promise<BitrixSettingEntity | null> {
        try {
            const result = await this.prisma.bitrix_settings.create({
                data: {
                    settingable_id: setting.settingable_id!,
                    settingable_type: setting.settingable_type!,
                    type: setting.type,
                    code: setting.code!,
                    status: setting.status,
                    title: setting.title,
                    description: setting.description,
                    value: setting.value,
                },
            });
            return result as BitrixSettingEntity;
        } catch (error) {
            console.error('Error in store:', error);
            return null;
        }
    }

    async findById(id: bigint): Promise<BitrixSettingEntity | null> {
        try {
            const result = await this.prisma.bitrix_settings.findUnique({
                where: { id },
            });
            return result as BitrixSettingEntity;
        } catch (error) {
            console.error('Error in findById:', error);
            return null;
        }
    }

    async findBySettingable(settingableId: bigint, settingableType: string): Promise<BitrixSettingEntity[]> {
        try {
            const result = await this.prisma.bitrix_settings.findMany({
                where: {
                    settingable_id: settingableId,
                    settingable_type: settingableType,
                },
            });
            return result as BitrixSettingEntity[];
        } catch (error) {
            console.error('Error in findBySettingable:', error);
            return [];
        }
    }

    async update(id: bigint, setting: Partial<BitrixSettingEntity>): Promise<BitrixSettingEntity | null> {
        try {
            const result = await this.prisma.bitrix_settings.update({
                where: { id },
                data: {
                    type: setting.type,
                    status: setting.status,
                    title: setting.title,
                    description: setting.description,
                    value: setting.value,
                    updated_at: new Date(),
                },
            });
            return result as BitrixSettingEntity;
        } catch (error) {
            console.error('Error in update:', error);
            return null;
        }
    }

    async delete(id: bigint): Promise<boolean> {
        try {
            await this.prisma.bitrix_settings.delete({
                where: { id },
            });
            return true;
        } catch (error) {
            console.error('Error in delete:', error);
            return false;
        }
    }
}
