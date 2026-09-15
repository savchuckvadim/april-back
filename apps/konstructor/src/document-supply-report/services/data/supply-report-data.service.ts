import { Injectable, Logger } from '@nestjs/common';
import { DocumentSupplyReportGenerateDto } from '../../dto/document-supply-report-generate.dto';
import { CONTRACT_LTYPE } from '../../../document-generate/type/contract.type';
import { ProductRowDto } from '../../../document-generate/dto/product-row/product-row.dto';
import {
    ProductDto,
    ProductTypeEnum,
} from '../../../document-generate/dto/product/product.dto';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { formatRuble } from '../../../document-generate/lib/rubles.util';
import { ClientTypeEnum } from '../../../document-generate/type/client.type';
import {
    getMonthTitleAccusative,
    readFieldText,
    readPbxCurrent,
    resolveClientTypeCode,
    toMoneyString,
    toPbxEntries,
} from '../../lib/supply-report.util';
import {
    ConsaltingPayload,
    ContractProviderStatePayload,
    SupplyReportContactPayload,
    SupplyReportFormPayloadItem,
} from '../../lib/supply-report-payload.type';
import { BxRqDto } from '../../../document-generate/dto/bx-rq/bx-rq.dto';
import {
    ADDRESS_RQ_ITEM_CODE,
    BANK_RQ_ITEM_CODE,
    BX_ADDRESS_TYPE,
    RQ_ITEM_CODE,
} from '../../../document-generate/type/bx-rq.type';
import {
    ContractSpecificationCodeEnum,
    ContractSpecificationItemDto,
} from '../../../document-generate/dto/specification/specification.dto';
import { getErrorString } from '@lib/shared';

/** Куда в блоке реквизитов кладётся банковское поле. */
type BankRqSlot = 'bank' | 'rs' | 'ks' | 'bik' | 'other';

dayjs.extend(customParseFormat);
dayjs.extend(localizedFormat);
dayjs.locale('ru');

export interface SupplyReportTemplateData {
    // Client data
    client_company_name: string;
    client_inn: string;
    client_company_registred_address: string;
    client_company_primary_address: string;

    // Contract data
    region: string;
    contract_type: string;
    provider_fullname: string;
    bx_deal: string;

    // Price data
    total_sum: number;
    prepayment_sum: number;
    prepayment_quantity: number;

    // Dates
    contract_start: string;
    contract_end: string;
    present_period: string;

    // Contact person
    garant_client_assigned_name?: string;
    garant_client_assigned_phone?: string;
    email_garant?: string;

    // Specification
    complect_fields_left: string;
    complect_fields_right: string;
    complect_lt_left: string;
    complect_lt_right: string;
    complect_pk: string;

    // Client RQ (if withRq)
    client_rq?: string;

    // Products rows
    productRows: Record<string, string | number>[];

    // Total data
    totalData: Record<string, string | number>;

    // Complects
    complects: Array<{
        complect_name: string;
        complect_sup: string;
        complect_hdd: string;
    }>;

    // Contacts
    contacts: Array<{
        contact_name: string;
        contact_post: string;
        contact_status: string;
        contact_phone: string;
        contact_comment: string;
    }>;

    // Company items
    companyItems: Record<string, string>;

    // Deal items
    dealItems: Record<string, string>;

    // Supply report items
    supplyReportItems: Record<string, string>;
}

@Injectable()
export class SupplyReportDataService {
    private readonly logger = new Logger(SupplyReportDataService.name);

