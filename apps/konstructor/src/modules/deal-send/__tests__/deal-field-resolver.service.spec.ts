import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    DealFieldResolverService,
    hasKnownListItem,
} from '../services/deal-field-resolver.service';
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
            {
                code: 'hdd',
                reason: 'not_on_portal',
                title: 'Носители, используемые при предоставлении услуг',
            },
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
                {
                    code: 'consalting',
                    reason: 'ambiguous_code',
                    title: 'Consalting',
                },
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

    describe('списочное поле: пункт должен быть на портале', () => {
        const contractType = {
            bitrixId: 'UF_CRM_1684144993',
            title: 'Тип договора',
            type: 'enumeration',
            items: [{ bitrixId: 5440 }, { bitrixId: 5444 }],
        };
        const portal = {
            getDealFieldBitrixIdByCode: (code: string) =>
                code === 'contract_type' ? contractType.bitrixId : '',
            getDealFields: () => [contractType],
            getFieldBitrixId: (item: { bitrixId: string }) => item.bitrixId,
        } as unknown as PortalModel;

        it('пункт есть — пишется', () => {
            const result = new DealFieldResolverService(portal).resolve([
                field('contract_type', 5444),
            ]);
            expect(result.fields).toEqual({ UF_CRM_1684144993: 5444 });
        });

        it('ID строки БД вместо пункта Bitrix — не пишем и называем поле', () => {
            const result = new DealFieldResolverService(portal).resolve([
                field('contract_type', 2531),
            ]);
            expect(result.fields).toEqual({});
            expect(result.skipped).toEqual([
                {
                    code: 'contract_type',
                    reason: 'unknown_item',
                    title: 'Тип договора',
                },
            ]);
        });
    });

    describe('hasKnownListItem', () => {
        const list = { type: 'enumeration', items: [{ bitrixId: 7 }] } as never;

        it('не список — без проверки', () => {
            expect(hasKnownListItem({ type: 'string' } as never, 99)).toBe(
                true,
            );
        });

        it('названия вместо ID — без проверки', () => {
            expect(hasKnownListItem(list, ['Гарант-Юрист'])).toBe(true);
        });

        it('ID строкой и числом; пустой список пунктов — расхождение', () => {
            expect(hasKnownListItem(list, '7')).toBe(true);
            expect(hasKnownListItem(list, 8)).toBe(false);
            expect(
                hasKnownListItem(
                    { type: 'enumeration', items: [] } as never,
                    7,
                ),
            ).toBe(false);
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

        // id в crm.item.productrow.set — ID существующей позиции сделки,
        // а не товара: туда уходил номер продукта или ID «Типа договора»
        it('id позиции не передаём', () => {
            const service = new DealFieldResolverService(portalModelWith({}));

            const [resolved] = service.resolveProductRows([row()]);

            expect(resolved).not.toHaveProperty('id');
        });
    });

    describe('quantity_for_kp → offer_supply_q', () => {
        const quantity = field(
            'quantity_for_kp',
            'Интернет версия на 1 одновременный доступ к системе',
        );

        it('пишем в существующее поле шаблонов UF_CRM_1689656448', () => {
            const service = new DealFieldResolverService(
                portalModelWith({ offer_supply_q: 'UF_CRM_1689656448' }),
            );

            const result = service.resolve([quantity]);

            expect(result.fields).toEqual({
                UF_CRM_1689656448:
                    'Интернет версия на 1 одновременный доступ к системе',
            });
            expect(result.skipped).toEqual([]);
        });

        it('поля нет на портале — skipped с исходным кодом', () => {
            const service = new DealFieldResolverService(portalModelWith({}));

            const result = service.resolve([quantity]);

            expect(result.skipped.map(item => item.code)).toEqual([
                'quantity_for_kp',
            ]);
        });
    });
});
