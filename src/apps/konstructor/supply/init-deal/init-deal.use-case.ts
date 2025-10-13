import { Injectable } from '@nestjs/common';
import { InitDealDto } from './dto/init-deal.dto';
import { PBXService } from '@/modules/pbx';
import {
    BitrixService,
    EBXEntity,
    IBXDeal,
    IBXItem,
    IBxRpaItem,
} from '@/modules/bitrix';
import {
    IDeal,
    IPSmart,
    IRPA,
} from '@/modules/portal/interfaces/portal.interface';
import { PortalModel } from '@/modules/portal/services/portal.model';
import { CopyInnerDealService } from './services/copy-inner-deal.service';
import { TelegramService } from '@/modules/telegram/telegram.service';
import { CopyProductRowsService } from './services/copy-product-rows.service';

@Injectable()
export class InitDealUseCase {
    constructor(
        private readonly pbx: PBXService,
        private readonly copyInnerDealService: CopyInnerDealService,
        private readonly telegram: TelegramService,
    ) { }

    async execute(dto: InitDealDto) {
        const domain = dto.auth.domain;
        const { bitrix, PortalModel, portal } = await this.pbx.init(domain);

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
        const responsibleId = this.getResponsibleIdFromRpa(rpa, PortalModel) || 1;


        const portalRpa = PortalModel.getRpaByCode('supply');
        const offerServicePortalSmart =
            PortalModel.getSmartByType('service_offer');
        const offerSmartEntityType = offerServicePortalSmart?.entityTypeId;
        const offerSmartInRpaId = PortalModel.getRpaFieldBitrixIdByCode(
            'supply',
            'service_offer_smart',
        );

        // console.log('offerServicePortalSmart')
        // console.log(offerServicePortalSmart)

        let serviceSmartId = null as number | null;
        if (rpa && offerSmartEntityType && offerSmartInRpaId) {
            const offerSmartResponse = await bitrix.item.get(
                rpa[offerSmartInRpaId].toString(),
                offerSmartEntityType.toString(),
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
        // console.log('companyId')
        // console.log(companyId)

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

            for (const key in dealValuesFromFiles) {
                const response = await bitrix.deal.update(
                    // `update_deal_${newDealId}_${key}`,
                    newDealId,
                    {
                        [key]: dealValuesFromFiles[key],
                    },
                );
            }
            // await bitrix.api.callBatchWithConcurrency(1)

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
                    title: 'Перезаключение: Новая Сделка',
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

        if (serviceSmartId && oldDealId) {
            const productRowService = new CopyProductRowsService(
                oldDealId,
                newDealId,
                bitrix,
            );
            offerServicePortalSmart &&
                void (await productRowService.copyProductFromSmartToDeal(
                    serviceSmartId,
                    offerServicePortalSmart,
                ));

            await this.copyInnerDealService.copyInnerDeal(
                serviceSmartId,
                newDealId,
                domain,
            );
        }
        // return dealValues
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
        portalDeal: IDeal,
        bitrix: BitrixService,
    ): Promise<Partial<IBXDeal>> {
        const smartTypeId = portalSmart.entityTypeId;
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
                        const rawValue = offerSmartItem[key];

                        const value = await this.prepareFieldValue(
                            rawValue,
                            bitrix,
                            fieldCode,
                        );
                        if (value) {
                            dealValues[`UF_CRM_${dealField.bitrixId}`] = value;
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
        portalDeal: IDeal,
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
                        const rawValue = rpa[key];

                        const value = await this.prepareFieldValue(
                            rawValue,
                            bitrix,
                            fieldCode,
                        );
                        if (value) {
                            dealValues[`UF_CRM_${dealField.bitrixId}`] = value;
                        }
                    }
                }
            }
        }
        return dealValues;
    }
    private async prepareFieldValue(
        rawValue: any,
        bitrix: BitrixService,
        fldCode: string,
    ): Promise<any> {
        let value = rawValue;

        if (fldCode === 'complect_name') {
            if (Array.isArray(rawValue)) {
                value = rawValue.map(item => item.name).join(', ');
            }
        } else if (
            Array.isArray(rawValue) &&
            rawValue.every(item => Array.isArray(item))
        ) {
            value = rawValue.flat();
        } else {
            if (rawValue?.urlMachine || rawValue?.downloadUrl) {
                const url = rawValue?.urlMachine || rawValue?.downloadUrl;
                const fileData =
                    await bitrix.file.downloadBitrixFileAndConvertToBase64(url);
                value = { fileData };
            }
        }
        return value;
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
        return `UF_RPA_${rpaTypeId}_${fieldBitrixId}`;
    }
}
