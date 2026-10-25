import { Injectable } from '@nestjs/common';
import { SupplyTextService } from '@lib/garant';
import { ComplectDto } from '@app/konstructor/document-generate/dto/complect/complect.dto';
import { INFOBLOCK_GROUP_TYPE } from '@app/konstructor/document-generate/dto/complect/complect.type';
import { FormFieldDto } from '@app/konstructor/document-generate/dto/form-field/form-field.dto';
import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import { ProductTypeEnum } from '@app/konstructor/document-generate/dto/product/product.dto';
import { ContractSpecificationItemDto } from '@app/konstructor/document-generate/dto/specification/specification.dto';
import {
    RQ_TYPE,
    SupplyTypeEnum,
} from '@app/konstructor/document-generate/type/bx-rq.type';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import {
    ContractSpecificationFormRequestDto,
    ContractSpecificationFormResponseDto,
} from '../dto/contract-specification-form.dto';
import {
    buildContractGeneralForm,
    buildSpecificationItems,
    filterSpecificationItems,
    supplyTextsForContract,
    type RowMoney,
    type SpecificationConsalting,
    type SpecificationInput,
    type SpecificationLt,
} from '../lib/contract-form.util';
import { getContractIBlocks } from '../lib/contract-iblocks.util';

/** Легаси-аргументы `InitFormService.getSpecification` — ровно то, что присылал старый фронт. */
export interface LegacySpecificationArgs {
    products: Array<Record<string, unknown>>;
    consaltingProduct: unknown;
    contractType: CONTRACT_LTYPE;
    rows: ProductRowDto[];
    contractCoefficient: number;
    documentInfoblocks: ComplectDto[];
    paymentLtPacketString?: string;
}

const HOTLINE_CODE = 'hotline';
const HOTLINE_NAME = 'Горячая Линия';

const toSupplyType = (value: unknown): SupplyTypeEnum =>
    value === SupplyTypeEnum.PROXIMA
        ? SupplyTypeEnum.PROXIMA
        : SupplyTypeEnum.INTERNET;

const rowsMoney = (rows: ProductRowDto[]): RowMoney[] =>
    rows
        .filter(row => row.price)
        .map(row => ({
            month: row.price.month,
            sum: row.price.sum,
            quantity: row.price.quantity,
        }));

const text = (value: unknown): string =>
    typeof value === 'string' ? value : '';

/**
 * Форма договора по собранному комплекту: общая часть (даты, суммы) и
 * спецификация. Тексты поставки берутся из шаблонов поставки по коду
 * (SupplyTextService), падежи и число прописью уже внутри них.
 */
@Injectable()
export class ContractSpecificationFormService {
    constructor(private readonly supplyTexts: SupplyTextService) {}

    async build(
        request: ContractSpecificationFormRequestDto,
    ): Promise<ContractSpecificationFormResponseDto> {
        const supply = await this.supplyTexts.enrich(request.supply);
        const supplyType = toSupplyType(supply.type);
        const money = rowsMoney(request.rows);
        const contractCoefficient = Number(request.contract?.prepayment) || 1;

        const input: SpecificationInput = {
            contractType: request.contractType,
            supplyType,
            supply: supplyTextsForContract(
                supply,
                request.contractType,
                supplyType,
            ),
            contractCoefficient,
            productNames: this.productNames(request.rows),
            rows: money,
            consalting: this.consaltingFromComplect(
                request.complect,
                request.rows,
            ),
            lt: request.lt,
            iblocks: getContractIBlocks(request.complect),
        };

        return {
            contract: buildContractGeneralForm(money, contractCoefficient),
            specification: filterSpecificationItems(
                buildSpecificationItems(input),
                {
                    supplyType,
                    contractType: request.contractType,
                    clientType: request.clientType as unknown as RQ_TYPE,
                },
            ),
        };
    }

    /** Общая форма для легаси `init-form` (отчёт о поставке). */
    legacyContractForm(
        rows: ProductRowDto[],
        contractCoefficient?: number,
    ): FormFieldDto[] {
        return buildContractGeneralForm(
            rowsMoney(rows),
            Number(contractCoefficient) || 1,
        );
    }