    /**
     * Подготавливает все данные для шаблона отчета о поставке
     */
    prepareTemplateData(
        dto: DocumentSupplyReportGenerateDto,
    ): SupplyReportTemplateData {
        const {
            companyId,
            contractType,
            contract,
            arows,
            total,
            supply,
            region,
            bxrq,
            contractProviderState,
            contractSpecificationState,
            bxCompanyItems,
            bxDealItems,
            bxContacts,
            supplyReport,
            clientType,
            consalting,
        } = dto;

        // Название продукта лежит во вложенной модели контракта (contract.contract):
        // именно её конструктор заполняет из справочника портала.
        const contractProductName = contract.contract?.productName ?? '';
        const contractCoefficient = contract?.prepayment || 1;
        const isProduct = contractType !== CONTRACT_LTYPE.SERVICE;

        // Обрабатываем total: конструктор шлёт его то объектом, то массивом строк
        const totalPayload = total as ProductRowDto | ProductRowDto[];
        const contractFullTotal: ProductRowDto | undefined = Array.isArray(
            totalPayload,
        )
            ? totalPayload[0]
            : totalPayload;

        // Вычисляем суммы
        const { totalSum, totalMonth, quantity } = this.calculateTotals(
            arows,
            contractFullTotal,
        );

        // фронт шлёт clientType объектом SelectItem, ветка IS_BACK — строкой
        const clientTypeCode = resolveClientTypeCode(clientType);

        // Обрабатываем адреса и реквизиты клиента
        const { clientCompanyFullName, inn, registredString, primaryString } =
            this.processClientAddresses(bxrq, clientTypeCode);

        // Получаем данные провайдера
        const providerFullname = this.getProviderFullname(
            contractProviderState,
        );

        // Получаем строку консалтинга
        const consaltingString = this.getConsaltingString(consalting);

        // Фильтруем спецификацию контракта
        const filteredSpecification = this.filterContractSpecification(
            contractSpecificationState.items,
            contractType,
            supply?.type,
        );

        // Обрабатываем спецификацию
        const specificationData = this.processSpecification(
            filteredSpecification,
            consaltingString,
        );

        // Обрабатываем даты
        const datesData = this.processDates(bxDealItems);

        // Обрабатываем продукты
        const productRows = this.getSupplyProducts(
            arows,
            contractProductName,
            isProduct,
            contractCoefficient,
            clientTypeCode,
        );

        // Обрабатываем итоги
        const totalData = this.getSupplyTotal(
            contractFullTotal,
            clientTypeCode,
        );

        // Обрабатываем реквизиты клиента
        const clientRqData = this.getClientRQ(clientTypeCode, bxrq);

        // Обрабатываем комплекты
        const complects = this.processComplects(arows);

        // Обрабатываем контакты
        const contacts = this.processContacts(bxContacts);

        // Обрабатываем элементы компании
        const companyItems = this.processCompanyItems(bxCompanyItems);

        // Обрабатываем элементы сделки
        const dealItems = this.processDealItems(bxDealItems);

        // Обрабатываем элементы отчета о поставке
        const supplyReportItems = this.processSupplyReportItems(supplyReport);

        return {
            client_company_name: clientCompanyFullName,
            client_inn: inn,
            client_company_registred_address: registredString,
            client_company_primary_address: primaryString,
            region: region.title,
            contract_type: contract.aprilName,
            provider_fullname: providerFullname,
            bx_deal: companyId,
            total_sum: totalSum,
            prepayment_sum: totalMonth,
            prepayment_quantity: quantity,
            contract_start: datesData.contract_start,
            contract_end: datesData.contract_end,
            present_period: datesData.present_period,
            garant_client_assigned_name: datesData.garant_client_assigned_name,
            garant_client_assigned_phone:
                datesData.garant_client_assigned_phone,
            email_garant: datesData.email_garant,
            complect_fields_left: specificationData.iblocks,
            complect_fields_right: specificationData.ifree,
            complect_lt_left: specificationData.lt_free,
            complect_lt_right: specificationData.lt_packet,
            complect_pk: specificationData.pk,
            client_rq: clientRqData,
            productRows,
            totalData,
            complects,
            contacts,
            companyItems,
            dealItems,
            supplyReportItems,
        };
    }

