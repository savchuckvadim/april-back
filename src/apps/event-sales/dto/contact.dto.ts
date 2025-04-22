import { IBXContact } from "src/modules/bitrix/domain/interfaces/bitrix.interface";

export class ContactDto implements IBXContact {
    ID: number;
    NAME: string;
    PHONE: string;
    EMAIL: string;
    POST: string;
}
