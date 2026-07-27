/**
 * Оркестрация pbx-полей: метаданные (конфиг + items с портала) и запись
 * значения с инвалидацией финансового кэша.
 *
 * НЕ @Injectable: создаётся per-request через `new UseCase(pbx, financeCache)`
 * в контроллере (паттерн sales-finance.processor).
 */
import { Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_KONSTRUCTOR_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
import { SalesFinanceCacheService } from '../../sales-finance/cache/sales-finance-cache.service';
import { buildResetPattern } from '../../sales-finance/cache/cache-key.util';
import { SALES_FINANCE_CACHE_SCOPE } from '../../sales-finance/constants/sales-finance.const';
import { ContractTypeItemsService } from '../../sales-finance/domain/services/contract-type-items.service';
import {
    EDITABLE_PBX_FIELDS,
    EditablePbxFieldConfig,
    findEditablePbxField,
    PBX_FIELD_ENTITY,
} from '../constants/pbx-fields.const';
import {
    PbxFieldMetaDto,
    PbxFieldsMetaResponseDto,
} from '../dto/pbx-fields-meta.dto';
import {
    PbxFieldUpdateRequestDto,
    PbxFieldUpdateResponseDto,
} from '../dto/pbx-field-update.dto';
import { PbxFieldWriteService } from '../domain/pbx-field-write.service';

export class PbxFieldsUseCase {
    private readonly logger = new Logger(PbxFieldsUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly financeCache: SalesFinanceCacheService,
    ) {}

    /**
     * Метаданные редактируемых полей портала. Ненастроенное на портале
     * поле пропускается (не валим весь ответ из-за одного поля).
     * Items «Типа договора» — из ЖИВОГО словаря (userfield.list): включает
     * элементы, добавленные на портале руками мимо инсталляции.
     */
    async getMeta(domain: string): Promise<PbxFieldsMetaResponseDto> {
        const { bitrix, PortalModel: portal } = await this.pbx.init(domain);

        const fields = EDITABLE_PBX_FIELDS.flatMap(config => {
            const meta = this.buildFieldMeta(portal, config);
            if (!meta) {
                this.logger.warn(
                    `Поле ${config.code} (${config.entity}) не настроено на портале ${domain} — пропускаю`,
                );
                return [];
            }
            return [meta];
        });

        // contract_type: заменяем items портальной БД живым словарём.
        const contractTypeMeta = fields.find(
            field =>
                field.code === PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_type,
        );
        if (contractTypeMeta) {
            const liveItems = await new ContractTypeItemsService(
                bitrix,
                this.financeCache,
                domain,
            ).getItems(
                portal.getDealFieldBitrixIdByCode(
                    PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_type,
                ),
            );
            contractTypeMeta.items = liveItems.map(item => ({
                code: item.code,
                name: item.name,
            }));
        }

        return { fields };
    }

    /** Запись значения + сброс финансового кэша домена (сделка изменилась). */
    async updateValue(
        dto: PbxFieldUpdateRequestDto,
    ): Promise<PbxFieldUpdateResponseDto> {
        // @IsIn в DTO гарантирует код из whitelist; конфиг всегда найдётся.
        const config = findEditablePbxField(dto.fieldCode)!;
        const { bitrix, PortalModel: portal } = await this.pbx.init(dto.domain);

        // contract_type: code → numeric id по живому словарю (портальная БД
        // не знает элементов, добавленных руками).
        let enumDict: ReadonlyMap<string, number> | undefined;
        if (
            dto.fieldCode === PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_type
        ) {
            const liveItems = await new ContractTypeItemsService(
                bitrix,
                this.financeCache,
                dto.domain,
            ).getItems(
                portal.getDealFieldBitrixIdByCode(
                    PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_type,
                ),
            );
            enumDict = new Map(
                liveItems.map(item => [item.code, item.id]),
            );
        }

        const writer = new PbxFieldWriteService(bitrix, portal);
        const value = await writer.write(
            config,
            dto.entityId,
            dto.value ?? null,
            enumDict,
        );

        // Финансовые отчёты читают эти поля из кэша — сбрасываем весь домен
        // (грубая, но корректная инвалидация; отчёты пересчитаются лениво).
        const deleted = await this.financeCache.resetByPattern(
            buildResetPattern(dto.domain, SALES_FINANCE_CACHE_SCOPE.all),
        );
        this.logger.log(
            `pbx-field ${dto.fieldCode}=${String(value)} → ${config.entity} #${dto.entityId} ` +
                `(${dto.domain}); сброшено кэш-ключей: ${deleted}`,
        );

        return { fieldCode: dto.fieldCode, entityId: dto.entityId, value };
    }

    /** Метаданные одного поля (name/items с портала). */
    private buildFieldMeta(
        portal: PortalModel,
        config: EditablePbxFieldConfig,
    ): PbxFieldMetaDto | null {
        const field =
            config.entity === PBX_FIELD_ENTITY.deal
                ? portal.getDealFieldByCode(config.code)
                : portal.getCompanyFieldByCode(config.code);
        if (!field || !field.bitrixId) return null;

        return {
            code: config.code,
            entity: config.entity,
            valueKind: config.valueKind,
            name: field.name || field.title || config.code,
            confirm: config.confirm,
            items: (field.items ?? []).map(item => ({
                code: item.code,
                name: item.name || item.title || item.code,
            })),
        };
    }
}