    /**
     * Вычисляет итоговые суммы
     */
    private calculateTotals(
        arows: ProductRowDto[],
        total: ProductRowDto | undefined,
    ): { totalSum: number; totalMonth: number; quantity: number } {
        let totalSum = 0;

        for (const arow of arows) {
            totalSum += Math.round((arow.price?.sum || 0) * 100) / 100;
        }

        const quantity =
            (total?.product?.contractCoefficient || 1) *
            (total?.price?.quantity || 1);
        const totalMonth = Math.round((totalSum / quantity) * 100) / 100;

        return { totalSum, totalMonth, quantity };
    }

    /**
     * Обрабатывает адреса и реквизиты клиента
     */
    private processClientAddresses(
        bxrq: BxRqDto | undefined,
        clientType: ClientTypeEnum,
    ): {
        clientCompanyFullName: string;
        inn: string;
        registredString: string;
        primaryString: string;
    } {
        let registredString = '';
        let primaryString = '';
        let inn = '';
        let clientCompanyFullName = '';

        if (!bxrq) {
            return {
                clientCompanyFullName,
                inn,
                registredString,
                primaryString,
            };
        }

        // Обрабатываем адреса
        if (bxrq.address?.items) {
            for (const address of bxrq.address.items) {
                if (!address.fields) continue;

                let addressString = '';
                for (const field of address.fields) {
                    const value = readFieldText(field.value);
                    if (value) {
                        addressString += `${value}, `;
                    }
                }

                if (address.type_id === BX_ADDRESS_TYPE.REGISTERED) {
                    // Юридический адрес
                    registredString = addressString;
                } else if (address.type_id === BX_ADDRESS_TYPE.PRIMARY) {
                    // Фактический адрес
                    if (addressString) {
                        primaryString = `Фактический адрес: ${addressString}`;
                    }
                }
            }
        }

        // Обрабатываем поля реквизитов
        if (bxrq.fields) {
            for (const field of bxrq.fields) {
                const value = readFieldText(field.value);
                if (!value) continue;

                if (field.code === RQ_ITEM_CODE.INN) {
                    inn = value;
                } else if (
                    field.code === RQ_ITEM_CODE.FULLNAME &&
                    clientType !== ClientTypeEnum.FIZ
                ) {
                    clientCompanyFullName = value;
                } else if (
                    field.code === RQ_ITEM_CODE.PERSON_NAME &&
                    clientType === ClientTypeEnum.FIZ
                ) {
                    clientCompanyFullName = value;
                }
            }
        }

        return { clientCompanyFullName, inn, registredString, primaryString };
    }

    /**
     * Получает полное имя провайдера
     */
    private getProviderFullname(
        contractProviderState: ContractProviderStatePayload | undefined,
    ): string {
        return contractProviderState?.current?.rq?.fullname ?? '';
    }

    /**
     * Получает строку консалтинга
     */
    private getConsaltingString(consalting?: ConsaltingPayload): string {
        return consalting?.current?.title ?? 'Горячая Линия';
    }

    /**
     * Фильтрует спецификацию контракта
     */
    private filterContractSpecification(
        items: ContractSpecificationItemDto[],
        contractType: CONTRACT_LTYPE,
        supplyType?: string,
    ): ContractSpecificationItemDto[] {
        let filtered = items.filter(item =>
            item.contractType?.includes(contractType),
        );

        if (supplyType) {
            // supplies — enum SupplyTypeEnum, а тип поставки приходит строкой,
            // поэтому сравниваем строковые значения
            filtered = filtered.filter(item =>
                (item.supplies ?? []).some(
                    supply => String(supply) === supplyType,
                ),
            );
        }

        return filtered;
    }

