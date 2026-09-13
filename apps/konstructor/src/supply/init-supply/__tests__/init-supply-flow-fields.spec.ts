import { InitSupplyDto, InitSupplyFlow } from '../dto/init-supply.dto';
import {
    buildInitSupplyFlowFields,
    resolveSupplyContractTypeName,
} from '../lib/init-supply-flow-fields';

/**
 * Поставка и перезаключение живут в одной заявке RPA и одном типе. Отличают их
 * название и галка «Перезаключение» — по ним сотрудник сервиса фильтрует свой
 * список, поэтому ошибка здесь ломает работу отдела, а не код.
 */
describe('buildInitSupplyFlowFields', () => {
    const FIELD_IDS = {
        nameField: 'UF_RPA_9_NAME',
        extensionField: 'UF_RPA_9_IS_EXTENSION',
        contractTypeField: 'UF_RPA_9_CONTRACT_TYPE',
    };

    const dto = (over: Partial<InitSupplyDto> = {}): InitSupplyDto =>
        ({
            domain: 'gsr.bitrix24.ru',
            companyName: 'ООО Ромашка',
            flow: InitSupplyFlow.SUPPLY,
            contract: {
                contract: { name: 'Абонентский договор' },
                bitrixName: 'Абонентский',
                aprilName: 'Абонентский год',
            },
            ...over,
        }) as InitSupplyDto;

    it('поставка: в названии «Поставка», галка перезаключения снята', () => {
        const fields = buildInitSupplyFlowFields(dto(), FIELD_IDS);

        expect(fields[FIELD_IDS.nameField]).toBe('Поставка "ООО Ромашка"');
        expect(fields[FIELD_IDS.extensionField]).toBe(false);
    });

    it('перезаключение: в названии «Перезаключение», галка стоит', () => {
        const fields = buildInitSupplyFlowFields(
            dto({ flow: InitSupplyFlow.RENEWAL }),
            FIELD_IDS,
        );

        expect(fields[FIELD_IDS.nameField]).toBe('Перезаключение ООО Ромашка');
        expect(fields[FIELD_IDS.extensionField]).toBe(true);
    });

    it('тип договора берётся из портального договора', () => {
        const fields = buildInitSupplyFlowFields(dto(), FIELD_IDS);

        expect(fields[FIELD_IDS.contractTypeField]).toBe('Абонентский договор');
    });

    it('портального договора нет — падаем на bitrixName, потом на aprilName', () => {
        expect(
            resolveSupplyContractTypeName(
                dto({
                    contract: {
                        bitrixName: 'Абонентский',
                        aprilName: 'Абонентский год',
                    },
                } as Partial<InitSupplyDto>),
            ),
        ).toBe('Абонентский');

        expect(
            resolveSupplyContractTypeName(
                dto({
                    contract: { aprilName: 'Абонентский год' },
                } as Partial<InitSupplyDto>),
            ),
        ).toBe('Абонентский год');
    });

    it('поля нет на портале — значение не пишется, а не уходит в undefined-ключ', () => {
        const fields = buildInitSupplyFlowFields(dto(), {
            nameField: undefined,
            extensionField: undefined,
            contractTypeField: undefined,
        });

        expect(Object.keys(fields)).toHaveLength(0);
    });

    it('тип договора не определился — поле не трогаем', () => {
        const fields = buildInitSupplyFlowFields(
            dto({ contract: undefined } as Partial<InitSupplyDto>),
            FIELD_IDS,
        );

        expect(fields[FIELD_IDS.contractTypeField]).toBeUndefined();
        expect(fields[FIELD_IDS.nameField]).toBe('Поставка "ООО Ромашка"');
    });
});