    /**
     * Спецификация для легаси `init-form`: тексты поставки — из полей
     * легаси-продукта (contractSupply*), как их присылал старый фронт.
     * Фильтра по поставке/договору/клиенту нет — его делал старый фронт сам.
     */
    legacySpecification(
        args: LegacySpecificationArgs,
    ): ContractSpecificationItemDto[] {
        const product = args.products[0] ?? {};
        const supplyRaw = (product.supply ?? {}) as Record<string, unknown>;
        const supplyType = toSupplyType(supplyRaw.type ?? product.supplyType);
        let name = text(product.contractSupplyName);
        if (name && supplyType === SupplyTypeEnum.INTERNET && !/ОД$/.test(name))
            name = `${name} ОД`;

        const consaltingProduct = (args.consaltingProduct ?? null) as Record<
            string,
            unknown
        > | null;
        const consalting: SpecificationConsalting = consaltingProduct
            ? {
                  name: text(consaltingProduct.name) || HOTLINE_NAME,
                  prop: text(consaltingProduct.contractConsaltingProp),
                  comment: text(consaltingProduct.contractConsaltingComment),
              }
            : {
                  name:
                      product.withConsalting &&
                      text(product.contractConsaltingProp)
                          ? 'Советы экспертов. Проверки, налоги, право'
                          : HOTLINE_NAME,
                  prop: product.withConsalting
                      ? text(product.contractConsaltingComment)
                      : '',
                  comment: text(product.contractConsaltingComment),
              };

        const lt: SpecificationLt = args.paymentLtPacketString
            ? {
                  freePacket: '',
                  freeServices: [],
                  paidPacket: 'Legal Tech',
                  paidServices: [args.paymentLtPacketString],
              }
            : {
                  freePacket: '',
                  freeServices: [],
                  paidPacket: '',
                  paidServices: [],
              };

        return buildSpecificationItems({
            contractType: args.contractType,
            supplyType,
            supply: {
                name,
                comment: text(product.contractSupplyPropComment),
                email: text(product.contractSupplyPropEmail),
                loginsQuantity: text(product.contractSupplyPropLoginsQuantity),
                distributive: text(product.contractSupplyProp1),
                deliveryWay: text(product.contractSupplyProp2),
                quantityForKp: text(product.quantityForKp),
            },
            contractCoefficient:
                Number(args.contractCoefficient) ||
                Number(product.contractCoefficient) ||
                1,
            productNames: args.products
                .map(item => text(item.name))
                .filter(Boolean),
            rows: rowsMoney(args.rows),
            consalting,
            lt,
            iblocks: getContractIBlocks(args.documentInfoblocks ?? []),
        });
    }

    private productNames(rows: ProductRowDto[]): string[] {
        return rows
            .filter(
                row =>
                    (row.productType ?? row.product?.type) ===
                    ProductTypeEnum.garant,
            )
            .map(row => row.product?.name || row.name)
            .filter(Boolean);
    }

    /**
     * ПК/ГЛ из группы «Правовая поддержка»: платный консалтинг — его
     * название, иначе горячая линия, если она в комплекте. Текстов договора
     * у консалтинга в новой модели нет (легаси брал их из таблицы products).
     */
    private consaltingFromComplect(
        complect: ComplectDto[],
        rows: ProductRowDto[],
    ): SpecificationConsalting {
        const group = complect.find(
            item => item.type === INFOBLOCK_GROUP_TYPE.CONSULTING,
        );
        const paid = group?.value.find(
            block => block.code !== HOTLINE_CODE && block.checked !== false,
        );
        const hotline =
            group?.value.some(block => block.code === HOTLINE_CODE) ||
            rows.some(row => row.product?.withConsalting);
        return {
            name: paid?.title || paid?.name || (hotline ? HOTLINE_NAME : ''),
            prop: '',
            comment: '',
        };
    }
}