    /**
     * Обрабатывает спецификацию
     */
    private processSpecification(
        filteredSpecification: ContractSpecificationItemDto[],
        consaltingString: string,
    ): {
        iblocks: string;
        ifree: string;
        lt_free: string;
        lt_packet: string;
        pk: string;
    } {
        void consaltingString; // в Laravel аргумент тоже не используется — оставлен ради совпадения сигнатур

        let iblocks = '';
        let ifree = '';
        let lt_free = '';
        let lt_packet = '';
        let pk = '';

        /** Значение связанного пункта спецификации (список услуг LT). */
        const findValue = (code: ContractSpecificationCodeEnum): string => {
            const found = filteredSpecification.find(i => i.code === code);
            return found ? readFieldText(found.value) : '';
        };

        for (const item of filteredSpecification) {
            const value = readFieldText(item.value);

            if (item.code === ContractSpecificationCodeEnum.IBLOCKS) {
                iblocks += `${value}\n`;
            } else if (item.code === ContractSpecificationCodeEnum.IERS) {
                iblocks += `${value}\n`;
            } else if (
                item.code === ContractSpecificationCodeEnum.IERS_PACKETS
            ) {
                if (value) {
                    iblocks += `${value}: \n`;
                }
            } else if (
                item.code === ContractSpecificationCodeEnum.IERS_IN_PACKETS
            ) {
                iblocks += `${value}\n`;
            } else if (item.code === ContractSpecificationCodeEnum.IFREE) {
                ifree = value;
            } else if (item.code === ContractSpecificationCodeEnum.LT_FREE) {
                if (value) {
                    lt_free = `Бесплатный LT ${value}`;
                    // Ищем связанные сервисы
                    const services = findValue(
                        ContractSpecificationCodeEnum.LT_FREE_SERVICES,
                    );
                    if (services) {
                        lt_free += `: \n${services}`;
                    }
                }
            } else if (item.code === ContractSpecificationCodeEnum.LT_PACKET) {
                if (value) {
                    lt_packet = `${item.name} ${value}`;
                    const services = findValue(
                        ContractSpecificationCodeEnum.LT_SERVICES,
                    );
                    if (services) {
                        lt_packet += `: \n${services}`;
                    }
                }
            } else if (item.code === ContractSpecificationCodeEnum.PK) {
                pk = value;
            }
        }

        return { iblocks, ifree, lt_free, lt_packet, pk };
    }

    /**
     * Обрабатывает даты
     */
    private processDates(bxDealItems: unknown): {
        contract_start: string;
        contract_end: string;
        present_period: string;
        garant_client_assigned_name?: string;
        garant_client_assigned_phone?: string;
        email_garant?: string;
    } {
        let contract_start = '«____» _________________ 20__ г.';
        let contract_end = '«____» _________________ 20__ г.';
        let contract_present_start = '';
        let contract_present_end = '';
        let garant_client_assigned_name: string | undefined;
        let garant_client_assigned_phone: string | undefined;
        let email_garant: string | undefined;

        // фронт шлёт объект, ключованный кодом поля; массив с item.key тоже
        // поддерживаем — им пользуется ветка IS_BACK
        for (const [key, item] of toPbxEntries(bxDealItems)) {
            const value = readPbxCurrent(item);
            if (!value) {
                continue;
            }

            if (key === 'contract_start') {
                contract_start = this.formatDateForWord(
                    'contract_start',
                    value,
                );
            } else if (key === 'contract_end') {
                contract_end = this.formatDateForWord('contract_end', value);
            } else if (key === 'contract_present_start') {
                contract_present_start = this.formatDateForWord(
                    'contract_present_start',
                    value,
                );
            } else if (key === 'contract_present_end') {
                contract_present_end = this.formatDateForWord(
                    'contract_present_end',
                    value,
                );
            } else if (key === 'garant_client_assigned_name') {
                garant_client_assigned_name = `Контактное лицо по Гаранту: ${value}`;
            } else if (key === 'garant_client_assigned_phone') {
                garant_client_assigned_phone = ` ${value}`;
            } else if (key === 'garant_client_email') {
                email_garant = `Email для интернет версии: ${value}`;
            }
        }

        let present_period = '';
        if (contract_present_start && contract_present_end) {
            present_period = `Период в подарок с ${contract_present_start} по ${contract_present_end}`;
        }

        return {
            contract_start,
            contract_end,
            present_period,
            garant_client_assigned_name,
            garant_client_assigned_phone,
            email_garant,
        };
    }

