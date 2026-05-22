import { Injectable, Logger } from '@nestjs/common';
import { DocumentSupplyReportGenerateDto } from '../../dto/document-supply-report-generate.dto';
import { CONTRACT_LTYPE } from '../../../document-generate/type/contract.type';
import { ProductRowDto } from '../../../document-generate/dto/product-row/product-row.dto';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import localizedFormat from 'dayjs/plugin/localizedFormat';

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
    productRows: any[];

    // Total data
    totalData: Record<string, any>;

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
    companyItems: Record<string, any>;

    // Deal items
    dealItems: Record<string, any>;

    // Supply report items
    supplyReportItems: Record<string, any>;
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
            domain,
            companyId,
            contractType,
            contract,
            productSet,
            // products,
            arows,
            total,
            supply,
            region,
            bxrq,
            contractClientState,
            contractProviderState,
            contractSpecificationState,
            bxCompanyItems,
            bxDealItems,
            bxContacts,
            supplyReport,
            clientType,
            consalting,
        } = dto;

        // Получаем общую модель контракта
        const generalContractModel = (contract as any).contract || contract;
        const contractQuantity = generalContractModel?.coefficient || 1;
        const contractProductName = generalContractModel?.productName || '';
        const contractCoefficient = contract?.prepayment || 1;
        const isProduct = contractType !== CONTRACT_LTYPE.SERVICE;

        // Обрабатываем total
        const contractFullTotal =
            Array.isArray(total) && total.length > 0 ? total[0] : total;

        // Вычисляем суммы
        const { totalSum, totalMonth, quantity } = this.calculateTotals(
            arows,
            contractFullTotal,
        );

        // Обрабатываем адреса и реквизиты клиента
        const { clientCompanyFullName, inn, registredString, primaryString } =
            this.processClientAddresses(bxrq, clientType);

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
            clientType,
        );

        // Обрабатываем итоги
        const totalData = this.getSupplyTotal(contractFullTotal, clientType);

        // Обрабатываем реквизиты клиента
        const clientRqData = this.getClientRQ(clientType, bxrq);

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
        total: any,
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
        bxrq: any,
        clientType: string,
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
                    if (field.value) {
                        addressString += `${field.value}, `;
                    }
                }

                if (address.type_id === 6) {
                    // Юридический адрес
                    registredString = addressString;
                } else if (address.type_id === 1) {
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
                if (!field.value) continue;

                if (field.code === 'inn') {
                    inn = field.value;
                } else if (field.code === 'fullname' && clientType !== 'fiz') {
                    clientCompanyFullName = field.value;
                } else if (
                    field.code === 'personName' &&
                    clientType === 'fiz'
                ) {
                    clientCompanyFullName = field.value;
                }
            }
        }

        return { clientCompanyFullName, inn, registredString, primaryString };
    }

    /**
     * Получает полное имя провайдера
     */
    private getProviderFullname(contractProviderState: any): string {
        if (!contractProviderState?.current?.rq?.fullname) {
            return '';
        }
        return contractProviderState.current.rq.fullname;
    }

    /**
     * Получает строку консалтинга
     */
    private getConsaltingString(consalting?: any): string {
        if (consalting?.current?.title) {
            return consalting.current.title;
        }
        return 'Горячая Линия';
    }

    /**
     * Фильтрует спецификацию контракта
     */
    private filterContractSpecification(
        items: any[],
        contractType: CONTRACT_LTYPE,
        supplyType?: string,
    ): any[] {
        let filtered = items.filter(item => {
            return item.contractType?.includes(contractType);
        });

        if (supplyType) {
            filtered = filtered.filter(item => {
                return item.supplies?.includes(supplyType);
            });
        }

        return filtered;
    }

    /**
     * Обрабатывает спецификацию
     */
    private processSpecification(
        filteredSpecification: any[],
        consaltingString: string,
    ): {
        iblocks: string;
        ifree: string;
        lt_free: string;
        lt_packet: string;
        pk: string;
    } {
        let iblocks = '';
        let ifree = '';
        let lt_free = '';
        let lt_packet = '';
        let pk = '';

        for (const item of filteredSpecification) {
            if (item.code === 'specification_iblocks') {
                iblocks += `${item.value}\n`;
            } else if (item.code === 'specification_ers') {
                iblocks += `${item.value}\n`;
            } else if (item.code === 'specification_ers_packets') {
                if (item.value) {
                    iblocks += `${item.value}: \n`;
                }
            } else if (item.code === 'specification_ers_in_packets') {
                iblocks += `${item.value}\n`;
            } else if (item.code === 'specification_ifree') {
                ifree = item.value || '';
            } else if (item.code === 'specification_lt_free') {
                if (item.value) {
                    lt_free = `Бесплатный LT ${item.value}`;
                    // Ищем связанные сервисы
                    const servicesItem = filteredSpecification.find(
                        i => i.code === 'specification_lt_free_services',
                    );
                    if (servicesItem) {
                        lt_free += `: \n${servicesItem.value}`;
                    }
                }
            } else if (item.code === 'specification_lt_packet') {
                if (item.value) {
                    lt_packet = `${item.name} ${item.value}`;
                    const servicesItem = filteredSpecification.find(
                        i => i.code === 'specification_lt_services',
                    );
                    if (servicesItem) {
                        lt_packet += `: \n${servicesItem.value}`;
                    }
                }
            } else if (item.code === 'specification_pk') {
                pk = item.value || '';
            }
        }

        return { iblocks, ifree, lt_free, lt_packet, pk };
    }

    /**
     * Обрабатывает даты
     */
    private processDates(bxDealItems: any[]): {
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

        for (const item of bxDealItems) {
            const value = item.current?.name || item.current || '';

            if (item.key === 'contract_start' && value) {
                contract_start = this.formatDateForWord(
                    'contract_start',
                    value,
                );
            } else if (item.key === 'contract_end' && value) {
                contract_end = this.formatDateForWord('contract_end', value);
            } else if (item.key === 'contract_present_start' && value) {
                contract_present_start = this.formatDateForWord(
                    'contract_present_start',
                    value,
                );
            } else if (item.key === 'contract_present_end' && value) {
                contract_present_end = this.formatDateForWord(
                    'contract_present_end',
                    value,
                );
            } else if (item.key === 'garant_client_assigned_name' && value) {
                garant_client_assigned_name = `Контактное лицо по Гаранту: ${value}`;
            } else if (item.key === 'garant_client_assigned_phone' && value) {
                garant_client_assigned_phone = ` ${value}`;
            } else if (item.key === 'garant_client_email' && value) {
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
                `Error formatting date for code ${code}: ${error.message}`,
            );
            return String(date);
        }
    }

    /**
     * Получает продукты для поставки
     * TODO: Реализовать полную логику из ContractController.getSupplyProducts
     */
    private getSupplyProducts(
        arows: ProductRowDto[],
        contractProductName: string,
        isProduct: boolean,
        contractCoefficient: number,
        clientType: string,
    ): any[] {
        // TODO: Реализовать полную логику
        return [];
    }

    /**
     * Получает итоговые данные
     * TODO: Реализовать полную логику из ContractController.getSupplyTotal
     */
    private getSupplyTotal(
        total: any,
        clientType: string,
    ): Record<string, any> {
        // TODO: Реализовать полную логику
        return {};
    }

    /**
     * Получает реквизиты клиента
     * TODO: Реализовать полную логику из ContractController.getClientRQ
     */
    private getClientRQ(clientType: string, bxrq: any): string {
        // TODO: Реализовать полную логику
        return '';
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
                complect_hdd = (row.product as any)?.contractSupplyProp1 || '';
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
    private processContacts(bxContacts: any[]): Array<{
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

            if (contactData.contact) {
                const contact = contactData.contact;
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
                        contactDataForTemplate.contact_phone += `${phone.VALUE}</w:t><w:br/><w:t>`;
                    }
                }
            }

            if (contactData.fields) {
                for (const field of contactData.fields) {
                    if (field.field?.code === 'ork_is_most_user') {
                        if (
                            field.current?.code &&
                            String(field.current.code).includes('yes')
                        ) {
                            contactDataForTemplate.contact_name +=
                                '</w:t><w:br/><w:t>(Основной пользователь)';
                        }
                    } else if (
                        [
                            'contact_client_status',
                            'ork_contact_garant',
                            'ork_contact_concurent',
                            'ork_needs',
                        ].includes(field.field?.code)
                    ) {
                        if (field.field && field.current) {
                            contactDataForTemplate.contact_status += `${field.field.title}: `;
                            contactDataForTemplate.contact_status += `${field.current.title}</w:t><w:br/><w:t>`;
                        }
                    } else if (field.field?.code === 'ork_call_frequency') {
                        if (field.field && field.current) {
                            contactDataForTemplate.contact_comment += `${field.field.title}: `;
                            contactDataForTemplate.contact_comment += `${field.current.title}</w:t><w:br/><w:t></w:t><w:br/><w:t>`;
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
    private processCompanyItems(bxCompanyItems: any[]): Record<string, any> {
        const items: Record<string, any> = {};

        for (const item of bxCompanyItems) {
            const value = item.current?.name || item.current || '';
            items[item.key] = value;
        }

        return items;
    }

    /**
     * Обрабатывает элементы сделки
     */
    private processDealItems(bxDealItems: any[]): Record<string, any> {
        const items: Record<string, any> = {};

        const excludedKeys = [
            'garant_client_email',
            'contract_start',
            'contract_end',
            'contract_present_start',
            'contract_present_end',
            'garant_client_assigned_name',
            'garant_client_assigned_phone',
        ];

        for (const item of bxDealItems) {
            if (excludedKeys.includes(item.key)) {
                continue;
            }

            const value = item.current?.name || item.current || '';
            if (value) {
                const formattedValue =
                    this.formatDateForWord(item.key, value) + '\n';
                items[item.key] = formattedValue;
            } else {
                items[item.key] = '';
            }
        }

        return items;
    }

    /**
     * Обрабатывает элементы отчета о поставке
     */
    private processSupplyReportItems(supplyReport: any[]): Record<string, any> {
        const items: Record<string, any> = {};

        for (const reportItem of supplyReport) {
            let value = '';

            if (
                reportItem.type !== 'select' &&
                reportItem.type !== 'enumeration'
            ) {
                value = reportItem.value || '';
            } else {
                if (reportItem.value && reportItem.items) {
                    for (const item of reportItem.items) {
                        if (item.code === reportItem.value?.code) {
                            value = item.name;
                            break;
                        }
                    }
                }
            }

            if (value) {
                const formattedValue =
                    this.formatDateForWord(reportItem.code, value) + '\n';
                items[reportItem.code] = formattedValue;
            } else {
                items[reportItem.code] = '';
            }
        }

        return items;
    }
}
