import { IBXCompany, IBXContact, IBXDeal, IBXProductRow, IBXTask } from "src/modules/bitrix/domain/interfaces/bitrix.interface";
import { EBxMethod, EBxNamespace } from "../consts/bitrix-api.enum";
import { EBXEntity } from "../consts/bitrix-entities.enum";
import { DealSchema } from "src/modules/bitrix/domain/crm/deal/bx-deal.schema";
import { ListSchema } from "src/modules/bitrix/domain/list/list.schema";
import { CompanySchema } from "src/modules/bitrix/domain/crm/company/bx-company.schema";
import { TasksSchema } from "src/modules/bitrix/domain/tasks/bx-tasks.schema";
import { ActivitySchema } from "src/modules/bitrix/domain/activity/bx-activity.schema";
import { FileSchema } from "src/modules/bitrix/domain/file/bx-file.schema";

export type BXApiSchema = {
  [EBxNamespace.CRM]: {
    [EBXEntity.DEAL]: DealSchema;
    [EBXEntity.COMPANY]: CompanySchema;
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
    [EBXEntity.ACTIVITY]: ActivitySchema
  };
  [EBxNamespace.TASKS]: {
    [EBXEntity.TASK]: TasksSchema
  };
  [EBxNamespace.CRM_ITEM]: {
    [EBXEntity.PRODUCT_ROW]: {
      [EBxMethod.SET]: {
        request: Partial<IBXProductRow>;
        response: number;
      };
    };
  };
  [EBxNamespace.DISK]: {
    [EBXEntity.FILE]: FileSchema
  };

  [EBxNamespace.WITHOUT_NAMESPACE]: {
    [EBXEntity.LISTS]: ListSchema;
  };
};
