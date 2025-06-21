import { EBxMethod } from "src/modules/bitrix/core";
import { IUserFieldConfig } from "../interface/userfieldconfig.interface";
import { UserFieldConfigAddDto, UserFieldConfigDeleteDto, UserFieldConfigGetDto, UserFieldConfigListDto, UserFieldConfigResponseFieldDto, UserFieldConfigResponseFieldsDto, UserFieldConfigUpdateDto } from "../dto/userfieldconfig.dto";

export type UserFieldConfigSchema = {
    [EBxMethod.GET]: {
        request: UserFieldConfigGetDto;
        response: { field: IUserFieldConfig };
    };

    [EBxMethod.LIST]: {
        request: UserFieldConfigListDto;
        response: UserFieldConfigResponseFieldsDto;
    };
    [EBxMethod.ADD]: {
        request: UserFieldConfigAddDto;
        response: UserFieldConfigResponseFieldDto;
    };
    [EBxMethod.UPDATE]: {
        request: UserFieldConfigUpdateDto;
        response: UserFieldConfigResponseFieldDto;
    };
    [EBxMethod.DELETE]: {
        request: UserFieldConfigDeleteDto;
        response: { field: IUserFieldConfig };
    };
};  