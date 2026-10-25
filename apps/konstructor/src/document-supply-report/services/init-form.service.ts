import { Injectable, Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { PBXService } from '@lib/pbx';
import { ProviderService } from '@lib/portal-lib/konstructor/provider';
import { getErrorString } from '@lib/shared';
import { DocumentSupplyInitFormDto } from '../dto/document-supply-init-form.dto';
import { SupplyReportFormRequestDto } from '../dto/supply-report-form.dto';
import { CONTRACT_LTYPE } from '../../document-generate/type/contract.type';
import { ProductRowDto } from '../../document-generate/dto/product-row/product-row.dto';
import { ProductDto } from '../../document-generate/dto/product/product.dto';
import { ContractDto } from '../../dto/contract.dto';
import {
    getClientTypeSelect,
    getSupplyReportFormFields,
    SupplyReportFieldOverrides,
    SupplyReportFormField,
} from '../lib/supply-report-form';
import { SupplyReportTemplateSourceService } from './template/supply-report-template-source.service';
import { ContractSpecificationFormService } from '../../contract/specification-form/services/contract-specification-form.service';
import { ComplectDto } from '../../document-generate/dto/complect/complect.dto';
import { FormFieldDto } from '../../document-generate/dto/form-field/form-field.dto';
import { ContractSpecificationItemDto } from '../../document-generate/dto/specification/specification.dto';

/** Реквизит компании из битрикса, в том виде, в котором его отдаёт REST. */
interface BxRequisiteRaw {
    ID?: number | string;
    [key: string]: unknown;
}

/** Данные формы конструктора — то, что легаси-фронт ждёт в ключе `init`. */
export interface SupplyInitFormResult {
    providers: unknown;
    client: { rq: unknown[]; bank: unknown[]; address: unknown[] };
    provider: { rq: unknown[]; bank: unknown[]; address: unknown[] };
    contract: unknown[];
    specification: unknown[];
    clientType: ReturnType<typeof getClientTypeSelect>;
    currentComplect: string;
    products: ProductDto[];
    consaltingProduct: unknown;
    lt: unknown;
    starProduct: unknown;
    contractType: CONTRACT_LTYPE;
    supply?: SupplyReportFormField[];
}

@Injectable()
export class InitFormService {
    private readonly logger = new Logger(InitFormService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly provider: ProviderService,
        private readonly templateSource: SupplyReportTemplateSourceService,
        private readonly contractForm: ContractSpecificationFormService,
    ) {}

    /**
     * Данные для формы конструктора (аналог `SupplyController::frontInit`).
     *
     * Возвращает ГОЛЫЙ объект формы: обёртку `{resultCode, data}` дописывает
     * ResponseInterceptor, а ключ `init` — контроллер. Своей обёртки
     * `{success, data}` здесь быть не должно, иначе легаси-фронт
     * (`response.data.data['init']`) получит undefined.
     */
    async frontInit(
        dto: DocumentSupplyInitFormDto,
    ): Promise<SupplyInitFormResult> {
        const { domain, companyId, contractType } = dto;

        const { bitrix } = await this.pbx.init(domain);
        const providers = await this.provider.findByDomain(domain);

        // у контракта бывает вложенный contract — в нём и лежат коэффициент и
        // название продукта, как их читает Laravel
        const generalContractModel =
            (dto.contract as unknown as { contract?: ContractDto })?.contract ??
            dto.contract;
        const contractQuantity = (
            generalContractModel as unknown as { coefficient?: number }
        )?.coefficient;
        const contractProductName = (
            generalContractModel as unknown as { productName?: string }
        )?.productName;

        // total приходит и объектом, и массивом из одного элемента
        const total: ProductRowDto | undefined = Array.isArray(dto.total)
            ? dto.total[0]
            : dto.total;

        const result: SupplyInitFormResult = {
            providers,
            client: { rq: [], bank: [], address: [] },
            provider: { rq: [], bank: [], address: [] },
            contract: this.getContractGeneralForm(dto.arows, contractQuantity),
            specification: this.getSpecification(
                dto.complect.name || dto.complect.title,
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
                dto.paymentLtPacketString,
            ),
            clientType: getClientTypeSelect(),
            currentComplect: dto.complect.name || dto.complect.title,
            products: dto.products,
            consaltingProduct: dto.consalting.product,
            lt: dto.legalTech,
            starProduct: dto.star.product,
            contractType,
        };

        if (dto.isSupplyReport) {
            result.supply = getSupplyReportFormFields(
                await this.getFieldOverrides(dto),
            );
        }

        const clientRq = await this.getCompanyRequisites(bitrix, companyId);
        if (clientRq?.ID) {
            const rqId = clientRq.ID;
            const bankDetails = await this.getCompanyBankDetails(bitrix, rqId);
            const addresses = await this.getCompanyAddresses(bitrix, rqId);

            result.client = this.getClientRqForm(
                clientRq,
                addresses,
                bankDetails[0] ?? null,
                contractType,
            );
        }

        return result;
    }

    /**
     * Состав формы отчёта о поставке без легаси-слепка конструктора: новый
     * фронт присылает только то, что нужно подбору портальной настройки.
     */
    async formFields(dto: SupplyReportFormRequestDto): Promise<SupplyReportFormField[]> {
        return getSupplyReportFormFields(
            await this.getFieldOverrides({
                domain: dto.domain,
                providerId: dto.providerId,
                contractType: dto.contractType,
                clientType: dto.clientType,
                supplyType: dto.supplyType,
            }),
        );
    }

    /**
     * Портальная настройка состава формы отчёта.
     *
     * Меняет ТОЛЬКО `isRequired` у полей, которые и так есть в коде
     * (см. `applyFieldOverrides`): состав и порядок полей — контракт с
     * фронтом и с docxtemplater, настройкой их двигать нельзя.
     *
     * Сбой подбора гасится в `undefined`: форма конструктора нужна
     * менеджеру независимо от того, доступна ли БД шаблонов, а без
     * настройки она просто такая же, как до её появления. При выключенном
     * флаге резолвер не вызывается вовсе.
     */
    private async getFieldOverrides(
        dto: Pick<
            DocumentSupplyInitFormDto,
            'domain' | 'providerId' | 'contractType' | 'clientType' | 'supplyType'
        >,
    ): Promise<SupplyReportFieldOverrides | undefined> {
        if (!this.templateSource.isDbLookupEnabled()) {
            return undefined;
        }

        try {
            const template = await this.templateSource.resolve({
                domain: dto.domain,
                providerId: dto.providerId,
                contractType: dto.contractType,
                clientType: dto.clientType,
                supplyType: dto.supplyType,
            });
            return template.fieldOverrides;
        } catch (error) {
            this.logger.warn(
                `Не удалось подобрать шаблон отчёта для домена ${dto.domain}, состав формы берём из кода: ${getErrorString(error)}`,
            );
            return undefined;
        }
    }

    /** Реквизит компании (crm.requisite.list, ENTITY_TYPE_ID = 4). */
    private async getCompanyRequisites(
        bitrix: BitrixService,
        companyId: string,
    ): Promise<BxRequisiteRaw | null> {
        try {
            const response = await bitrix.requisite.getList({
                ENTITY_TYPE_ID: 4,
                ENTITY_ID: Number(companyId),
            });
            const items = (response?.result ?? []) as BxRequisiteRaw[];
            return items[0] ?? null;
        } catch (error) {
            // отсутствие реквизитов — не повод валить всю форму
            this.logger.warn(
                `Не удалось получить реквизиты компании ${companyId}: ${getErrorString(error)}`,
            );
            return null;
        }
    }

    /** Банковские реквизиты (crm.requisite.bankdetail.list). */
    private async getCompanyBankDetails(
        bitrix: BitrixService,
        rqId: string | number,
    ): Promise<Record<string, unknown>[]> {
        try {
            const response = (await bitrix.api.call(
                'crm.requisite.bankdetail.list',
                { filter: { ENTITY_ID: rqId } },
            )) as { result?: Record<string, unknown>[] };
            return response?.result ?? [];
        } catch (error) {
            this.logger.warn(
                `Не удалось получить банковские реквизиты ${rqId}: ${getErrorString(error)}`,
            );
            return [];
        }
    }

    /** Адреса реквизита (crm.address.list, ENTITY_TYPE_ID = 8). */
    private async getCompanyAddresses(
        bitrix: BitrixService,
        rqId: string | number,
    ): Promise<Record<string, unknown>[]> {
        try {
            const response = (await bitrix.api.call('crm.address.list', {
                filter: { ENTITY_TYPE_ID: 8, ENTITY_ID: rqId },
            })) as { result?: Record<string, unknown>[] };
            return response?.result ?? [];
        } catch (error) {
            this.logger.warn(
                `Не удалось получить адреса реквизита ${rqId}: ${getErrorString(error)}`,
            );
            return [];
        }
    }

    /** Общая форма договора — порт Laravel getContractGeneralForm (ContractSpecificationFormService). */
    private getContractGeneralForm(
        arows: ProductRowDto[],
        contractQuantity?: number,
    ): FormFieldDto[] {
        return this.contractForm.legacyContractForm(arows, contractQuantity);
    }

    /**
     * Спецификация договора — порт Laravel getSpecification
     * (ContractSpecificationFormService.legacySpecification). Состав и порядок
     * строк легаси, фильтра нет — его делал старый фронт.
     */
    private getSpecification(
        currentComplect: string,
        products: ProductDto[],
        consaltingProduct: unknown,
        lt: unknown,
        starProduct: unknown,
        contractType: CONTRACT_LTYPE,
        contract: ContractDto | undefined,
        arows: ProductRowDto[],
        contractQuantity?: number,
        documentInfoblocks?: unknown[],
        contractProductName?: string,
        total?: ProductRowDto,
        paymentLtPacketString?: string,
    ): ContractSpecificationItemDto[] {
        void currentComplect;
        void lt;
        void starProduct;
        void contract;
        void contractProductName;
        void total;
        return this.contractForm.legacySpecification({
            products: products as unknown as Array<Record<string, unknown>>,
            consaltingProduct,
            contractType,
            rows: arows,
            contractCoefficient: Number(contractQuantity) || 1,
            documentInfoblocks: (documentInfoblocks ?? []) as ComplectDto[],
            paymentLtPacketString,
        });
    }

    /**
     * Форма реквизитов клиента.
     *
     * НЕ ПЕРЕНЕСЕНО из Laravel (`SupplyController::getClientRqForm`,
     * строки 1627-2531, ~900 строк). Роль клиента по типу договора считается
     * уже сейчас — на ней завязан заголовок документа.
     */
    private getClientRqForm(
        bxRq: BxRequisiteRaw | null,
        bxAddressesRq: Record<string, unknown>[],
        bxBankRq: Record<string, unknown> | null,
        contractType: CONTRACT_LTYPE,
    ): { rq: unknown[]; bank: unknown[]; address: unknown[] } {
        void bxRq;
        void bxAddressesRq;
        void bxBankRq;
        void this.getClientRole(contractType);

        return { rq: [], bank: [], address: [] };
    }

    /** Как клиент называется в договоре: заказчик / покупатель / лицензиат. */
    private getClientRole(contractType: CONTRACT_LTYPE): string {
        switch (contractType) {
            case CONTRACT_LTYPE.ABON:
            case CONTRACT_LTYPE.KEY:
                return 'Покупатель';
            case CONTRACT_LTYPE.LIC:
                return 'Лицензиат';
            default:
                return 'Заказчик';
        }
    }
}
