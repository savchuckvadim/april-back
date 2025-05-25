import { EBxMethod } from "src/modules/bitrix/core";
import { IBXUserField } from "../../interfaces/bitrix.interface";



export type FieldsSchema = {

    [EBxMethod.FIELDS]: {
        request: undefined;
        response: { fields: IBXUserField[] };
    };
};
