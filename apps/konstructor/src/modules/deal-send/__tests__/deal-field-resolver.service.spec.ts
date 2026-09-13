import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { DealFieldResolverService } from '../services/deal-field-resolver.service';
import { DealSendFieldDto, DealSendProductRowDto } from '../dto/deal-send.dto';

/**
 * Ручка принимает коды полей, а не `UF_CRM_*`: карта идентификаторов живёт в
 * pbx-схеме портала, а не в Google-таблице на фронте.
 */
describe('DealFieldResolverService', () => {
    const portalModelWith = (
        dealFields: Record<string, string>,
        measures: Record<string, { bitrixId: string; shortName: string }> = {},
    ): PortalModel =>
        ({
            getDealFieldBitrixIdByCode: (code: string) =>
                dealFields[code] ?? '',
            getMeasureByCode: (code: string) => measures[code],
            // портал отдаёт по одному полю на каждый код из dealFields
            getDealFields: () =>
                Object.values(dealFields).map(bitrixId => ({ bitrixId })),
            getFieldBitrixId: (item: { bitrixId: string }) =>
                item.bitrixId.startsWith('UF_CRM_')
                    ? item.bitrixId
                    : `UF_CRM_${item.bitrixId}`,
        }) as unknown as PortalModel;

    const field = (
        code: string,
        value: DealSendFieldDto['value'],
    ): DealSendFieldDto => ({ code, value }) as DealSendFieldDto;

    it('переводит коды в поля сделки этого портала', () => {
        const service = new DealFieldResolverService(
            portalModelWith({
                complect_name: 'UF_CRM_1684145200',
                note: 'UF_CRM_NOTE',
            }),
        );

        const result = service.resolve([
            field('complect_name', 'Гарант-Юрист'),
            field('note', 'комментарий'),
        ]);

        expect(result.fields).toEqual({
            UF_CRM_1684145200: 'Гарант-Юрист',
            UF_CRM_NOTE: 'комментарий',
        });
        expect(result.skipped).toEqual([]);
    });

    it('поля нет на портале — значение не пишем, код возвращаем наверх', () => {
        const service = new DealFieldResolverService(
            portalModelWith({ note: 'UF_CRM_NOTE' }),
        );

        const result = service.resolve([
            field('note', 'есть'),
            field('hdd', 'нет такого поля'),
        ]);

        expect(result.fields).toEqual({ UF_CRM_NOTE: 'есть' });
        expect(result.skipped).toEqual([
            { code: 'hdd', reason: 'not_on_portal' },
        ]);
    });

    it('пустой список полей — пустой результат', () => {
        const service = new DealFieldResolverService(portalModelWith({}));

        expect(service.resolve([])).toEqual({ fields: {}, skipped: [] });
    });

    describe('неоднозначный код (consalting — два разных поля сделки)', () => {
        // id из канона: 1684145094 — инфоблочное описание, 1687965767 — продуктовое
        const portal = portalModelWith({
            consaltingUpdate: '1684145094',
            consaltingProduct: '1687965767',
        });

        it('без appType значение не пишется — иначе попадёт не в то поле', () => {
            const service = new DealFieldResolverService(portal);

            const result = service.resolve([field('consalting', 'текст')]);

            expect(result.fields).toEqual({});
            expect(result.skipped).toEqual([
                { code: 'consalting', reason: 'ambiguous_code' },
            ]);
        });

        it('appType update — инфоблочное описание', () => {
            const service = new DealFieldResolverService(portal);

            const result = service.resolve([
                { code: 'consalting', appType: 'update', value: 'описание' },
            ] as DealSendFieldDto[]);

            expect(result.fields).toEqual({ UF_CRM_1684145094: 'описание' });
        });

        it('appType product — продуктовое поле', () => {
            const service = new DealFieldResolverService(portal);

            const result = service.resolve([
                { code: 'consalting', appType: 'product', value: 'название' },
            ] as DealSendFieldDto[]);

            expect(result.fields).toEqual({ UF_CRM_1687965767: 'название' });
        });
    });

    describe('resolveProductRows', () => {
        const row = (
            over: Partial<DealSendProductRowDto> = {},
        ): DealSendProductRowDto =>
            ({
                productName: 'Гарант-Юрист',
                price: 7000,
                quantity: 12,
                ...over,
            }) as DealSendProductRowDto;

        it('код единицы Битрикса передаётся как есть, как в легаси', () => {
            const service = new DealFieldResolverService(portalModelWith({}));

            const [resolved] = service.resolveProductRows([
                row({ measureCode: 15 }),
            ]);

            // 15 — «Код» единицы «Месяц» в Битриксе, он же portal_measure.bitrixId
            expect(resolved.measureCode).toBe('15');
            expect(resolved.measureId).toBe('15');
            expect(resolved.customized).toBe('Y');
        });

        it('явный measureId не перетирается кодом', () => {
            const service = new DealFieldResolverService(portalModelWith({}));

            const [resolved] = service.resolveProductRows([
                row({ measureCode: 15, measureId: 11 }),
            ]);

            expect(resolved.measureCode).toBe('15');
            expect(resolved.measureId).toBe(11);
        });

        it('семантический код резолвится в bitrixId портальной единицы', () => {
            const service = new DealFieldResolverService(
                portalModelWith(
                    {},
                    { month: { bitrixId: '15', shortName: 'мес.' } },
                ),
            );

            const [resolved] = service.resolveProductRows([
                row({ measureSemanticCode: 'month' }),
            ]);

            expect(resolved.measureCode).toBe('15');
        });

        it('без единицы измерения строка всё равно собирается', () => {
            const service = new DealFieldResolverService(portalModelWith({}));

            const [resolved] = service.resolveProductRows([row()]);

            expect(resolved.measureCode).toBeUndefined();
            expect(resolved.productName).toBe('Гарант-Юрист');
        });

        it('цена до скидки по умолчанию равна цене, скидка — нулю', () => {
            const service = new DealFieldResolverService(portalModelWith({}));

            const [resolved] = service.resolveProductRows([row()]);

            expect(resolved.priceNetto).toBe(7000);
            expect(resolved.discountSum).toBe(0);
            expect(resolved.discountTypeId).toBe(1);
        });

        it('порядок строк по умолчанию — их порядок в запросе', () => {
            const service = new DealFieldResolverService(portalModelWith({}));

            const resolved = service.resolveProductRows([
                row({ productName: 'первый' }),
                row({ productName: 'второй', sort: 100 }),
            ]);

            expect(resolved[0].sort).toBe(0);
            expect(resolved[1].sort).toBe(100);
        });
    });
});
