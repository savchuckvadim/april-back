import { EBxNamespace } from "../consts/bitrix-api.enum";
import { EBXEntity } from "../consts/bitrix-entities.enum";
import { BxListSchema } from "@/modules/bitrix/";
import {
  CompanySchema,
  ContactSchema,
  DealSchema,
  ProductRowSchema,
  FieldsSchema,
  FieldsEnumerationSchema,
  BxCategorySchema,
  BxStatusSchema,
  BxItemSchema,
  TimelineCommentSchema,
  BxCatalogSchema
} from "src/modules/bitrix/";


import { TasksSchema } from "src/modules/bitrix/domain/tasks/bx-tasks.schema";
import { ActivitySchema } from "src/modules/bitrix/domain/activity/bx-activity.schema";
import { FileSchema } from "src/modules/bitrix/domain/file/bx-file.schema";
// import { FieldsEnumerationSchema } from "src/modules/bitrix/domain/crm";

export type BXApiSchema = {
  [EBxNamespace.CRM]: {
    [EBXEntity.DEAL]: DealSchema;
    [EBXEntity.COMPANY]: CompanySchema;
    [EBXEntity.CONTACT]: ContactSchema
    [EBXEntity.USER_FIELD]: FieldsSchema;
    [EBXEntity.USER_FIELD_ENUMERATION]: FieldsEnumerationSchema;
    [EBXEntity.ACTIVITY]: ActivitySchema
    [EBXEntity.CATEGORY]: BxCategorySchema
    [EBXEntity.STATUS]: BxStatusSchema
    [EBXEntity.ITEM]: BxItemSchema
    [EBXEntity.TIMELINE_COMMENT]: TimelineCommentSchema
  };
  [EBxNamespace.TASKS]: {
    [EBXEntity.TASK]: TasksSchema
  };
  [EBxNamespace.CRM_ITEM]: {
    [EBXEntity.PRODUCT_ROW]: ProductRowSchema

    // {
    //   [EBxMethod.SET]: {
    //     request: Partial<IBXProductRow>;
    //     response: number;
    //   };
    // };
  };
  [EBxNamespace.DISK]: {
    [EBXEntity.FILE]: FileSchema
  };

  [EBxNamespace.WITHOUT_NAMESPACE]: {
    [EBXEntity.LISTS]: BxListSchema;
  };
  [EBxNamespace.CATALOG]: {
    [EBXEntity.PRODUCT]: BxCatalogSchema
  };
};