    /**
     * Форматирует дату для Word документа
     */
    private formatDateForWord(code: string, date: string | number): string {
        try {
            const dateTime = dayjs(date);

            if (!dateTime.isValid()) {
                return String(date);
            }

            if (
                [
                    'first_pay_date',
                    'supply_date',
                    'sale_date',
                    'contract_start',
                    'contract_end',
                    'contract_present_start',
                    'contract_present_end',
                ].includes(code)
            ) {
                return dateTime.format('D MMMM YYYY').toLowerCase() + ' г.';
            } else if (code === 'client_call_date') {
                const time = dateTime.format('HH:mm');
                if (time === '00:00') {
                    return dateTime
                        .hour(8)
                        .minute(0)
                        .format('D MMMM YYYY HH:mm')
                        .toLowerCase();
                }
                return dateTime.format('D MMMM YYYY HH:mm').toLowerCase();
            }

            return String(date);
        } catch (error) {
            this.logger.warn(
                `Error formatting date for code ${code}: ${getErrorString(error)}`,
            );
            return String(date);
        }
    }

    /**
     * Строки таблицы товаров.
     * Порт `ContractController::getSupplyProducts` (Laravel, строка 4353).
     */
    private getSupplyProducts(
        arows: ProductRowDto[],
        contractProductName: string,
        isProduct: boolean,
        contractCoefficient: number,
        clientType: ClientTypeEnum,
    ): Record<string, string | number>[] {
        void clientType; // в Laravel аргумент тоже не используется — оставлен ради совпадения сигнатур

        const contractFullName = isProduct
            ? `${contractProductName} длительность ${contractCoefficient} мес. `
            : contractProductName;

        return arows.map((row, index) => {
            const productQuantity = row.price?.quantity ?? 0;
            const productContractCoefficient =
                row.product?.contractCoefficient ?? 1;

            return {
                productNumber: index + 1,
                productName: `${contractFullName}(${row.name})`,
                productQuantity,
                productMeasure: row.price?.measure?.name ?? '',
                productPrice: toMoneyString(row.price?.current),
                productSum: toMoneyString(row.price?.sum),
                // вид размещения показываем только у гарантовских строк
                complect_sup:
                    row.productType === ProductTypeEnum.garant
                        ? (row.currentSupply?.name ?? '')
                        : '',
                complectName: row.name,
                productPriceDefault: toMoneyString(row.price?.default),
                // произведение количества и коэффициента Laravel считает, но в
                // строку таблицы не кладёт — оставляем для шаблонов, где нужно
                productTotalQuantity:
                    productQuantity * productContractCoefficient,
            };
        });
    }

    /**
     * Итоги под таблицей товаров (в т.ч. суммы прописью).
     * Порт `ContractController::getSupplyTotal` (Laravel, строка 4462).
     *
     * Ветка `org_state` в Laravel закомментирована — итоги одинаковы для всех
     * типов клиента, поэтому её здесь нет.
     */
    private getSupplyTotal(
        total: ProductRowDto | undefined,
        clientType: ClientTypeEnum,
    ): Record<string, string | number> {
        void clientType;

        if (!total) {
            return {};
        }

        const productQuantity = Number(total.price?.quantity) || 0;
        const productContractCoefficient =
            Number(total.product?.contractCoefficient) || 1;
        const totalQuantity = productQuantity * productContractCoefficient;

        const contractSum = toMoneyString(total.price?.sum);
        const totalSumMonth = toMoneyString(
            Math.round(
                ((Number(total.price?.current) || 0) /
                    productContractCoefficient) *
                    100,
            ) / 100,
        );

        const totalQuantityString = getMonthTitleAccusative(totalQuantity);
        const contractSumString = `(${formatRuble(Number(contractSum))})`;
        const totalSumMonthString = `(${formatRuble(Number(totalSumMonth))})`;

        return {
            total_product_name: total.name ?? '',
            total_supply_name: total.supply?.name ?? '',
            total_prepayment_quantity: totalQuantity,
            total_prepayment_quantity_string: totalQuantityString,
            total_prepayment_sum: contractSum,
            total_prepayment_sum_string: contractSumString,
            contract_total_sum: contractSum,
            contract_total_sum_string: contractSumString,
            total_quantity: totalQuantity,
            total_quantity_string: totalQuantityString,
            total_month_sum: totalSumMonth,
            total_month_sum_string: totalSumMonthString,
            total_measure: total.price?.measure?.name ?? '',
        };
    }

