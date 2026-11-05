import type { BitrixService } from '@/modules/bitrix/bitrix.service';
import type { PBXService } from '@/modules/pbx';
import type { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { RqPresetService, type RqPresetSet } from '../../services/rq-preset.service';

/** Пресеты april-garant: не 1/3/5, в БД они строки. */
export const PORTAL_PRESETS = {
    preset_org: { bitrix_id: '2', name: 'Организация' },
    preset_ip: { bitrix_id: '4', name: 'Индивидуальный предприниматель' },
    preset_fiz: { bitrix_id: '6', name: 'Физическое лицо' },
} as const;

export const PRESET_SET: RqPresetSet = {
    org: { id: 2, name: 'Организация' },
    ip: { id: 4, name: 'Индивидуальный предприниматель' },
    fiz: { id: 6, name: 'Физическое лицо' },
};

export const fakePortalModel = (
    presets: Partial<Record<string, { bitrix_id: string; name: string }>> = PORTAL_PRESETS,
): PortalModel =>
    ({
        getPresetForName: (code: string) => presets[code] ?? undefined,
    }) as unknown as PortalModel;

export interface FakeBitrix {
    bitrix: BitrixService;
    call: jest.Mock;
    addCmdBatch: jest.Mock;
    callBatchWithConcurrency: jest.Mock;
}

/** Bitrix с одним методом call: ответы задаёт тест по имени метода. */
export const fakeBitrix = (
    answers: Record<string, unknown> = {},
): FakeBitrix => {
    const call = jest.fn(async (method: string) => answers[method] ?? { result: [] });
    const addCmdBatch = jest.fn();
    const callBatchWithConcurrency = jest.fn(async () => []);
    return {
        bitrix: {
            api: { call, addCmdBatch, callBatchWithConcurrency },
        } as unknown as BitrixService,
        call,
        addCmdBatch,
        callBatchWithConcurrency,
    };
};

export const fakePbx = (bitrix: BitrixService, portalModel: PortalModel): PBXService =>
    ({
        init: async () => ({ bitrix, PortalModel: portalModel }),
    }) as unknown as PBXService;

/** Сервис пресетов с готовым набором: тесты не про него. */
export const fakePresetService = (presets: RqPresetSet = PRESET_SET): RqPresetService =>
    ({ resolve: async () => presets }) as unknown as RqPresetService;
