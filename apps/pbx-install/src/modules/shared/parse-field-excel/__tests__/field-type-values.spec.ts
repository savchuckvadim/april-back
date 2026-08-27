import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EUserFieldType } from '@lib/bitrix';
import { mapFieldTypeToBitrixType } from '@lib/portal-lib/pbx-domain';
import {
    FIELD_TYPE_VALUES,
    InstallEntityFieldDto,
} from '../dto/parse-field.dto';

/** Поле-файл из Excel-шаблона установки (боевой кейс 27.08.2026). */
const FILE_FIELD = {
    name: 'Текущий договор',
    appType: 'rpa_supply',
    type: 'file',
    list: [],
    code: 'current_contract',
    bxFieldName: 'CURRENT_CONTRACT',
    order: 588,
    isNeedUpdate: true,
    isMultiple: false,
};

describe('Типы устанавливаемых полей', () => {
    it('тип «file» проходит валидацию установки (раньше был 400 Bad Request)', async () => {
        const dto = plainToInstance(InstallEntityFieldDto, FILE_FIELD);

        const errors = await validate(dto);

        expect(errors).toHaveLength(0);
    });

    it('«file» есть в списке допустимых типов', () => {
        expect(FIELD_TYPE_VALUES).toContain('file');
    });

    it('«file» маппится в пользовательский тип файла Bitrix', () => {
        expect(mapFieldTypeToBitrixType('file')).toBe(EUserFieldType.FILE);
    });

    it('несуществующий тип по-прежнему отвергается', async () => {
        const dto = plainToInstance(InstallEntityFieldDto, {
            ...FILE_FIELD,
            type: 'unknown-type',
        });

        const errors = await validate(dto);

        expect(errors.some(error => error.property === 'type')).toBe(true);
    });
});
