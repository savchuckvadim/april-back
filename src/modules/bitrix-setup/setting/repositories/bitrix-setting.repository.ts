import { BitrixSettingEntity } from '../model/bitrix-setting.model';

export abstract class BitrixSettingRepository {
    // BitrixSetting methods
    abstract store(setting: Partial<BitrixSettingEntity>): Promise<BitrixSettingEntity | null>;
    abstract findById(id: bigint): Promise<BitrixSettingEntity | null>;
    abstract findBySettingable(settingableId: bigint, settingableType: string): Promise<BitrixSettingEntity[]>;
    abstract update(id: bigint, setting: Partial<BitrixSettingEntity>): Promise<BitrixSettingEntity | null>;
    abstract delete(id: bigint): Promise<boolean>;
}
