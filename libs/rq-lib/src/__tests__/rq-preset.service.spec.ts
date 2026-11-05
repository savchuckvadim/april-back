import { BadRequestException } from '@nestjs/common';
import { RqPresetService, presetKindOf } from '../services/rq-preset.service';
import { fakeBitrix, fakePortalModel, PRESET_SET } from './helpers/rq-fakes';

describe('RqPresetService', () => {
    const service = new RqPresetService();

    it('пресеты портала из bx_rqs: строки становятся числами, Bitrix не спрашивается', async () => {
        const { bitrix, call } = fakeBitrix();
        const presets = await service.resolve(bitrix, fakePortalModel());

        expect(presets).toEqual(PRESET_SET);
        expect(call).not.toHaveBeenCalled();
    });

    it('тип не зеркалирован в БД: берётся из Bitrix по XML_ID, затем по имени', async () => {
        const { bitrix, call } = fakeBitrix({
            'crm.requisite.preset.list': {
                result: [
                    { ID: '9', NAME: 'Организация', XML_ID: 'custom', ENTITY_TYPE_ID: '8', COUNTRY_ID: '1' },
                    { ID: '11', NAME: 'ИП', XML_ID: 'april_rq_preset_ip', ENTITY_TYPE_ID: '8', COUNTRY_ID: '1' },
                    { ID: '13', NAME: 'Физ. лицо', XML_ID: '', ENTITY_TYPE_ID: '8', COUNTRY_ID: '1' },
                    { ID: '14', NAME: 'Физ. лицо', XML_ID: '', ENTITY_TYPE_ID: '8', COUNTRY_ID: '14' },
                ],
            },
        });
        const presets = await service.resolve(
            bitrix,
            fakePortalModel({ preset_org: { bitrix_id: '2', name: 'Организация' } }),
        );

        expect(presets.org).toEqual({ id: 2, name: 'Организация' });
        expect(presets.ip).toEqual({ id: 11, name: 'ИП' });
        // по имени и стране; чужая страна отсеяна
        expect(presets.fiz).toEqual({ id: 13, name: 'Физ. лицо' });
        expect(call).toHaveBeenCalledTimes(1);
    });

    it('пресета нет ни в БД, ни в Bitrix — понятная ошибка, а не 1/3/5', async () => {
        const { bitrix } = fakeBitrix({ 'crm.requisite.preset.list': { result: [] } });
        await expect(service.resolve(bitrix, fakePortalModel({}))).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('presetKindOf: тип по id пресета портала, строка или число', () => {
        expect(presetKindOf(PRESET_SET, '4')).toBe('ip');
        expect(presetKindOf(PRESET_SET, 6)).toBe('fiz');
        expect(presetKindOf(PRESET_SET, 1)).toBeNull();
        expect(presetKindOf(PRESET_SET, null)).toBeNull();
    });
});
