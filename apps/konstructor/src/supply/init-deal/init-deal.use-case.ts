import { Injectable } from '@nestjs/common';
import { InitDealDto, SupplyInitDealFlow } from './dto/init-deal.dto';
import { SupplyDealFlowService } from './services/supply-deal-flow.service';
import { resolveInitDealFlow } from './lib/resolve-init-deal-flow';
import { INIT_DEAL_RPA_FIELD } from './lib/init-deal-rpa-fields';

import { PBXService } from '@lib/pbx';
import {
    BitrixService,
    EBXEntity,
    IBXDeal,
    IBXItem,
    IBxRpaItem,
} from '@lib/bitrix';
import {
    IPDeal,
    IPSmart,
    IRPA,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { CopyInnerDealService } from './services/copy-inner-deal.service';
import { TelegramService } from '@lib/telegram/telegram.service';
import { CopyProductRowsService } from './services/copy-product-rows.service';
import { CopyComplectVariantsService } from './services/copy-complect-variants.service';
import { InnerDealService } from '../../modules/inner-deal/services/inner-deal.service';
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import {
    EnumOrkEventAction,
    EnumOrkEventType,
    OrkHistoryBxListService,
} from '@lib/portal-lib/pbx/pbx-ork-history-bx-list';

/** Файловое поле Bitrix: пара [имя файла, base64]. */
interface BitrixFileFieldValue {
    fileData: [string, string];
}

/**
 * Значение, пригодное для записи в поле сделки. Файловый вариант в IBXDeal не
 * описан, поэтому union объявлен здесь, а присваивание идёт через один
 * локальный каст на границе с библиотекой.
 */
type DealFieldValue =
    | string
    | number
    | boolean
    | string[]
    | number[]
    | BitrixFileFieldValue
    | undefined;

/** Элемент справочника, у которого есть человекочитаемое имя. */
const isNamedItem = (value: unknown): value is { name: string } =>
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof (value as { name: unknown }).name === 'string';

/** URL файла Bitrix: в RPA он приезжает то как urlMachine, то как downloadUrl. */
const getBitrixFileUrl = (value: unknown): string | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }
    const file = value as { urlMachine?: unknown; downloadUrl?: unknown };
    const url = file.urlMachine ?? file.downloadUrl;
    return typeof url === 'string' && url !== '' ? url : null;
};

@Injectable()
export class InitDealUseCase {
    constructor(
        private readonly pbx: PBXService,
        private readonly copyInnerDealService: CopyInnerDealService,
        private readonly telegram: TelegramService,
        private readonly orkHistoryBxListService: OrkHistoryBxListService,
        private readonly dispatcher: QueueDispatcherService,
        private readonly innerDealService: InnerDealService,
    ) {}

