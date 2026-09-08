import { SettingsSaveUseCase } from '../../domain/use-cases/settings-save.use-case';
import { AiAnalyticsPortalSettings } from '../../domain/loaders/settings.loader';
import {
    AiAnalyticsSettingsAuditStore,
    AiSettingsAuditPort,
} from '../../store/ai-analytics-settings-audit.store';
import { settingsLoaderWith } from './lite-row.fixture';

/** Заглушки сохранения настроек: стор ключей схемы, кэш и запись в ais. */
export interface SettingsSaveHarness {
    useCase: SettingsSaveUseCase;
    savePortalSettings: jest.Mock;
    resetByPattern: jest.Mock;
    create: jest.Mock;
}

/**
 * Use-case сохранения на моках: настройки портала подменяются целиком
 * (`settings` — текущее состояние блоков), запись в ключи схемы и в ais
 * перехватывается, кэш считает сбросы.
 */
export function settingsSaveHarness(
    settings: Partial<AiAnalyticsPortalSettings> = {},
): SettingsSaveHarness {
    const savePortalSettings = jest.fn().mockResolvedValue(undefined);
    const resetByPattern = jest.fn().mockResolvedValue(2);
    const create = jest.fn().mockResolvedValue({ id: '90210' });
    const auditPort: AiSettingsAuditPort = {
        create: create as unknown as AiSettingsAuditPort['create'],
    };
    const useCase = new SettingsSaveUseCase(
        settingsLoaderWith(settings),
        { savePortalSettings } as never,
        { resetByPattern } as never,
        new AiAnalyticsSettingsAuditStore(auditPort as never),
    );
    return { useCase, savePortalSettings, resetByPattern, create };
}

/** Аргумент последнего вызова мока по индексу (calls типизированы как any). */
export function lastArg(mock: jest.Mock, index: number): unknown {
    const calls = mock.mock.calls as unknown[][];
    return calls[calls.length - 1]?.[index];
}

/** user_result последней записи аудита. */
export function auditPayload(create: jest.Mock): Record<string, unknown> {
    const record = lastArg(create, 0) as {
        user_result: Record<string, unknown>;
    };
    return record.user_result;
}

/** JSON-строки ключей, ушедшие в настройки портала при последнем сохранении. */
export function patchOf(savePortalSettings: jest.Mock): Record<string, string> {
    return (
        (lastArg(savePortalSettings, 1) as
            | Record<string, string>
            | undefined) ?? {}
    );
}
