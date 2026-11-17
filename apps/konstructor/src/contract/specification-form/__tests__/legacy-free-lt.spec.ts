import { readFileSync } from 'fs';
import { join } from 'path';
import { SupplyTextService } from '@lib/garant';
import { ContractSpecificationCodeEnum } from '@app/konstructor/document-generate/dto/specification/specification.dto';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { legacyFreeLt } from '../lib/legacy-free-lt.util';
import { ContractSpecificationFormService } from '../services/contract-specification-form.service';

/**
 * Бесплатный LT для легаси-клиентов (init-form отчёта о поставке) — порт
 * Laravel SupplyController::getSpecification. До 17.11.2026 Nest ставил
 * пустые specification_lt_free*, и «Бесплатный LegalTech» пропадал из отчёта
 * и комментария заявки RPA (gsr, сделка 212925, Гарант-Юрист).
 */
type Json = Record<string, any>;

const EXAMPLE = join(
    __dirname,
    '../../../document-supply-report/dto/suppli-init-form-example.dto.json',
);
const example = (): Json => JSON.parse(readFileSync(EXAMPLE, 'utf8')) as Json;

const SUTYAZHNIK = 'Аналитическая система "Сутяжник"';
const KONSTRUKTOR = 'Конструктор правовых документов';

describe('legacyFreeLt', () => {
    it('Гарант-Юрист: lt [0, 1] → Малый пакет, Сутяжник и Конструктор', () => {
        expect(legacyFreeLt([0, 1], example().legalTech)).toEqual({
            freePacket: 'ГАРАНТ-LegalTech. Малый пакет',
            freeServices: [SUTYAZHNIK, KONSTRUKTOR],
        });
    });

    it('пять сервисов → Средний пакет (вес = число сервисов)', () => {
        const result = legacyFreeLt([0, 1, 2, 8, 12], example().legalTech);
        expect(result.freePacket).toBe('ГАРАНТ-LegalTech. Средний пакет');
        expect(result.freeServices).toHaveLength(5);
    });

    it('сервис 16 весит вдвое: [0, 1, 2, 16] → вес 5', () => {
        expect(
            legacyFreeLt([0, 1, 2, 16], example().legalTech).freePacket,
        ).toBe('ГАРАНТ-LegalTech. Средний пакет');
    });

    it('null-«дыры» каталога (value[13..15]) пропускаются', () => {
        const legalTech = example().legalTech;
        expect(legalTech.value).toContain(null);
        expect(
            legacyFreeLt([0, 1], legalTech).freeServices,
        ).not.toContain(undefined);
    });

    it('пакета такого веса нет → бесплатного LT нет (как в Laravel)', () => {
        expect(legacyFreeLt([0, 1, 2], example().legalTech)).toEqual({
            freePacket: '',
            freeServices: [],
        });
    });

    it('пустой состав или нет каталога → пусто, без исключений', () => {
        const empty = { freePacket: '', freeServices: [] };
        expect(legacyFreeLt([], example().legalTech)).toEqual(empty);
        expect(legacyFreeLt(undefined, example().legalTech)).toEqual(empty);
        expect(legacyFreeLt([0, 1], undefined)).toEqual(empty);
        expect(legacyFreeLt([0, 1], { value: [] })).toEqual(empty);
    });
});

describe('ContractSpecificationFormService.legacySpecification: бесплатный LT', () => {
    const service = new ContractSpecificationFormService(
        {} as SupplyTextService,
    );
    const build = (complectLt?: number[]) => {
        const body = example();
        return service.legacySpecification({
            products: body.products,
            consaltingProduct: body.consalting.product,
            contractType: body.contractType as CONTRACT_LTYPE,
            rows: body.arows,
            contractCoefficient: 1,
            documentInfoblocks: body.documentInfoblocks,
            complectLt,
            legalTech: body.legalTech,
        });
    };
    const item = (
        items: ReturnType<typeof build>,
        code: ContractSpecificationCodeEnum,
    ) => items.find(i => i.code === code);

    it('комплект с бесплатным LT → пункты заполнены и активны', () => {
        const items = build([0, 1]);
        expect(item(items, ContractSpecificationCodeEnum.LT_FREE)).toMatchObject({
            value: 'ГАРАНТ-LegalTech. Малый пакет',
            isActive: true,
        });
        expect(
            item(items, ContractSpecificationCodeEnum.LT_FREE_SERVICES),
        ).toMatchObject({
            value: ` ${SUTYAZHNIK}\n ${KONSTRUKTOR}\n`,
            isActive: true,
        });
    });

    it('без бесплатного LT → пункты пустые и неактивны, как раньше', () => {
        const items = build([]);
        expect(item(items, ContractSpecificationCodeEnum.LT_FREE)).toMatchObject({
            value: '',
            isActive: false,
        });
        expect(
            item(items, ContractSpecificationCodeEnum.LT_FREE_SERVICES),
        ).toMatchObject({ value: '', isActive: false });
    });
});
