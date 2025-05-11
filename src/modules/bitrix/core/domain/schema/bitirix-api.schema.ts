import { IBXCompany, IBXContact, IBXDeal, IBXProductRow, IBXTask } from "src/modules/bitrix/domain/interfaces/bitrix.interface";
import { EBxMethod, EBxNamespace } from "../consts/bitrix-api.enum";
import { EBXEntity, ECrmEntity } from "../consts/bitrix-entities.enum";

export type BXApiSchema = {
  [EBxNamespace.CRM]: {
    [EBXEntity.DEAL]: {
      [EBxMethod.GET]: {
        request: { ID: number | string };
        response: IBXDeal;
      };
      [EBxMethod.ADD]: {
        request: { fields: Partial<IBXDeal> };
        response: number;
      };
      [EBxMethod.UPDATE]: {
        request: { id: number | string; fields: Partial<IBXDeal> };
        response: number;
      };
      [EBxMethod.CONTACT_ITEMS_SET]: {
        request: { id: number | string; items: { CONTACT_ID: string | number }[] };
        response: number;
      };
    };
    [EBXEntity.COMPANY]: {
      [EBxMethod.GET]: {
        request: { ID: number | string };
        response: IBXCompany;
      };
      [EBxMethod.ADD]: {
        request: { fields: Partial<IBXCompany> };
        response: number;
      };
    };
    [EBXEntity.CONTACT]: {
      [EBxMethod.GET]: {
        request: { ID: number | string };
        response: IBXContact;
      };
      [EBxMethod.ADD]: {
        request: { fields: Partial<IBXContact> };
        response: number;
      };
    };
  };
  [EBxNamespace.TASKS]: {
    [EBXEntity.TASK]: {
      [EBxMethod.GET]: {
        request: { id: number | string };
        response: IBXTask;
      };
    };
  };
  [EBxNamespace.CRM_ITEM]: {
    [EBXEntity.PRODUCT_ROW]: {
      [EBxMethod.SET]: {
        request: Partial<IBXProductRow>;
        response: number;
      };
    };
  };
};
