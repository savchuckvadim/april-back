import { EBxNamespace } from '../consts/bitrix-api.enum';
import { EBXEntity } from '../consts/bitrix-entities.enum';
import {
    BxCatalogSchema,
    BxListSchema,
    BxRpaItemSchema,
    UserFieldConfigSchema,
    UserSchema,
} from '@/modules/bitrix/';
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
} from 'src/modules/bitrix/';

import { TaskSchema } from 'src/modules/bitrix/domain/tasks/task/schema/task.schema';
import { ActivitySchema } from 'src/modules/bitrix/domain/activity/bx-activity.schema';
import { BxSmartTypeSchema } from '@/modules/bitrix/domain/crm/smart-type';
import { BxListItemSchema } from '@/modules/bitrix/domain/list-item/schema/bx-list-item.schema';
import { RecentSchema } from '@/modules/bitrix/domain/chat/recent/schema/bx-recent.schema';
import { MessageSchema } from '@/modules/bitrix/domain/chat/message/schema/bx-message.schema';
import { DialogSchema } from '@/modules/bitrix/domain/chat/dialog/schema/bx-dialog.schema';
import {
    BxDiskFileSchema,
    BxDiskFolderSchema,
    BxDiskStorageSchema,
} from '@/modules/bitrix/domain/disk';

export type BXApiSchema = {
    [EBxNamespace.CRM]: {
        [EBXEntity.DEAL]: DealSchema;
        [EBXEntity.COMPANY]: CompanySchema;
        [EBXEntity.CONTACT]: ContactSchema;
        [EBXEntity.USER_FIELD]: FieldsSchema;
        [EBXEntity.USER_FIELD_ENUMERATION]: FieldsEnumerationSchema;
        [EBXEntity.ACTIVITY]: ActivitySchema;
        [EBXEntity.CATEGORY]: BxCategorySchema;
        [EBXEntity.STATUS]: BxStatusSchema;
        [EBXEntity.ITEM]: BxItemSchema;
        [EBXEntity.TIMELINE_COMMENT]: TimelineCommentSchema;
        [EBXEntity.TYPE]: BxSmartTypeSchema;
    };
    [EBxNamespace.RPA]: {
        [EBXEntity.ITEM]: BxRpaItemSchema;
    };
    [EBxNamespace.TASKS]: {
        [EBXEntity.TASK]: TaskSchema;
    };
    [EBxNamespace.CRM_ITEM]: {
        [EBXEntity.PRODUCT_ROW]: ProductRowSchema;
    };
    [EBxNamespace.DISK]: {
        [EBXEntity.FILE]: BxDiskFileSchema;
        [EBXEntity.FOLDER]: BxDiskFolderSchema;
        [EBXEntity.STORAGE]: BxDiskStorageSchema;
    };

    [EBxNamespace.WITHOUT_NAMESPACE]: {
        [EBXEntity.LISTS]: BxListSchema;
        [EBXEntity.USER_FIELD_CONFIG]: UserFieldConfigSchema;
        [EBXEntity.USER]: UserSchema;
    };
    [EBxNamespace.LISTS]: {
        [EBXEntity.ELEMENT]: BxListItemSchema;
    };
    [EBxNamespace.CATALOG]: {
        [EBXEntity.PRODUCT]: BxCatalogSchema;
    };
    [EBxNamespace.IM]: {
        [EBXEntity.RECENT]: RecentSchema;
        [EBXEntity.MESSAGE]: MessageSchema;
        [EBXEntity.CHAT]: DialogSchema;
        [EBXEntity.DIALOG]: DialogSchema;
    };
};
