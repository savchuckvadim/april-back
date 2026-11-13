import { ContractEntity } from '@lib/garant/contract/contract.entity';
import { PortalContractEntity } from '@lib/garant/contract/portal-contract.entity';
import { KonstructorInitUseCase } from '../konstructor-init.use-case';

/**
 * itemId договора — значение для поля сделки «Тип договора» (deal-send) и
 * для легаси-фронта. Laravel отдавал bitrixId пункта списка; новый init
 * отдавал bitrixfield_item_id (ID строки БД), и в сделку уходил
 * несуществующий пункт — карточка показывала «не выбрано».
 */
const contract = (bitrixId?: number): PortalContractEntity => ({
    id: BigInt(7),
    title: 'Лицензионный 12 мес.',
    template: null,
    order: 1,
    portal_id: BigInt(1),
    contract_id: BigInt(3),
    portal_measure_id: BigInt(19),
    bitrixfield_item_id: BigInt(2531),
    productName: null,
    description: null,
    created_at: null,
    updated_at: null,
    ...(bitrixId === undefined ? {} : { bitrixfield_items: { bitrixId } }),
});

// зависимости init для маппинга договора не нужны
const useCase = Object.create(
    KonstructorInitUseCase.prototype,
) as KonstructorInitUseCase;

describe('init: itemId договора', () => {
    it('ID пункта «Тип договора» в Битриксе, не ID строки БД', () => {
        expect(useCase['getContract'](contract(5444)).itemId).toBe(5444);
    });

    it('пункт не привязан — 0 (фронт не пишет тип договора)', () => {
        expect(useCase['getContract'](contract()).itemId).toBe(0);
    });
});

describe('init: формулировка товара договора', () => {
    const wording =
        'Неисключительная лицензия на использование базы данных';
    const withGeneral = (productName: string | null): PortalContractEntity => ({
        ...contract(5444),
        contracts: {
            name: 'Лицензионный',
            title: 'Лицензионный',
            productName,
        } as ContractEntity,
    });

    it('contracts.productName уходит во фронт — им подписана строка спецификации', () => {
        expect(
            useCase['getContract'](withGeneral(wording)).contract.productName,
        ).toBe(wording);
    });

    it('без формулировки — пустая строка (генерация возьмёт имя договора)', () => {
        expect(
            useCase['getContract'](withGeneral(null)).contract.productName,
        ).toBe('');
    });
});