    async execute(dto: InitDealDto) {
        const domain = dto.auth.domain;
        const { bitrix, PortalModel } = await this.pbx.init(domain);

        const portalDeal = PortalModel.getDeal();
        const targetCategoryDeal = portalDeal.categories.find(
            category => category.code === 'service_base',
        );
        let dealValues = {} as Partial<IBXDeal>;
        const rpaInfo = dto.document_id[2];

        const [entityTypeIdStr, itemIdStr] = rpaInfo.split(':');
        const entityTypeId = Number(entityTypeIdStr);
        const itemId = Number(itemIdStr);

        const rpaResponse = await bitrix.rpaItem.get({
            typeId: entityTypeId,
            id: itemId,
        });
        const rpa = rpaResponse.result.item;

        const companyId = this.getCompanyIdFromRpa(rpa, PortalModel);
        const oldDealId = this.getDealIdFromRpa(rpa, PortalModel);
        const responsibleId =
            this.getResponsibleIdFromRpa(rpa, PortalModel) || 1;

        const portalRpa = PortalModel.getRpaByCode('supply');
        const offerServicePortalSmart =
            PortalModel.getSmartByType('service_offer');
        const offerSmartEntityType = offerServicePortalSmart?.entityTypeId;
        const offerSmartInRpaId = PortalModel.getRpaFieldBitrixIdByCode(
            'supply',
            'service_offer_smart',
        );

        const offerSmartRawId: unknown = offerSmartInRpaId
            ? rpa[offerSmartInRpaId]
            : undefined;
        const hasOfferSmart = Boolean(offerSmartRawId && offerSmartEntityType);
        const flow: SupplyInitDealFlow = resolveInitDealFlow({
            explicit: dto.flow,
            isExtension: this.getIsExtensionFromRpa(rpa, PortalModel),
            hasOfferSmart,
        });

        const supplyFlow = new SupplyDealFlowService(bitrix, PortalModel);

        let serviceSmartId = null as number | null;
        if (flow === 'renewal' && hasOfferSmart && offerServicePortalSmart) {
            const offerSmartResponse = await bitrix.item.get(
                String(offerSmartRawId),
                String(offerSmartEntityType),
            );
            const offerSmart = offerSmartResponse.result.item;

            serviceSmartId = Number(offerSmart.id);
            const dealValuesFromOfferSmart =
                await this.getDealValuesFromOfferSmart(
                    offerSmart,
                    offerServicePortalSmart,
                    portalDeal,
                    bitrix,
                );

            dealValues = { ...dealValues, ...dealValuesFromOfferSmart };
        }
        if (portalRpa) {
            const dealValuesFromRpa = await this.getDealFieldValuesFromRpa(
                rpa,
                portalRpa,
                portalDeal,
                bitrix,
                false,
            );
            dealValues = { ...dealValues, ...dealValuesFromRpa };
        }

        dealValues.CATEGORY_ID = targetCategoryDeal?.bitrixId;
        dealValues.COMPANY_ID = companyId?.toString() || '';
        dealValues.ASSIGNED_BY_ID = responsibleId?.toString() || '';

        if (flow === 'supply') {
            dealValues = {
                ...dealValues,
                ...supplyFlow.buildSupplyOnlyValues(rpa),
            };
            if (oldDealId) {
                // значения базовой сделки — только те, которых ещё нет: RPA свежее
                dealValues = {
                    ...dealValues,
                    ...(await supplyFlow.buildBaseDealValues(
                        oldDealId,
                        dealValues,
                    )),
                };
            }
            dealValues = {
                ...dealValues,
                ...supplyFlow.buildClearedDocumentValues(),
            };
            const stageId = supplyFlow.resolveStageId(rpa);
            if (stageId) {
                dealValues.STAGE_ID = stageId;
            }
        }

        const newDealResponse = await bitrix.deal.set(dealValues);

        const newDealId = newDealResponse.result;

        if (portalRpa) {
            const dealValuesFromFiles = await this.getDealFieldValuesFromRpa(
                rpa,
                portalRpa,
                portalDeal,
                bitrix,
                true,
            );

            // файлы льём по одному: batch не кодирует их корректно
            for (const key in dealValuesFromFiles) {
                await bitrix.deal.update(newDealId, {
                    [key]: dealValuesFromFiles[key],
                });
            }

            const rpaComment = this.getCommentRpaMessage(domain, newDealId);
            const rpaCommentEntity = this.getCommentEntityMessage(
                domain,
                entityTypeId,
                itemId,
            );
            await bitrix.api.call('rpa.timeline.add', {
                typeId: entityTypeId,
                itemId: itemId,
                userId: '1',
                fields: {
                    title:
                        flow === 'renewal'
                            ? 'Перезаключение: Новая Сделка'
                            : 'Поставка: Новая Сделка',
                    description: rpaComment,
                },
            });
            await bitrix.timeline.addTimelineComment({
                ENTITY_ID: Number(newDealId),
                ENTITY_TYPE: EBXEntity.DEAL,
                COMMENT: rpaCommentEntity,
                AUTHOR_ID: '1',
            });
        }

        const productRowService = new CopyProductRowsService(
            oldDealId ?? 0,
            Number(newDealId),
            bitrix,
        );

        if (flow === 'renewal') {
            if (serviceSmartId && offerServicePortalSmart) {
                await productRowService.copyProductFromSmartToDeal(
                    serviceSmartId,
                    offerServicePortalSmart,
                );
            }
            // слепок конструктора — из смарта «предложение на будущий период»,
            // с фолбэком на базовую сделку: смарт мог быть собран не конструктором
            await this.copyInnerDealService.copyFromServiceSmart(
                { serviceSmartId, baseDealId: oldDealId },
                Number(newDealId),
                domain,
                responsibleId,
            );
        } else {
            if (oldDealId) {
                await productRowService.copyProductFromDealToDeal();
                await this.copyInnerDealService.copyFromBaseDeal(
                    oldDealId,
                    Number(newDealId),
                    domain,
                    responsibleId,
                );
            }
            // поставка передаёт клиента в сервис: ответственные и номер АРМ
            await supplyFlow.updateParticipants(rpa);
        }

        // Вместе со сделкой переезжают ВСЕ собранные наборы комплектов, а не
        // один: у каждого может быть свой договор, в том числе другого типа.
        // Смарт не установлен или вариантов нет — шаг проходит вхолостую.
        if (oldDealId) {
            const variantsService = new CopyComplectVariantsService(
                bitrix,
                PortalModel,
                this.innerDealService,
            );
            await variantsService.copy(
                domain,
                oldDealId,
                Number(newDealId),
                responsibleId,
            );
        }
        // Задачи ОРК живут в event-service — отдаём их туда джобой, как только
        // поставка доехала до сервисной сделки.
        await this.dispatcher.dispatch(
            QueueNames.SERVICE_ORK_TASKS,
            JobNames.SERVICE_ORK_SUPPLY_TASKS,
            {
                domain,
                rpaTypeId: entityTypeId,
                rpaId: itemId,
                dealId: Number(newDealId),
            },
        );

        if (flow !== 'renewal') {
            // история ОРК ведётся по событию «перезаключение»; у поставки его нет
            return newDealId;
        }

        const elementCode = `ork_pere_contract_${oldDealId}_${responsibleId}`;
        const listResult =
            await this.orkHistoryBxListService.setOrkHistoryBxListItem(domain, {
                type: EnumOrkEventType.et_ork_pere_contract,
                action: EnumOrkEventAction.ea_ork_done,
                responsibleId: responsibleId,
                elementCode,
                companyId: Number(companyId),
                dealId: newDealId,
            });
        return listResult;
    }
    private getCommentRpaMessage(domain: string, newDealId: number) {
        const link = `https://${domain}/crm/deal/details/${newDealId}/`;
        const message = `<a href="${link}" target="_blank">Сделка создана</a>`;
        return message;
    }
    private getCommentEntityMessage(
        domain: string,
        rpaTypeId: number,
        rpaId: number,
    ) {
        const link = `https://${domain}/rpa/item/${rpaTypeId}/${rpaId}/`;
        const message = `✅ <a href="${link}" target="_blank">Карточка поставки</a>`;
        return message;
    }
    private async getDealValuesFromOfferSmart(
        offerSmartItem: IBXItem,
        portalSmart: IPSmart,
        portalDeal: IPDeal,
        bitrix: BitrixService,
    ): Promise<Partial<IBXDeal>> {
        const dealValues = {} as Partial<IBXDeal>;

        for (const key in offerSmartItem) {
            const portalSmartField = portalSmart.bitrixfields.find(
                field => field?.bitrixCamelId === key,
            );

            if (portalSmartField) {
                if (portalSmartField.type !== 'file') {
                    const fieldCode = portalSmartField.code;
                    const dealField = portalDeal.bitrixfields.find(
                        field => field.code === fieldCode,
                    );
                    if (dealField) {
                        const rawValue: unknown = offerSmartItem[key];

                        const value = await this.prepareFieldValue(
                            rawValue,
                            bitrix,
                            fieldCode,
                        );
                        if (value !== undefined) {
                            // файловое поле в типах библиотеки не описано
                            dealValues[`UF_CRM_${dealField.bitrixId}`] =
                                value as IBXDeal[keyof IBXDeal];
                        }
                    }
                }
            }
        }

        return dealValues;
    }
    private async getDealFieldValuesFromRpa(
        rpa: IBxRpaItem,
        portalRpa: IRPA,
        portalDeal: IPDeal,
        bitrix: BitrixService,
        isFiles: boolean = false,
    ): Promise<Partial<IBXDeal>> {
        const rpaTypeId = portalRpa.entityTypeId;
        const dealValues = {} as Partial<IBXDeal>;

        for (const key in rpa) {
            const portalRpaField = portalRpa.bitrixfields.find(
                field =>
                    this.getRpaFieldBitrixId(rpaTypeId, field.bitrixId) === key,
            );

            if (portalRpaField) {
                if (!isFiles && portalRpaField.type === 'file') {
                    continue;
                }

                if (
                    (isFiles &&
                        (portalRpaField.type === 'file' ||
                            portalRpaField.code === 'current_invoice' ||
                            portalRpaField.code === 'current_suply')) ||
                    !isFiles
                ) {
                    const fieldCode = portalRpaField.code;
                    const dealField = portalDeal.bitrixfields.find(
                        field => field.code === fieldCode,
                    );

                    if (dealField) {
                        // dealValues[`UF_CRM_${dealField.bitrixId}`] = rpa[key]
                        const rawValue: unknown = rpa[key];

                        const value = await this.prepareFieldValue(
                            rawValue,
                            bitrix,
                            fieldCode,
                        );
                        if (value !== undefined) {
                            // файловое поле в типах библиотеки не описано
                            dealValues[`UF_CRM_${dealField.bitrixId}`] =
                                value as IBXDeal[keyof IBXDeal];
                        }
                    }
                }
            }
        }
        return dealValues;
    }
    /**
     * Приводит значение из RPA/смарта к тому, что принимает поле сделки:
     * комплекты схлопываются в строку, вложенные массивы разворачиваются,
     * файлы скачиваются в base64.
     */
    private async prepareFieldValue(
        rawValue: unknown,
        bitrix: BitrixService,
        fldCode: string,
    ): Promise<DealFieldValue> {
        if (fldCode === 'complect_name' && Array.isArray(rawValue)) {
            return rawValue
                .map(item => (isNamedItem(item) ? item.name : String(item)))
                .join(', ');
        }

        if (
            Array.isArray(rawValue) &&
            rawValue.every(item => Array.isArray(item))
        ) {
            return (rawValue as unknown[][]).flat() as DealFieldValue;
        }

        const fileUrl = getBitrixFileUrl(rawValue);
        if (fileUrl) {
            const fileData =
                await bitrix.file.downloadBitrixFileAndConvertToBase64(fileUrl);
            return { fileData };
        }

        return rawValue as DealFieldValue;
    }

