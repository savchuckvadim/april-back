// import { HttpException, HttpStatus, Logger } from "@nestjs/common";
// import { BitrixApiService } from "src/modules/bitrix/core/http/bitrix-request-api.service";
// import { BitrixApiFactoryService } from "src/modules/bitrix/core/queue/bitrix-api.factory.service";
// import { IPortal } from "src/modules/portal/interfaces/portal.interface";
// import { PortalProviderService } from "src/modules/portal/services/portal-provider.service";
// import { PortalModel } from "src/modules/portal/services/portal.model";

// export interface IPBXInitResult {
//     portalModel: PortalModel
//     portal: IPortal
//     bitrixApi: BitrixApiService
// }
// export async function queuePbxInit(
//     domain: string,
//     portalProvider: PortalProviderService,
//     bxFactory: BitrixApiFactoryService
// ): Promise<IPBXInitResult> {
//     Logger.log('[queuePbxInit] called with domain: ' + domain);
//     const portalModel = await portalProvider.getModelByDomain(domain);
//     const portal = portalModel.getPortal();
//     Logger.log('[queuePbxInit] called with portal: ' + portal?.id || portal);
//     if (!portal) throw new HttpException('Portal not found queue init pbx', HttpStatus.BAD_REQUEST);
//     Logger.log('[queuePbxInit] called with domain: ' + portal.id);
//     //for queue
//     const bitrixApi = bxFactory.create(portal)
//     Logger.log('[queuePbxInit] called with bitrixApi: ' + bitrixApi.getCmdBatch());
//     return {
//         portalModel,
//         portal,
//         bitrixApi
//     }
// }