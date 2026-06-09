import { EBxNamespace } from '../consts/bitrix-api.enum';
import { EBXEntity } from '../consts/bitrix-entities.enum';
import {
    BxCatalogSchema,
    BxListSchema,
    BxRpaItemSchema,
    BxRpaTypeSchema,
    BxRpaStageSchema,
    UserFieldConfigSchema,
    UserSchema,
} from '@/modules/bitrix';
import {
    CompanySchema,
    ContactSchema,
    DealSchema,
    LeadSchema,
    ProductRowSchema,
    FieldsSchema,
    FieldsEnumerationSchema,
    BxCategorySchema,
    BxStatusSchema,
    BxItemSchema,
    TimelineCommentSchema,
    RequisiteSchema,
    RequisitePresetSchema,
    ActivityTodoSchema,
} from 'src/modules/bitrix';

import { TaskSchema } from 'src/modules/bitrix/domain/tasks/task/schema/task.schema';
import { ChecklistItemSchema } from 'src/modules/bitrix/domain/tasks/checklist-item/schema/bx-checklist-item.schema';
import { ActivitySchema } from 'src/modules/bitrix/domain/activity/bx-activity.schema';
import { BxSmartTypeSchema } from '@/modules/bitrix/domain/crm/smart-type';
import { BxListItemSchema } from '@/modules/bitrix/domain/list-item/schema/bx-list-item.schema';
import { RecentSchema } from '@/modules/bitrix/domain/chat/recent/schema/bx-recent.schema';
import { MessageSchema } from '@/modules/bitrix/domain/chat/message/schema/bx-message.schema';
import { DialogSchema } from '@/modules/bitrix/domain/chat/dialog/schema/bx-dialog.schema';
import { DialogMessageSchema } from '@/modules/bitrix/domain/chat/dialog-message/schema/bx-dialog-message.schema';
import { ImV2EventSchema } from '@/modules/bitrix/domain/chat/im-v2-event/schema/bx-im-v2-event.schema';
import {
    BxDiskFileSchema,
    BxDiskFolderSchema,
    BxDiskStorageSchema,
} from '@/modules/bitrix/domain/disk';
import {
    ImBotLifecycleSchema,
    ImBotSchema,
} from '../../../domain/imbot/bot/schema/bx-imbot-bot.schema';
import { ImBotMessageSchema } from '../../../domain/imbot/message/schema/bx-imbot-message.schema';
import { ImBotCommandSchema } from '../../../domain/imbot/command/schema/bx-imbot-command.schema';
import { ImBotChatSchema } from '../../../domain/imbot/chat/schema/bx-imbot-chat.schema';
import { ImBotDialogSchema } from '../../../domain/imbot/dialog/schema/bx-imbot-dialog.schema';
import { ImBotV2BotSchema } from '../../../domain/imbot-v2/bot/schema/bx-imbot-v2-bot.schema';
import { ImBotV2MessageSchema } from '../../../domain/imbot-v2/message/schema/bx-imbot-v2-message.schema';
import { ImBotV2CommandSchema } from '../../../domain/imbot-v2/command/schema/bx-imbot-v2-command.schema';
import { ImBotV2ChatSchema } from '../../../domain/imbot-v2/chat/schema/bx-imbot-v2-chat.schema';
import { ImBotV2FileSchema } from '../../../domain/imbot-v2/file/schema/bx-imbot-v2-file.schema';
import { ImBotV2EventSchema } from '../../../domain/imbot-v2/event/schema/bx-imbot-v2-event.schema';
import { ImBotV2RevisionSchema } from '../../../domain/imbot-v2/revision/schema/bx-imbot-v2-revision.schema';
import { ImOpenlinesBotSessionSchema } from '../../../domain/imopenlines/bot-session/schema/bx-imopenlines-bot-session.schema';
import { SonetGroupSchema } from '../../../domain/sonet-group/schema/sonet-group.schema';

export type BXApiSchema = {
    [EBxNamespace.CRM]: {
        [EBXEntity.DEAL]: DealSchema;
        [EBXEntity.LEAD]: LeadSchema;
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
        [EBXEntity.REQUISITE]: RequisiteSchema;
        [EBXEntity.REQUISITE_PRESET]: RequisitePresetSchema;
        [EBXEntity.ACTIVITY_TODO]: ActivityTodoSchema;
    };
    [EBxNamespace.RPA]: {
        [EBXEntity.ITEM]: BxRpaItemSchema;
        [EBXEntity.TYPE]: BxRpaTypeSchema;
        [EBXEntity.STAGE]: BxRpaStageSchema;
    };
    [EBxNamespace.TASKS]: {
        [EBXEntity.TASK]: TaskSchema;
    };
    [EBxNamespace.TASK]: {
        [EBXEntity.CHECKLIST_ITEM]: ChecklistItemSchema;
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
        [EBXEntity.DIALOG_MESSAGES]: DialogMessageSchema;
    };
    [EBxNamespace.IMV2]: {
        [EBXEntity.EVENT]: ImV2EventSchema;
    };
    [EBxNamespace.IMBOT]: {
        [EBXEntity.BOT_LIFECYCLE]: ImBotLifecycleSchema;
        [EBXEntity.BOT]: ImBotSchema;
        [EBXEntity.MESSAGE]: ImBotMessageSchema;
        [EBXEntity.COMMAND]: ImBotCommandSchema;
        [EBXEntity.CHAT]: ImBotChatSchema;
        [EBXEntity.DIALOG]: ImBotDialogSchema;
    };
    [EBxNamespace.IMBOT_V2]: {
        [EBXEntity.BOT_V2]: ImBotV2BotSchema;
        [EBXEntity.CHAT_V2]: ImBotV2ChatSchema;
        [EBXEntity.COMMAND_V2]: ImBotV2CommandSchema;
        [EBXEntity.CHAT_MESSAGE_V2]: ImBotV2MessageSchema;
        [EBXEntity.FILE]: ImBotV2FileSchema;
        [EBXEntity.EVENT]: ImBotV2EventSchema;
        [EBXEntity.REVISION]: ImBotV2RevisionSchema;
    };
    [EBxNamespace.IMOPENLINES]: {
        [EBXEntity.BOT_SESSION]: ImOpenlinesBotSessionSchema;
    };
    [EBxNamespace.SONET_GROUP]: {
        [EBXEntity.SONET_GROUP]: SonetGroupSchema;
    };
};
