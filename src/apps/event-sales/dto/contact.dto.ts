import { IBXContact } from "src/modules/bitrix/domain/interfaces/bitrix.interface";

export class ContactDto implements IBXContact {
    ASSIGNED_BY_ID: string;
    ID: number;
    NAME: string;
    PHONE: {
        VALUE: string,
        TYPE: string
    }[];
    EMAIL: {
        VALUE: string,
        TYPE: string
    }[];
    POST: string;
    COMMENTS: string;
    COMPANY_ID: string;
    LAST_NAME: string;
}
