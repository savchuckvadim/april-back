import { SupplyReportDataService } from '../services/data/supply-report-data.service';
import { DocumentSupplyReportGenerateDto } from '../dto/document-supply-report-generate.dto';
import { CONTRACT_LTYPE } from '../../document-generate/type/contract.type';

/**
 * Сборка данных для шаблона отчёта о поставке.
 *
 * Главное, что проверяем: форма полей сделки и компании (фронт шлёт ОБЪЕКТ по
 * коду поля, а не массив), тип клиента объектом, таблица товаров и итоги.
 */
describe('SupplyReportDataService.prepareTemplateData', () => {
    const service = new SupplyReportDataService();

    const arow = {
        name: 'Гарант-Юрист',
        productType: 'garant',
        currentSupply: { name: 'Интернет-версия' },
        price: {
            current: 8008,
            sum: 96096,
            default: 9000,
            quantity: 1,
            measure: { name: 'мес.' },
        },
        product: { contractCoefficient: 12 },
    };

    const dto = (over: Record<string, unknown> = {}) =>
        ({
            domain: 'gsr.bitrix24.ru',
            companyId: '555',
            contractType: CONTRACT_LTYPE.ABON,
            contract: {
                aprilName: 'Абонентский договор',
                prepayment: 1,
                contract: {
                    coefficient: 12,
                    productName: 'Услуги по сопровождению',
                },
            },
            productSet: {},
            arows: [arow],
            total: {
                name: 'Итого',
                supply: { name: 'Интернет-версия' },
                price: {
                    current: 96096,
                    sum: 96096,
                    quantity: 1,
                    measure: { name: 'мес.' },
                },
                product: { contractCoefficient: 12 },
            },
            supply: { type: 'internet' },
            region: { title: 'Ростовская область' },
            bxrq: { fields: [], address: { items: [] } },
            contractClientState: {},
            contractProviderState: {
                current: { rq: { fullname: 'ООО Апрель' } },
            },
            contractSpecificationState: { items: [] },
            bxCompanyItems: {
                supply_information: { current: 'обслуживаются' },
                op_client_type: { current: { name: 'Коммерческий' } },
            },
            bxDealItems: {
                contract_start: { current: '2026-01-01' },
                contract_end: { current: '2026-12-31' },
                supply_comment: { current: 'комментарий поставки' },
            },
            bxContacts: [],
            supplyReport: [
                {
                    type: 'string',
                    code: 'contract_number',
                    value: '15 от 01.09.2026',
                },
                {
                    type: 'select',
                    code: 'invoice_result',
                    value: { code: 'done' },
                    items: [
                        { code: 'done', name: 'Оплачен' },
                        { code: 'in_progress', name: 'На оплате' },
                    ],
                },
            ],
            clientType: { id: 0, code: 'org', name: 'Организация' },
            consalting: { current: { title: 'Горячая Линия' } },
            ...over,
        }) as unknown as DocumentSupplyReportGenerateDto;

    it('читает поля сделки объектом по коду — так их шлёт конструктор', () => {
        const data = service.prepareTemplateData(dto());

        expect(data.dealItems.supply_comment).toBe('комментарий поставки\n');
        // даты договора уходят в отдельные теги и в dealItems не дублируются
        expect(data.dealItems.contract_start).toBeUndefined();
        expect(data.contract_start).toBe('1 января 2026 г.');
        expect(data.contract_end).toBe('31 декабря 2026 г.');
    });

    it('читает поля компании объектом и разворачивает enum в название', () => {
        const data = service.prepareTemplateData(dto());

        expect(data.companyItems.supply_information).toBe('обслуживаются');
        expect(data.companyItems.op_client_type).toBe('Коммерческий');
    });

    it('те же поля в виде массива с key тоже читаются', () => {
        const data = service.prepareTemplateData(
            dto({
                bxDealItems: [{ key: 'supply_comment', current: 'из массива' }],
            }),
        );

        expect(data.dealItems.supply_comment).toBe('из массива\n');
    });

    it('собирает строку таблицы товаров с названием договора и размещением', () => {
        const data = service.prepareTemplateData(dto());

        expect(data.productRows).toHaveLength(1);
        expect(data.productRows[0]).toMatchObject({
            productNumber: 1,
            productName:
                'Услуги по сопровождению длительность 1 мес. (Гарант-Юрист)',
            productMeasure: 'мес.',
            productPrice: '8008.00',
            productSum: '96096.00',
            complect_sup: 'Интернет-версия',
        });
    });

    it('итоги считает вместе с суммой прописью и склонением месяцев', () => {
        const data = service.prepareTemplateData(dto());

        expect(data.totalData.contract_total_sum).toBe('96096.00');
        expect(data.totalData.total_quantity).toBe(12);
        expect(data.totalData.total_quantity_string).toBe('12 месяцев');
        expect(data.totalData.total_month_sum).toBe('8008.00');
        expect(String(data.totalData.contract_total_sum_string)).toMatch(
            /^\(.*рубл/i,
        );
    });

    it('форму отчёта раскладывает по кодам, у селекта берёт название пункта', () => {
        const data = service.prepareTemplateData(dto());

        expect(data.supplyReportItems.contract_number).toBe(
            '15 от 01.09.2026\n',
        );
        expect(data.supplyReportItems.invoice_result).toBe('Оплачен\n');
    });

    it('тип клиента объектом не ломает блок реквизитов', () => {
        const data = service.prepareTemplateData(
            dto({
                bxrq: {
                    fields: [
                        { code: 'shortname', value: 'ООО Ромашка' },
                        { code: 'inn', value: '6100000000' },
                    ],
                    address: { items: [] },
                },
            }),
        );

        expect(data.client_rq).toContain('ООО Ромашка');
        expect(data.client_rq).toContain('ИНН: 6100000000');
    });
});
