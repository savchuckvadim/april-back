import { InstallLeadStageSyncService } from '../services/stages/install-lead-stage-sync.service';
import { PbxLeadStageTemplateItem } from '@lib/portal-lib/pbx-domain';

const template: PbxLeadStageTemplateItem[] = [
    {
        code: 'lead_new',
        name: 'new',
        title: 'Новый лид',
        color: '#39A8EF',
        order: 10,
        isActive: true,
        bitrixStatusId: 'NEW',
        semantics: '',
        installMode: 'map-only',
    },
    {
        code: 'lead_taken_in_work',
        name: 'taken_in_work',
        title: 'Взята в работу',
        color: '#55D0E0',
        order: 22,
        isActive: true,
        bitrixStatusId: 'PBX_TAKEN_IN_WORK',
        semantics: '',
        installMode: 'create',
    },
    {
        code: 'lead_company_work',
        name: 'company_work',
        title: 'Работа с компанией',
        color: '#47E4C2',
        order: 24,
        isActive: true,
        bitrixStatusId: 'PBX_COMPANY_WORK',
        semantics: '',
        installMode: 'create',
    },
];

const makeBitrix = (existing: unknown[]) => {
    const add = jest.fn().mockResolvedValue(1);
    const update = jest.fn().mockResolvedValue(true);
    const remove = jest.fn();
    const bitrix = {
        status: {
            getList: jest.fn().mockResolvedValue({ result: existing }),
            add,
            update,
            delete: remove,
        },
    };
    return { bitrix, add, update, remove };
};

describe('InstallLeadStageSyncService', () => {
    const service = new InstallLeadStageSyncService();

    it('создаёт отсутствующие create-стадии, map-only игнорирует', async () => {
        const { bitrix, add } = makeBitrix([
            { ID: '1', STATUS_ID: 'NEW', NAME: 'Не обработан', SORT: 10 },
        ]);

        const results = await service.sync(bitrix as never, template);

        expect(results.map(item => item.code)).toEqual([
            'lead_taken_in_work',
            'lead_company_work',
        ]);
        expect(results.every(item => item.action === 'created')).toBe(true);
        expect(add).toHaveBeenCalledTimes(2);
        // map-only NEW не создаётся и не обновляется
        expect(add).not.toHaveBeenCalledWith(
            expect.objectContaining({ STATUS_ID: 'NEW' }),
        );
    });

    it('НИКОГДА не удаляет чужие статусы портала', async () => {
        const { bitrix, remove } = makeBitrix([
            {
                ID: '9',
                STATUS_ID: 'CLIENT_CUSTOM',
                NAME: 'Клиентский',
                SORT: 15,
            },
        ]);
        await service.sync(bitrix as never, template);
        expect(remove).not.toHaveBeenCalled();
    });

    it('существующий совпадающий статус пропускается, разошедшийся — обновляется', async () => {
        const { bitrix, add, update } = makeBitrix([
            {
                ID: '5',
                STATUS_ID: 'PBX_TAKEN_IN_WORK',
                NAME: 'Взята в работу',
                SORT: 22,
                COLOR: '#55D0E0',
            },
            {
                ID: '6',
                STATUS_ID: 'PBX_COMPANY_WORK',
                NAME: 'Старое название',
                SORT: 24,
                COLOR: '#47E4C2',
            },
        ]);

        const results = await service.sync(bitrix as never, template);

        const byCode = new Map(results.map(item => [item.code, item]));
        expect(byCode.get('lead_taken_in_work')?.action).toBe('skipped');
        expect(byCode.get('lead_company_work')?.action).toBe('updated');
        expect(add).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledWith(
            '6',
            expect.objectContaining({ NAME: 'Работа с компанией' }),
        );
    });

    it('SORT вжимается под минимальный финальный статус', async () => {
        const { bitrix, add } = makeBitrix([
            { ID: '2', STATUS_ID: 'CONVERTED', SORT: 20, SEMANTICS: 'S' },
            { ID: '3', STATUS_ID: 'JUNK', SORT: 30, SEMANTICS: 'F' },
        ]);

        const results = await service.sync(bitrix as never, template);

        // желаемые 22/24 >= финального 20 → оба вжаты в 19
        expect(results.map(item => item.sort)).toEqual([19, 19]);
        expect(add).toHaveBeenCalledWith(expect.objectContaining({ SORT: 19 }));
    });

    it('Duplicate STATUS_ID при add не роняет синк — стадия считается существующей', async () => {
        const { bitrix, add } = makeBitrix([]);
        add.mockRejectedValueOnce(new Error('Error: Duplicate STATUS_ID.'));

        const results = await service.sync(bitrix as never, template);

        const byCode = new Map(results.map(item => [item.code, item]));
        expect(byCode.get('lead_taken_in_work')?.action).toBe('skipped');
        expect(byCode.get('lead_company_work')?.action).toBe('created');
    });

    it('onlyCodes сужает установку', async () => {
        const { bitrix, add } = makeBitrix([]);
        const results = await service.sync(bitrix as never, template, [
            'lead_company_work',
        ]);
        expect(results).toHaveLength(1);
        expect(results[0].code).toBe('lead_company_work');
        expect(add).toHaveBeenCalledTimes(1);
    });
});
