import { PresetConfig } from '../consts/preset.consts';

/** Пресет Bitrix (строка из REST или число) равен пресету портала. */
export const isPreset = (
    presetId: number | string | null | undefined,
    expected: number,
): boolean => Number(presetId) === expected;

/** Пресет входит в набор портала (org/ip/fiz). */
export const isKnownPreset = (
    presetId: number | string | null | undefined,
    config: PresetConfig,
): boolean =>
    isPreset(presetId, config.org) ||
    isPreset(presetId, config.ip) ||
    isPreset(presetId, config.fiz);
