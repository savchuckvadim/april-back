import { EBxMethod } from "@/modules/bitrix/core";
import { SmartTypeAddRequestDto, SmartTypeListResponseDto, SmartTypeResponseDto, SmartTypeUpdateRequestDto } from "../dto/smart-type-add.dto";
import { SmartTypeGetByEntityTypeIdRequestDto, SmartTypeGetRequestDto, SmartTypeListRequestDto } from "../dto/smart-type.dto";



export type BxSmartTypeSchema = {
    [EBxMethod.ADD]: {
        request: SmartTypeAddRequestDto;
        response: SmartTypeResponseDto;
    };
    [EBxMethod.UPDATE]: {
        request: SmartTypeUpdateRequestDto;
        response: SmartTypeResponseDto;
    };
    [EBxMethod.GET]: {
        request: SmartTypeGetRequestDto;
        response: SmartTypeResponseDto;
    };
    [EBxMethod.GET_BY_ENTITY_TYPE_ID]: {
        request: SmartTypeGetByEntityTypeIdRequestDto;
        response: SmartTypeResponseDto;
    };
    [EBxMethod.LIST]: {
        request: SmartTypeListRequestDto;
        response: SmartTypeListResponseDto;
    };
    [EBxMethod.DELETE]: {
        request: SmartTypeGetRequestDto;
        response: { id: number };
    };
   
};
