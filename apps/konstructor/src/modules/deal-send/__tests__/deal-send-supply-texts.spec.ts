import { ResolvedSupplyTexts } from '@lib/garant';
import { DealSendFieldDto } from '../dto/deal-send.dto';
import {
    buildSupplyTextFields,
    mergeSupplyTextFields,
} from '../services/deal-send-supply-texts.service';

const texts: ResolvedSupplyTexts = {
    code: 'internet_5',
    type: 'internet',
    usersQuantity: 5,
    coefficient: 2,
    name: 'Интернет 5 ОД',
    sourceCode: 'internet_5',
    contractName: 'Многопользовательская Интернет-версия 5',
    contractProp1: '',
    contractProp2: '',
    contractPropSuppliesQuantity: '5',
    contractPropLoginsQuantity: 'Неограниченно … пяти Пользователей',
    contractPropComment: 'Комментарий услуг',
    contractPropEmail: 'E-mail услуг',
    quantityForKp: 'Интернет версия на 5 одновременных доступов к системе',
    lcontractName: 'Лицензионная Интернет-версия 5',
    lcontractProp2: 'специалистом Лицензиара',
    lcontractPropComment: 'Комментарий лицензии',
    lcontractPropEmail: 'E-mail лицензии',
    acontractName: 'Абонентская Интернет-версия 5',
    acontractPropComment: 'Комментарий абонемента',
};

const byCode = (fields: DealSendFieldDto[], code: string) =>
    fields.find(field => field.code === code)?.value;

describe('deal-send: тексты поставки → поля сделки', () => {
    it('договор услуг: contract*-тексты, пустые не шлём, число поставок числом', () => {
        const fields = buildSupplyTextFields(texts, 'service');
        expect(byCode(fields, 'supply')).toBe('Интернет 5 ОД');
        expect(byCode(fields, 'supply_for_contract')).toBe(
            'Многопользовательская Интернет-версия 5',
        );
        expect(byCode(fields, 'note')).toBe('Комментарий услуг');
        expect(byCode(fields, 'note_3')).toBe('E-mail услуг');
        expect(byCode(fields, 'contract_supply_prop_q')).toBe(5);
        expect(byCode(fields, 'quantity_for_kp')).toContain('5 одновременных');
        expect(fields.some(field => field.code === 'hdd')).toBe(false);
        expect(fields.every(field => field.appType === 'product')).toBe(true);
    });

    it('лицензионный и абонентский берут свои тексты', () => {
        const lic = buildSupplyTextFields(texts, 'lic');
        expect(byCode(lic, 'supply_for_contract')).toBe(
            'Лицензионная Интернет-версия 5',
        );
        expect(byCode(lic, 'note')).toBe('Комментарий лицензии');
        expect(byCode(lic, 'way')).toBe('специалистом Лицензиара');
        const abon = buildSupplyTextFields(texts, 'abon');
        expect(byCode(abon, 'supply_for_contract')).toBe(
            'Абонентская Интернет-версия 5',
        );
        expect(byCode(abon, 'note')).toBe('Комментарий абонемента');
    });

    it('Флэш: количество поставок «Флэш» → 1', () => {
        const flash = buildSupplyTextFields(
            { ...texts, contractPropSuppliesQuantity: 'Флэш' },
            'service',
        );
        expect(byCode(flash, 'contract_supply_prop_q')).toBe(1);
    });

    it('merge: присланное фронтом поле сильнее резолва, остальные дополняются', () => {
        const fromFront: DealSendFieldDto[] = [
            { code: 'note', appType: 'product', value: 'Своё примечание' },
            { code: 'consalting', appType: 'update', value: ['Горячая линия'] },
        ];
        const merged = mergeSupplyTextFields(
            fromFront,
            buildSupplyTextFields(texts, 'service'),
        );
        expect(byCode(merged, 'note')).toBe('Своё примечание');
        expect(byCode(merged, 'supply')).toBe('Интернет 5 ОД');
        expect(merged.filter(field => field.code === 'note')).toHaveLength(1);
    });
});
