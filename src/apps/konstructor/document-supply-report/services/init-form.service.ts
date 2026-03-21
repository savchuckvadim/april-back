import { Injectable, Logger } from '@nestjs/common';
import { DocumentSupplyInitFormDto } from '../dto/document-supply-init-form.dto';
import { PortalService } from '@/modules/portal';
import { BitrixService } from '@/modules/bitrix';
import { CONTRACT_LTYPE } from '../../document-generate/type/contract.type';
import { ProductRowDto } from '../../document-generate/dto/product-row/product-row.dto';
import { ProductDto } from '../../document-generate/dto/product/product.dto';
import { ContractDto } from '../../dto/contract.dto';
import { PBXService } from '@/modules/pbx';
import { ProviderService } from '@/modules/portal-konstructor/provider';

@Injectable()
export class InitFormService {
    private readonly logger = new Logger(InitFormService.name);

    constructor(
        // private readonly portalService: PortalService,
        // private readonly bitrixService: BitrixService,
        private readonly pbx: PBXService,
        private readonly provider: ProviderService,
    ) {}

    async frontInit(dto: DocumentSupplyInitFormDto) {
        const { domain, companyId, contractType } = dto;

        try {
            const { bitrix, portal, PortalModel } = await this.pbx.init(domain);
            const providers = await this.provider.findByDomain(domain);
            // Получаем портал по домену
            // const portal = await this.portalService.getPortalByDomain(domain);
            // const providers = (portal as any).providers || [];

            // Получаем хук Bitrix
            // const hook = await this.portalService.getHook(domain);

            // Инициализируем Bitrix API для работы с порталом
            // this.bitrixService.init(portal);

            // Обрабатываем contract если он есть
            let contractQuantity: number | undefined;
            let contractProductName: string | undefined;
            let generalContractModel = dto.contract;

            if (dto.contract) {
                // Если есть вложенный contract, используем его
                if ((dto.contract as any).contract) {
                    generalContractModel = (dto.contract as any).contract;
                }
                contractQuantity = (generalContractModel as any)?.coefficient;
                contractProductName = (generalContractModel as any)
                    ?.productName;
            }

            // Обрабатываем total (может быть объектом или массивом)
            let total: ProductRowDto | undefined;
            if (dto.total) {
                if (Array.isArray(dto.total) && dto.total.length > 0) {
                    total = dto.total[0];
                } else if (!Array.isArray(dto.total)) {
                    total = dto.total;
                }
            }

            // Формируем базовую структуру результата
            const result: any = {
                providers: providers,
                client: {
                    rq: [],
                    bank: [],
                    address: [],
                },
                provider: {
                    rq: [],
                    bank: [],
                    address: [],
                },
                contract: this.getContractGeneralForm(
                    dto.arows,
                    contractQuantity,
                ),
                specification: this.getSpecification(
                    dto.complect.name || dto.complect.title, // Используем name или title из объекта complect
                    dto.products,
                    dto.consalting.product,
                    dto.legalTech,
                    dto.star.product,
                    contractType,
                    dto.contract,
                    dto.arows,
                    contractQuantity,
                    dto.documentInfoblocks,
                    contractProductName,
                    total,
                ),
                clientType: {
                    type: 'select',
                    name: 'Тип клиента',
                    value: {
                        id: 0,
                        code: 'org',
                        name: 'Организация Коммерческая',
                        title: 'Организация Коммерческая',
                    },
                    isRequired: true,
                    code: 'type',
                    items: [
                        {
                            id: 0,
                            code: 'org',
                            name: 'Организация Коммерческая',
                            title: 'Организация Коммерческая',
                        },
                        {
                            id: 1,
                            code: 'org_state',
                            name: 'Организация Бюджетная',
                            title: 'Организация Бюджетная',
                        },
                        {
                            id: 2,
                            code: 'ip',
                            name: 'Индивидуальный предприниматель',
                            title: 'Индивидуальный предприниматель',
                        },
                        {
                            id: 4,
                            code: 'fiz',
                            name: 'Физическое лицо',
                            title: 'Физическое лицо',
                        },
                    ],
                    includes: ['org', 'org_state', 'ip', 'advokat', 'fiz'],
                    group: 'rq',
                    isActive: true,
                    isDisable: false,
                    order: 0,
                },
                currentComplect: dto.complect.name || dto.complect.title, // Используем name или title из объекта complect
                products: dto.products,
                consaltingProduct: dto.consalting.product,
                lt: dto.legalTech,
                starProduct: dto.star.product,
                contractType: contractType,
            };

            // Добавляем supply если это отчет о поставке
            if (dto.isSupplyReport) {
                result.supply = this.getSupplyReportData();
            }

            // Получаем реквизиты компании из Bitrix
            const clientRq = await this.getCompanyRequisites(companyId);
            let clientRqBank = null;
            let clientRqAddress = null;

            if (clientRq && clientRq.ID) {
                const rqId = clientRq.ID;

                // Получаем банковские реквизиты
                const bankDetails = await this.getCompanyBankDetails(rqId);
                if (
                    bankDetails &&
                    Array.isArray(bankDetails) &&
                    bankDetails.length > 0
                ) {
                    clientRqBank = bankDetails[0];
                }

                // Получаем адреса
                clientRqAddress = await this.getCompanyAddresses(rqId);
            }

            // Формируем форму клиента
            result.client = this.getClientRqForm(
                clientRq,
                clientRqAddress,
                clientRqBank,
                contractType,
            );

            return {
                success: true,
                data: {
                    init: result,
                },
            };
        } catch (error) {
            this.logger.error(
                `Error in frontInit: ${error.message}`,
                error.stack,
            );
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Получает реквизиты компании из Bitrix
     */
    private async getCompanyRequisites(companyId: string): Promise<any> {
        try {
            // const response = await this.bitrixService.api.call('crm.requisite.list', {
            //     filter: {
            //         ENTITY_TYPE_ID: 4, // Company
            //         ENTITY_ID: companyId,
            //     },
            // });

            // if (response?.result && Array.isArray(response.result) && response.result.length > 0) {
            //     return response.result[0];
            // }

            return null;
        } catch (error) {
            this.logger.error(
                `Error getting company requisites: ${error.message}`,
            );
            return null;
        }
    }

    /**
     * Получает банковские реквизиты компании
     */
    private async getCompanyBankDetails(rqId: string | number): Promise<any> {
        try {
            // const response = await this.bitrixService.api.call('crm.requisite.bankdetail.list', {
            //     filter: {
            //         ENTITY_ID: rqId,
            //     },
            // });

            return null;
        } catch (error) {
            this.logger.error(`Error getting bank details: ${error.message}`);
            return null;
        }
    }

    /**
     * Получает адреса компании
     */
    private async getCompanyAddresses(rqId: string | number): Promise<any> {
        try {
            // const response = await this.bitrixService.api.call('crm.address.list', {
            //     filter: {
            //         ENTITY_TYPE_ID: 8, // Requisite
            //         ENTITY_ID: rqId,
            //     },
            // });

            return null;
        } catch (error) {
            this.logger.error(`Error getting addresses: ${error.message}`);
            return null;
        }
    }

    /**
     * Формирует общую форму контракта
     * TODO: Реализовать полную логику из PHP метода getContractGeneralForm
     */
    private getContractGeneralForm(
        arows: ProductRowDto[],
        contractQuantity?: number,
    ): any {
        // TODO: Реализовать полную логику
        return [];
    }

    /**
     * Формирует спецификацию
     * TODO: Реализовать полную логику из PHP метода getSpecification
     */
    private getSpecification(
        currentComplect: string,
        products: ProductDto[],
        consaltingProduct: any, // Может быть null или объект
        lt: any, // LegalTechDto | undefined
        starProduct: any, // Может быть null или объект
        contractType: CONTRACT_LTYPE,
        contract: ContractDto | undefined,
        arows: ProductRowDto[],
        contractQuantity?: number,
        documentInfoblocks?: any[], // DocumentInfoblockDto[] | undefined
        contractProductName?: string,
        total?: ProductRowDto,
    ): any {
        // TODO: Реализовать полную логику
        return [];
    }

    /**
     * Получает данные для отчета о поставке
     * TODO: Реализовать полную логику из PHP метода getSupplyReportData
     */
    private getSupplyReportData(): any {
        // TODO: Реализовать полную логику
        return {};
    }

    /**
     * Формирует форму реквизитов клиента
     * TODO: Реализовать полную логику из PHP метода getClientRqForm
     */
    private getClientRqForm(
        bxRq: any,
        bxAddressesRq: any,
        bxBankRq: any,
        contractType: CONTRACT_LTYPE,
    ): any {
        // Определяем роль клиента в зависимости от типа контракта
        let clientRole = 'Заказчик';

        switch (contractType) {
            case CONTRACT_LTYPE.ABON:
            case CONTRACT_LTYPE.KEY:
                clientRole = 'Покупатель';
                break;
            case CONTRACT_LTYPE.LIC:
                clientRole = 'Лицензиат';
                break;
            default:
                clientRole = 'Заказчик';
                break;
        }

        // TODO: Реализовать полную логику формирования формы
        // Включая обработку адресов, банковских реквизитов и т.д.

        return {
            rq: [],
            bank: [],
            address: [],
        };
    }
}