    /**
     * Блок реквизитов клиента одной строкой.
     * Порт `ContractController::getClientRQ` (Laravel, строка 3981).
     *
     * Переводы строк оставляем как `\n`: в docx их превращает в переносы сам
     * docxtemplater (`linebreaks: true`).
     */
    private getClientRQ(
        clientType: ClientTypeEnum,
        bxrq: BxRqDto | undefined,
    ): string {
        const EMPTY_NAME =
            '____________________________________________________';
        const EMPTY_SHORT = '___________________________';
        const EMPTY_ADDRESS = '_____________________________________________';
        const EMPTY_FIELD = '________________________________';

        let companyName = EMPTY_NAME;
        let inn = EMPTY_SHORT;
        let fizDocument = EMPTY_FIELD;
        let address = EMPTY_ADDRESS;
        let bank = EMPTY_FIELD;
        let rs = '_________________________________';
        let ks = '______________________________________';
        let bik = '_________________________________';
        let bankOther = '';
        let phone = '_________________________________';

        const isFiz = clientType === ClientTypeEnum.FIZ;

        for (const item of bxrq?.fields ?? []) {
            const value = readFieldText(item?.value);
            if (!value) {
                continue;
            }

            switch (item.code) {
                case RQ_ITEM_CODE.INN:
                    inn = value;
                    break;
                case RQ_ITEM_CODE.PHONE:
                    phone = value;
                    break;
                case RQ_ITEM_CODE.SHORTNAME:
                    if (!isFiz) {
                        companyName = value;
                    }
                    break;
                case RQ_ITEM_CODE.PERSON_NAME:
                    if (isFiz) {
                        companyName = value;
                    }
                    break;
                case RQ_ITEM_CODE.DOCUMENT:
                    if (isFiz) {
                        fizDocument = `${value} `;
                    }
                    break;
                case RQ_ITEM_CODE.DOCUMENT_SERIES:
                    if (isFiz) {
                        fizDocument += `Серия: ${value} `;
                    }
                    break;
                case RQ_ITEM_CODE.DOCUMENT_NUMBER:
                    if (isFiz) {
                        fizDocument += `Номер: ${value} `;
                    }
                    break;
                case RQ_ITEM_CODE.DOCUMENT_DATE:
                    if (isFiz) {
                        fizDocument += `Дата выдачи: ${value}`;
                    }
                    break;
                default:
                    break;
            }
        }

        const addressCodes: string[] = [
            ADDRESS_RQ_ITEM_CODE.ADDRESS_COUNTRY,
            ADDRESS_RQ_ITEM_CODE.ADDRESS_REGION,
            ADDRESS_RQ_ITEM_CODE.ADDRESS_CITY,
            ADDRESS_RQ_ITEM_CODE.ADDRESS_1,
            ADDRESS_RQ_ITEM_CODE.ADDRESS_2,
        ];

        for (const rqAddress of bxrq?.address?.items ?? []) {
            const parts: string[] = [];
            for (const code of addressCodes) {
                const field = (rqAddress?.fields ?? []).find(
                    item => String(item?.code) === code,
                );
                const value = readFieldText(field?.value);
                if (value) {
                    parts.push(value);
                }
            }

            // type_id из json приходит и числом, и строкой — сравниваем числа
            if (
                parts.length &&
                Number(rqAddress?.type_id) ===
                    Number(BX_ADDRESS_TYPE.REGISTERED)
            ) {
                address = parts.join(', ');
            }
        }

        // 'rs' / 'ks' / 'bik' — короткие коды легаси-конструктора,
        // bank_* — коды битрикса; реквизиты приходят и в той, и в другой форме
        const bankFieldByCode: Record<string, BankRqSlot> = {
            [BANK_RQ_ITEM_CODE.BANK_NAME]: 'bank',
            [BANK_RQ_ITEM_CODE.BANK_PC]: 'rs',
            rs: 'rs',
            [BANK_RQ_ITEM_CODE.BANK_KC]: 'ks',
            ks: 'ks',
            [BANK_RQ_ITEM_CODE.BANK_BIK]: 'bik',
            bik: 'bik',
            [BANK_RQ_ITEM_CODE.BANK_COMMENTS]: 'other',
        };

        const bankFields = bxrq?.bank?.items?.[0]?.fields ?? [];
        for (const item of bankFields) {
            const value = readFieldText(item?.value);
            if (!value) {
                continue;
            }

            switch (bankFieldByCode[String(item.code)]) {
                case 'bank':
                    bank = value;
                    break;
                case 'rs':
                    rs = value;
                    break;
                case 'ks':
                    ks = value;
                    break;
                case 'bik':
                    bik = value;
                    break;
                case 'other':
                    bankOther = value;
                    break;
                default:
                    break;
            }
        }

        const tail =
            `ИНН: ${inn}\n` +
            `Банк: ${bank}\n` +
            `Р/с: ${rs}\n` +
            `К/с: ${ks}\n` +
            (bik ? `БИК: ${bik}\n` : '') +
            (bankOther ? `${bankOther}\n` : '');

        if (isFiz) {
            return (
                `${companyName}\n\n` +
                `Документ: ${fizDocument}\n` +
                `ИНН: ${inn}\n` +
                `Адрес: ${address}\n` +
                `Телефон.: ${phone}\n` +
                `Банк: ${bank}\n` +
                `Р/с: ${rs}\n` +
                `К/с: ${ks}\n` +
                (bik ? `БИК: ${bik}\n` : '') +
                (bankOther ? `${bankOther}\n` : '')
            );
        }

        return (
            `${companyName}\n\n` +
            `Адрес: ${address}\n` +
            `Телефон.: ${phone}\n` +
            tail
        );
    }

