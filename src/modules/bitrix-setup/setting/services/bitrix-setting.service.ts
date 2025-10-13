import { Injectable, BadRequestException } from '@nestjs/common';
import { BitrixSettingRepository } from '../repositories/bitrix-setting.repository';
import { BitrixSettingEntity } from '../model/bitrix-setting.model';
import { CreateBitrixSettingDto, UpdateBitrixSettingDto } from '../dto/bitrix-setting.dto';
import { BitrixSettingType } from '../enums/bitrix-setting-type.enum';

@Injectable()
export class BitrixSettingService {
    constructor(
        private readonly repository: BitrixSettingRepository,
    ) { }

    // BitrixSetting methods
    async storeSetting(dto: CreateBitrixSettingDto, settingableId: bigint): Promise<BitrixSettingEntity> {
        const processedValue = this.processSettingValue(dto.value, dto.type);

        const setting = await this.repository.store({
            settingable_id: settingableId,
            settingable_type: dto.settingable_type,
            type: dto.type,
            code: dto.code,
            status: dto.status,
            title: dto.title,
            description: dto.description,
            value: processedValue,
        });

        if (!setting) {
            throw new BadRequestException('Failed to create setting');
        }

        return setting;
    }

    async getSettingsBySettingable(settingableId: bigint, settingableType: string): Promise<BitrixSettingEntity[]> {
        const settings = await this.repository.findBySettingable(settingableId, settingableType);

        // Process values based on type
        return settings.map(setting => ({
            ...setting,
            value: this.processSettingValueForResponse(setting.value, setting.type),
        }));
    }

    async updateSetting(id: bigint, dto: UpdateBitrixSettingDto): Promise<BitrixSettingEntity> {
        const processedValue = dto.value ? this.processSettingValue(dto.value, dto.type) : undefined;

        const setting = await this.repository.update(id, {
            type: dto.type,
            status: dto.status,
            title: dto.title,
            description: dto.description,
            value: processedValue,
        });

        if (!setting) {
            throw new BadRequestException('Failed to update setting');
        }

        return {
            ...setting,
            value: this.processSettingValueForResponse(setting.value, setting.type),
        };
    }

    async deleteSetting(id: bigint): Promise<boolean> {
        return await this.repository.delete(id);
    }

    // Helper methods for setting value processing
    private processSettingValue(value: string | undefined, type?: string): string | undefined {
        if (!value) return undefined;

        switch (type) {
            case BitrixSettingType.CHECKBOX:
                return value === 'true' || value === '1' ? '1' : '0';
            case BitrixSettingType.NUMBER:
                return isNaN(Number(value)) ? undefined : String(value);
            case BitrixSettingType.JSON:
                try {
                    return JSON.stringify(JSON.parse(value));
                } catch {
                    return value;
                }
            default:
                return value;
        }
    }

    private processSettingValueForResponse(value: string | undefined, type?: string): any {
        if (!value) return undefined;

        switch (type) {
            case BitrixSettingType.CHECKBOX:
                return value === '1' || value === 'true';
            case BitrixSettingType.NUMBER:
                return isNaN(Number(value)) ? null : Number(value);
            case BitrixSettingType.JSON:
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
                }
            default:
                return value;
        }
    }
}
