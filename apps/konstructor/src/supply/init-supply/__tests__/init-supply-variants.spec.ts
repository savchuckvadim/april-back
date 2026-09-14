import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { ContractSpecificationCodeEnum } from '@app/konstructor/document-generate/dto/specification/specification.dto';
import { InitSupplyDto } from '../dto/init-supply.dto';
import {
    buildVariantLinksField,
    initSupplyForVariant,
    specificationFromComplect,
} from '../lib/init-supply-variants';

/**
 * Заявка с несколькими наборами: на каждого участника своя страница в
 * таймлайне и ссылки на элементы вариантов в поле заявки.
 */
describe('init-supply: варианты', () => {
    const variant = (over: Partial<DocumentVariantDto>): DocumentVariantDto =>
        ({
            variantSmartId: 9001,
            title: 'Юрист',
            contractType: CONTRACT_LTYPE.ABON,
            complect: [],
            rows: [],
            sets: { general: [], alternative: [] },
            total: { name: 'Итого' },
            ...over,
        }) as unknown as DocumentVariantDto;

    const dto = (over: Partial<InitSupplyDto> = {}): InitSupplyDto =>
        ({
            domain: 'gsr.bitrix24.ru',
            companyName: 'ООО Ромашка',
            contractType: CONTRACT_LTYPE.LIC,
            complect: [{ groupsName: 'сделка' }],
            total: [{ name: 'Итого сделки' }],
            contractSpecificationState: {
                items: [{ code: 'complect_name', value: 'X' }],
            },
            ...over,
        }) as unknown as InitSupplyDto;

    it('страница участника берёт комплект из варианта, сделку — из заявки', () => {
        const view = initSupplyForVariant(
            dto(),
            variant({ contractType: CONTRACT_LTYPE.ABON }),
        );

        expect(view.companyName).toBe('ООО Ромашка');
        expect(view.contractType).toBe(CONTRACT_LTYPE.ABON);
        expect(view.total).toEqual([{ name: 'Итого' }]);
        // спецификации у варианта нет — остаётся спецификация заявки
        expect(view.contractSpecificationState.items[0].code).toBe(
            'complect_name',
        );
    });

    describe('спецификация из наполнения', () => {
        const complect = (type: string, names: string[]) =>
            ({
                groupsName: type,
                type,
                value: names.map(name => ({ name, checked: true })),
            }) as unknown as DocumentVariantDto['complect'][number];

        it('инфоблоки и имя комплекта — из варианта, остальное — из заявки', () => {
            const spec = specificationFromComplect(
                variant({
                    title: 'Юрист',
                    complect: [
                        complect('npa', ['НПА']),
                        complect('la', ['Практика']),
                        complect('er', ['Энциклопедия']),
                    ],
                }),
                {
                    items: [
                        { code: 'complect_name', value: 'X' },
                        { code: 'specification_iblocks', value: 'старое' },
                        { code: 'specification_supply', value: 'ОД сделки' },
                    ],
                } as unknown as InitSupplyDto['contractSpecificationState'],
            );
            const byCode = Object.fromEntries(
                spec.items.map(item => [item.code, item.value]),
            );

            expect(byCode.complect_name).toBe('Юрист');
            expect(byCode.specification_iblocks).toBe('НПА\nПрактика');
            expect(byCode.specification_ers).toBe('Энциклопедия');
            // поле про ОД не относится к наполнению — остаётся от заявки
            expect(byCode.specification_supply).toBe('ОД сделки');
        });

        it('невыбранные инфоблоки не попадают', () => {
            const spec = specificationFromComplect(
                variant({
                    complect: [
                        {
                            groupsName: 'npa',
                            type: 'npa',
                            value: [
                                { name: 'Да', checked: true },
                                { name: 'Нет', checked: false },
                            ],
                        } as unknown as DocumentVariantDto['complect'][number],
                    ],
                }),
                {
                    items: [],
                } as unknown as InitSupplyDto['contractSpecificationState'],
            );

            expect(
                spec.items.find(
                    item => item.code === ContractSpecificationCodeEnum.IBLOCKS,
                )?.value,
            ).toBe('Да');
        });
    });

    describe('поле со ссылками на варианты', () => {
        const portalModel = (
            fieldId: string | undefined,
            crm: string | undefined,
        ) =>
            ({
                getRpaFieldBitrixIdByCode: () => fieldId,
                getSmartByType: () => (crm ? { crm } : undefined),
            }) as unknown as PortalModel;

        it('ссылки в формате динамического типа: префикс из smarts.crm + id', () => {
            const fields = buildVariantLinksField(
                dto({
                    variants: [
                        variant({ variantSmartId: 9001 }),
                        variant({ variantSmartId: 9002 }),
                    ],
                }),
                portalModel('UF_RPA_9_VARIANTS', 'T416_'),
            );

            expect(fields).toEqual({
                UF_RPA_9_VARIANTS: ['T416_9001', 'T416_9002'],
            });
        });

        it('поля на портале нет — заявка создаётся без ссылок, а не с undefined-ключом', () => {
            expect(
                buildVariantLinksField(
                    dto({ variants: [variant({})] }),
                    portalModel(undefined, 'T416_'),
                ),
            ).toEqual({});
        });

        it('вариантов нет — поле не трогаем', () => {
            expect(
                buildVariantLinksField(dto(), portalModel('UF', 'T416_')),
            ).toEqual({});
        });
    });
});