    /**
     * Обрабатывает комплекты
     */
    private processComplects(arows: ProductRowDto[]): Array<{
        complect_name: string;
        complect_sup: string;
        complect_hdd: string;
    }> {
        const complects: Array<{
            complect_name: string;
            complect_sup: string;
            complect_hdd: string;
        }> = [];

        for (const row of arows) {
            let supply = '';
            let complect_hdd = '';

            if (row.supply?.name) {
                supply = row.supply.name;
                // contractSupplyProp1 в ProductDto не объявлен — его кладёт
                // конструктор рядом с остальными полями продукта
                const product = row.product as ProductDto & {
                    contractSupplyProp1?: string;
                };
                complect_hdd = product?.contractSupplyProp1 ?? '';
            }

            complects.push({
                complect_name: row.name,
                complect_sup: supply,
                complect_hdd: complect_hdd,
            });
        }

        return complects;
    }

    /**
     * Обрабатывает контакты
     */
    private processContacts(bxContacts: SupplyReportContactPayload[]): Array<{
        contact_name: string;
        contact_post: string;
        contact_status: string;
        contact_phone: string;
        contact_comment: string;
    }> {
        const contacts: Array<{
            contact_name: string;
            contact_post: string;
            contact_status: string;
            contact_phone: string;
            contact_comment: string;
        }> = [];

        for (const contactData of bxContacts) {
            const contactDataForTemplate = {
                contact_name: '',
                contact_post: '',
                contact_status: '',
                contact_phone: '',
                contact_comment: '',
            };

            const contact = contactData.contact;
            if (contact) {
                if (contact.NAME) {
                    contactDataForTemplate.contact_name = contact.NAME;
                }
                if (contact.POST) {
                    contactDataForTemplate.contact_post = contact.POST;
                }
                if (contact.COMMENTS) {
                    contactDataForTemplate.contact_comment = contact.COMMENTS;
                }
                if (contact.PHONE) {
                    for (const phone of contact.PHONE) {
                        // перенос строки ставим обычным \n: в docx его
                        // разворачивает docxtemplater (linebreaks: true),
                        // сырой XML <w:br/> он бы экранировал в текст
                        contactDataForTemplate.contact_phone += `${phone?.VALUE ?? ''}\n`;
                    }
                }
            }

            if (contactData.fields) {
                for (const field of contactData.fields) {
                    const code = field.field?.code ?? '';
                    const fieldTitle = field.field?.title ?? '';
                    const currentTitle = field.current?.title ?? '';

                    if (code === 'ork_is_most_user') {
                        if (field.current?.code?.includes('yes')) {
                            contactDataForTemplate.contact_name +=
                                '\n(Основной пользователь)';
                        }
                    } else if (
                        [
                            'contact_client_status',
                            'ork_contact_garant',
                            'ork_contact_concurent',
                            'ork_needs',
                        ].includes(code)
                    ) {
                        if (field.field && field.current) {
                            contactDataForTemplate.contact_status += `${fieldTitle}: `;
                            contactDataForTemplate.contact_status += `${currentTitle}\n`;
                        }
                    } else if (code === 'ork_call_frequency') {
                        if (field.field && field.current) {
                            contactDataForTemplate.contact_comment += `${fieldTitle}: `;
                            contactDataForTemplate.contact_comment += `${currentTitle}\n\n`;
                        }
                    }
                }
            }

            contacts.push(contactDataForTemplate);
        }

        return contacts;
    }

