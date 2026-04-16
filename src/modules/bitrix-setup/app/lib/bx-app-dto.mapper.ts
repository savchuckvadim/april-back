import { PortalDto } from '@/modules/portal-konstructor/portal/portal.entity';
import { BitrixAppDto } from '../dto/bitrix-app.dto';
import { BitrixAppEntity } from '../model/bitrix-app.model';

export const toBitrixAppDto = (app: BitrixAppEntity): BitrixAppDto => {
    const portalDto = app.portal ? new PortalDto(app.portal) : undefined;
    const appDto = new BitrixAppDto(app, portalDto ?? undefined);
    return appDto;
};
