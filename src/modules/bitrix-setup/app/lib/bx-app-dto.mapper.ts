import { PortalDto } from "@/modules/portal-konstructor/portal/portal.entity";
import { BitrixAppDto } from "../dto/bitrix-app.dto";
import { BitrixAppEntity } from "../model/bitrix-app.model";

export const toBitrixAppDto = (app: BitrixAppEntity): BitrixAppDto => {
    const portalDto = new PortalDto(app.portal);
    const appDto = new BitrixAppDto(app, portalDto);
    return appDto;
}