    /**
     * Обрабатывает элементы компании
     */
    private processCompanyItems(
        bxCompanyItems: unknown,
    ): Record<string, string> {
        const items: Record<string, string> = {};

        for (const [key, item] of toPbxEntries(bxCompanyItems)) {
            items[key] = readPbxCurrent(item);
        }

        return items;
    }

    /**
     * Обрабатывает элементы сделки
     */
    private processDealItems(bxDealItems: unknown): Record<string, string> {
        const items: Record<string, string> = {};

        const excludedKeys = [
            'garant_client_email',
            'contract_start',
            'contract_end',
            'contract_present_start',
            'contract_present_end',
            'garant_client_assigned_name',
            'garant_client_assigned_phone',
        ];

        for (const [key, item] of toPbxEntries(bxDealItems)) {
            if (excludedKeys.includes(key)) {
                continue;
            }

            const value = readPbxCurrent(item);
            items[key] = value ? this.formatDateForWord(key, value) + '\n' : '';
        }

        return items;
    }

    /**
     * Обрабатывает элементы отчета о поставке
     */
    private processSupplyReportItems(
        supplyReport: SupplyReportFormPayloadItem[],
    ): Record<string, string> {
        const items: Record<string, string> = {};

        for (const reportItem of supplyReport) {
            const code = reportItem.code ?? '';
            if (!code) {
                continue;
            }

            let value = '';

            if (
                reportItem.type !== 'select' &&
                reportItem.type !== 'enumeration'
            ) {
                value = readFieldText(reportItem.value);
            } else if (reportItem.value && reportItem.items) {
                // у select’а значение — объект {code}, подпись берём из items
                const selectedCode =
                    typeof reportItem.value === 'object'
                        ? reportItem.value.code
                        : String(reportItem.value);

                for (const item of reportItem.items) {
                    if (item.code === selectedCode) {
                        value = item.name ?? '';
                        break;
                    }
                }
            }

            items[code] = value
                ? this.formatDateForWord(code, value) + '\n'
                : '';
        }

        return items;
    }
}