    /**
     * Флаг RPA «Перезаключение?». null — поля на портале нет или оно пустое:
     * тогда сценарий определяется косвенно.
     */
    private getIsExtensionFromRpa(
        rpa: IBxRpaItem,
        portalModel: PortalModel,
    ): boolean | null {
        const rpaField = portalModel.getRpaFieldBitrixIdByCode(
            'supply',
            INIT_DEAL_RPA_FIELD.isExtension,
        );
        if (!rpaField) {
            return null;
        }
        const value: unknown = rpa[rpaField];
        if (value === undefined || value === null || value === '') {
            return null;
        }
        return value === true || value === 1 || value === 'Y' || value === '1';
    }

    private getCompanyIdFromRpa(
        rpa: IBxRpaItem,
        portalModel: PortalModel,
    ): number | null {
        const rpaField = portalModel.getRpaFieldBitrixIdByCode(
            'supply',
            'rpa_crm_company',
        );
        if (rpaField) {
            return Number(rpa[rpaField]);
        }
        return null;
    }

    private getDealIdFromRpa(
        rpa: IBxRpaItem,
        portalModel: PortalModel,
    ): number | null {
        const rpaField = portalModel.getRpaFieldBitrixIdByCode(
            'supply',
            'rpa_crm_base_deal',
        );
        if (rpaField) {
            return Number(rpa[rpaField]);
        }
        return null;
    }

    private getResponsibleIdFromRpa(
        rpa: IBxRpaItem,
        portalModel: PortalModel,
    ): number | null {
        const rpaField = portalModel.getRpaFieldBitrixIdByCode(
            'supply',
            'manager_os',
        );
        if (rpaField) {
            return Number(rpa[rpaField]);
        }
        return null;
    }

    private getRpaFieldBitrixId(
        rpaTypeId: number,
        fieldBitrixId: number | string,
    ): string {
        // Тот же контракт, что в PortalModel.getRpaFieldBitrixId: в pbx у части
        // порталов bitrixId уже с префиксом — второй раз клеить нельзя.
        if (String(fieldBitrixId).startsWith('UF_RPA_')) {
            return String(fieldBitrixId);
        }
        return `UF_RPA_${rpaTypeId}_${fieldBitrixId}`;
    }
}
