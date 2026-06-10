import { BitrixBaseApi } from './core/base/bitrix-base-api';
// import { BitrixApiFactoryService } from './core/queue/bitrix-api.factory.service';
import {
    BxCompanyService,
    BxContactBatchService,
    BxContactService,
    BxDealService,
    BxLeadService,
    BxLeadBatchService,
    BxProductRowBatchService,
    BxProductRowService,
    BxCategoryService,
    BxCategoryBatchService,
    BxStatusService,
    BxStatusBatchService,
    BxItemService,
    BxItemBatchService,
    BxTimelineService,
    BxTimelineBatchService,
    BxRequisiteService,
    BxRequisiteBatchService,
    BxRequisitePresetService,
    BxRequisitePresetBatchService,
} from './domain/crm/';

import { BxDealBatchService, BxCompanyBatchService } from './domain/crm/';
import { ServiceClonerFactory } from './domain/service-clone.factory';
import { BxProductBatchService, BxProductService } from './domain/catalog';
import { BxListBatchService, BxListService } from './domain/list';
import {
    BxUserFieldConfigBatchService,
    BxUserFieldConfigService,
} from './domain/userfieldconfig';
import { BxSmartTypeService } from './domain/crm/smart-type/services/bx-smart-type.service';
import { BxRpaItemService } from './domain/rpa/item/services/bx-rpa-item.service';
import { BxRpaItemBatchService } from './domain/rpa/item/services/bx-rpa-item.batch.service';
import { BxRpaTypeService } from './domain/rpa/type/services/bx-rpa-type.service';
import { BxRpaStageService } from './domain/rpa/stage/services/bx-rpa-stage.service';
import { BxFileService } from './domain/file/bx-file.service';
import { BxListItemBatchService, BxListItemService } from './domain/list-item';
import { BxRecentService } from './domain/chat/recent/services/bx-recent.service';
import { BxRecentBatchService } from './domain/chat/recent/services/bx-recent.batch.service';
import { BxMessageService } from './domain/chat/message/services/bx-message.service';
import { BxMessageBatchService } from './domain/chat/message/services/bx-message.batch.service';
import { BxTaskBatchService, BxTaskService } from './domain/tasks/task';
import {
    BxTaskUserFieldService,
    BxTaskUserFieldBatchService,
} from './domain/tasks/task-userfield';
import { BxChecklistItemService } from './domain/tasks/checklist-item/services/bx-checklist-item.service';
import { BxChecklistItemBatchService } from './domain/tasks/checklist-item/services/bx-checklist-item.batch.service';
import { ActivityService } from './domain/activity/services/bx-activity.service';
import { BxActivityBatchService } from './domain/activity/services/bx-activity.batch.service';
import { BxFileBatchService } from './domain/file/bx-file.batch.service';
import { BxUserService } from './domain/user/services/bx-user.service';
import { BxUserBatchService } from './domain/user/services/bx-user.batch.service';
import { BxDialogBatchService, BxDialogService } from './domain/chat/dialog';
import { BxDialogMessageBatchService } from './domain/chat/dialog-message/services/bx-dialog-message.batch.service';
import { BxDialogMessageService } from './domain/chat/dialog-message/services/bx-dialog-message.service';
import { BxImV2EventBatchService } from './domain/chat/im-v2-event/services/bx-im-v2-event.batch.service';
import { BxImV2EventService } from './domain/chat/im-v2-event/services/bx-im-v2-event.service';
import { BxActivityTodoBatchService } from './domain/crm/activity-todo/services/bx-activity-todo.batch.service';
import { BxActivityTodoService } from './domain/crm/activity-todo/services/bx-activity-todo.service';
import {
    BxDiskFileService,
    BxDiskFolderService,
    BxDiskStorageService,
} from './domain/disk';
import { BxImBotService } from './domain/imbot/bot/services/bx-imbot-bot.service';
import { BxImBotBatchService } from './domain/imbot/bot/services/bx-imbot-bot.batch.service';
import { BxImBotMessageService } from './domain/imbot/message/services/bx-imbot-message.service';
import { BxImBotMessageBatchService } from './domain/imbot/message/services/bx-imbot-message.batch.service';
import { BxImBotCommandService } from './domain/imbot/command/services/bx-imbot-command.service';
import { BxImBotCommandBatchService } from './domain/imbot/command/services/bx-imbot-command.batch.service';
import { BxImBotChatService } from './domain/imbot/chat/services/bx-imbot-chat.service';
import { BxImBotChatBatchService } from './domain/imbot/chat/services/bx-imbot-chat.batch.service';
import { BxImBotDialogService } from './domain/imbot/dialog/services/bx-imbot-dialog.service';
import { BxImBotDialogBatchService } from './domain/imbot/dialog/services/bx-imbot-dialog.batch.service';
import { BxImBotV2BotService } from './domain/imbot-v2/bot/services/bx-imbot-v2-bot.service';
import { BxImBotV2BotBatchService } from './domain/imbot-v2/bot/services/bx-imbot-v2-bot.batch.service';
import { BxImBotV2MessageService } from './domain/imbot-v2/message/services/bx-imbot-v2-message.service';
import { BxImBotV2MessageBatchService } from './domain/imbot-v2/message/services/bx-imbot-v2-message.batch.service';
import { BxImBotV2CommandService } from './domain/imbot-v2/command/services/bx-imbot-v2-command.service';
import { BxImBotV2CommandBatchService } from './domain/imbot-v2/command/services/bx-imbot-v2-command.batch.service';
import { BxImBotV2ChatService } from './domain/imbot-v2/chat/services/bx-imbot-v2-chat.service';
import { BxImBotV2ChatBatchService } from './domain/imbot-v2/chat/services/bx-imbot-v2-chat.batch.service';
import { BxImBotV2FileService } from './domain/imbot-v2/file/services/bx-imbot-v2-file.service';
import { BxImBotV2FileBatchService } from './domain/imbot-v2/file/services/bx-imbot-v2-file.batch.service';
import { BxImBotV2EventService } from './domain/imbot-v2/event/services/bx-imbot-v2-event.service';
import { BxImBotV2EventBatchService } from './domain/imbot-v2/event/services/bx-imbot-v2-event.batch.service';
import { BxImBotV2RevisionService } from './domain/imbot-v2/revision/services/bx-imbot-v2-revision.service';
import { BxImBotV2RevisionBatchService } from './domain/imbot-v2/revision/services/bx-imbot-v2-revision.batch.service';
import { BxImOpenlinesBotSessionService } from './domain/imopenlines/bot-session/services/bx-imopenlines-bot-session.service';
import { BxImOpenlinesBotSessionBatchService } from './domain/imopenlines/bot-session/services/bx-imopenlines-bot-session.batch.service';
import { BxSonetGroupService } from './domain/sonet-group/services/sonet-group.service';
import { BxSonetGroupBatchService } from './domain/sonet-group/services/sonet-group.batch.service';

// @Injectable()
export class BitrixService {
    public api: BitrixBaseApi;
    public deal: BxDealService;
    public lead: BxLeadService;
    public company: BxCompanyService;
    public productRow: BxProductRowService;
    public contact: BxContactService;
    public category: BxCategoryService;
    public status: BxStatusService;
    public item: BxItemService;
    public timeline: BxTimelineService;
    public requisite: BxRequisiteService;
    public requisitePreset: BxRequisitePresetService;
    public list: BxListService;
    public listItem: BxListItemService;
    public product: BxProductService;
    public userFieldConfig: BxUserFieldConfigService;
    public smartType: BxSmartTypeService;
    public rpaItem: BxRpaItemService;
    public rpaType: BxRpaTypeService;
    public rpaStage: BxRpaStageService;
    public file: BxFileService;
    public dialog: BxDialogService;
    public recent: BxRecentService;
    public message: BxMessageService;
    public dialogMessage: BxDialogMessageService;
    public imV2Event: BxImV2EventService;
    public task: BxTaskService;
    public taskUserField: BxTaskUserFieldService;
    public checklistItem: BxChecklistItemService;
    public activity: ActivityService;
    public activityTodo: BxActivityTodoService;
    public user: BxUserService;
    public disk: {
        file: BxDiskFileService;
        storage: BxDiskStorageService;
        folder: BxDiskFolderService;
    };
    public imBot: BxImBotService;
    public imBotMessage: BxImBotMessageService;
    public imBotCommand: BxImBotCommandService;
    public imBotChat: BxImBotChatService;
    public imBotDialog: BxImBotDialogService;
    public imBotV2Bot: BxImBotV2BotService;
    public imBotV2Message: BxImBotV2MessageService;
    public imBotV2Command: BxImBotV2CommandService;
    public imBotV2Chat: BxImBotV2ChatService;
    public imBotV2File: BxImBotV2FileService;
    public imBotV2Event: BxImBotV2EventService;
    public imBotV2Revision: BxImBotV2RevisionService;
    public imOpenlinesSession: BxImOpenlinesBotSessionService;
    public sonetGroup: BxSonetGroupService;

    public batch = {
        deal: null as unknown as BxDealBatchService,
        lead: null as unknown as BxLeadBatchService,
        company: null as unknown as BxCompanyBatchService,
        productRow: null as unknown as BxProductRowBatchService,
        contact: null as unknown as BxContactBatchService,
        category: null as unknown as BxCategoryBatchService,
        status: null as unknown as BxStatusBatchService,
        requisite: null as unknown as BxRequisiteBatchService,
        requisitePreset: null as unknown as BxRequisitePresetBatchService,
        item: null as unknown as BxItemBatchService,
        timeline: null as unknown as BxTimelineBatchService,
        list: null as unknown as BxListBatchService,
        listItem: null as unknown as BxListItemBatchService,
        product: null as unknown as BxProductBatchService,
        userFieldConfig: null as unknown as BxUserFieldConfigBatchService,
        rpaItem: null as unknown as BxRpaItemBatchService,
        recent: null as unknown as BxRecentBatchService,
        message: null as unknown as BxMessageBatchService,
        dialogMessage: null as unknown as BxDialogMessageBatchService,
        imV2Event: null as unknown as BxImV2EventBatchService,
        task: null as unknown as BxTaskBatchService,
        taskUserField: null as unknown as BxTaskUserFieldBatchService,
        checklistItem: null as unknown as BxChecklistItemBatchService,
        activity: null as unknown as BxActivityBatchService,
        activityTodo: null as unknown as BxActivityTodoBatchService,
        file: null as unknown as BxFileBatchService,
        user: null as unknown as BxUserBatchService,
        dialog: null as unknown as BxDialogBatchService,
        imBot: null as unknown as BxImBotBatchService,
        imBotMessage: null as unknown as BxImBotMessageBatchService,
        imBotCommand: null as unknown as BxImBotCommandBatchService,
        imBotChat: null as unknown as BxImBotChatBatchService,
        imBotDialog: null as unknown as BxImBotDialogBatchService,
        imBotV2Bot: null as unknown as BxImBotV2BotBatchService,
        imBotV2Message: null as unknown as BxImBotV2MessageBatchService,
        imBotV2Command: null as unknown as BxImBotV2CommandBatchService,
        imBotV2Chat: null as unknown as BxImBotV2ChatBatchService,
        imBotV2File: null as unknown as BxImBotV2FileBatchService,
        imBotV2Event: null as unknown as BxImBotV2EventBatchService,
        imBotV2Revision: null as unknown as BxImBotV2RevisionBatchService,
        imOpenlinesSession:
            null as unknown as BxImOpenlinesBotSessionBatchService,
        sonetGroup: null as unknown as BxSonetGroupBatchService,
    };
    constructor(
        private readonly bxApi: BitrixBaseApi,
        private readonly cloner: ServiceClonerFactory,
    ) {
        this.api = bxApi;
    }
    init(domain: string) {
        console.log('init BitrixService', domain);
        this.initDeal();
        this.initLead();
        this.initCompany();
        this.initProductRow();
        this.initContact();
        this.initCategory();
        this.initStatus();
        this.initItem();
        this.initTimeline();
        this.initRequisite();
        this.initRequisitePreset();
        this.initList();
        this.initListItem();
        this.initProduct();
        this.initUserFieldConfig();
        this.initSmartType();
        this.initRpaItem();
        this.initRpaType();
        this.initRpaStage();
        this.initFile();
        this.initRecent();
        this.initMessage();
        this.initDialogMessage();
        this.initImV2Event();
        this.initTask();
        this.initTaskUserField();
        this.initChecklistItem();
        this.initiActivities();
        this.initActivityTodo();
        this.initUser();
        this.initDialog();
        this.initDisk();
        this.initImBot();
        this.initImBotMessage();
        this.initImBotCommand();
        this.initImBotChat();
        this.initImBotDialog();
        this.initImBotV2Bot();
        this.initImBotV2Message();
        this.initImBotV2Command();
        this.initImBotV2Chat();
        this.initImBotV2File();
        this.initImBotV2Event();
        this.initImBotV2Revision();
        this.initImOpenlinesSession();
        this.initSonetGroup();
    }

    private initDeal() {
        this.deal = this.cloner.clone(BxDealService, this.api);
        this.batch.deal = this.cloner.clone(BxDealBatchService, this.api);
    }

    private initLead() {
        this.lead = this.cloner.clone(BxLeadService, this.api);
        this.batch.lead = this.cloner.clone(BxLeadBatchService, this.api);
    }

    private initCompany() {
        this.company = this.cloner.clone(BxCompanyService, this.api);
        this.batch.company = this.cloner.clone(BxCompanyBatchService, this.api);
    }
    private initProductRow() {
        this.productRow = this.cloner.clone(BxProductRowService, this.api);
        this.batch.productRow = this.cloner.clone(
            BxProductRowBatchService,
            this.api,
        );
    }
    private initContact() {
        this.contact = this.cloner.clone(BxContactService, this.api);
        this.batch.contact = this.cloner.clone(BxContactBatchService, this.api);
    }
    private initCategory() {
        this.category = this.cloner.clone(BxCategoryService, this.api);
        this.batch.category = this.cloner.clone(
            BxCategoryBatchService,
            this.api,
        );
    }
    private initStatus() {
        this.status = this.cloner.clone(BxStatusService, this.api);
        this.batch.status = this.cloner.clone(BxStatusBatchService, this.api);
    }
    private initItem() {
        this.item = this.cloner.clone(BxItemService, this.api);
        this.batch.item = this.cloner.clone(BxItemBatchService, this.api);
    }
    private initTimeline() {
        this.timeline = this.cloner.clone(BxTimelineService, this.api);
        this.batch.timeline = this.cloner.clone(
            BxTimelineBatchService,
            this.api,
        );
    }
    private initRequisite() {
        this.requisite = this.cloner.clone(BxRequisiteService, this.api);
        this.batch.requisite = this.cloner.clone(
            BxRequisiteBatchService,
            this.api,
        );
    }

    private initRequisitePreset() {
        this.requisitePreset = this.cloner.clone(
            BxRequisitePresetService,
            this.api,
        );
        this.batch.requisitePreset = this.cloner.clone(
            BxRequisitePresetBatchService,
            this.api,
        );
    }

    private initList() {
        this.list = this.cloner.clone(BxListService, this.api);
        this.batch.list = this.cloner.clone(BxListBatchService, this.api);
    }
    private initListItem() {
        this.listItem = this.cloner.clone(BxListItemService, this.api);
        this.batch.listItem = this.cloner.clone(
            BxListItemBatchService,
            this.api,
        );
    }
    private initProduct() {
        this.product = this.cloner.clone(BxProductService, this.api);
        this.batch.product = this.cloner.clone(BxProductBatchService, this.api);
    }
    private initUserFieldConfig() {
        this.userFieldConfig = this.cloner.clone(
            BxUserFieldConfigService,
            this.api,
        );
        this.batch.userFieldConfig = this.cloner.clone(
            BxUserFieldConfigBatchService,
            this.api,
        );
    }
    private initSmartType() {
        this.smartType = this.cloner.clone(BxSmartTypeService, this.api);
    }
    private initRpaItem() {
        this.rpaItem = this.cloner.clone(BxRpaItemService, this.api);
        this.batch.rpaItem = this.cloner.clone(BxRpaItemBatchService, this.api);
    }
    private initRpaType() {
        this.rpaType = this.cloner.clone(BxRpaTypeService, this.api);
    }
    private initRpaStage() {
        this.rpaStage = this.cloner.clone(BxRpaStageService, this.api);
    }
    private initFile() {
        this.file = this.cloner.clone(BxFileService, this.api);
        this.batch.file = this.cloner.clone(BxFileBatchService, this.api);
    }

    private initDialog() {
        this.dialog = this.cloner.clone(BxDialogService, this.api);
        this.batch.dialog = this.cloner.clone(BxDialogBatchService, this.api);
    }
    private initRecent() {
        this.recent = this.cloner.clone(BxRecentService, this.api);
        this.batch.recent = this.cloner.clone(BxRecentBatchService, this.api);
    }

    private initMessage() {
        this.message = this.cloner.clone(BxMessageService, this.api);
        this.batch.message = this.cloner.clone(BxMessageBatchService, this.api);
    }
    private initDialogMessage() {
        this.dialogMessage = this.cloner.clone(
            BxDialogMessageService,
            this.api,
        );
        this.batch.dialogMessage = this.cloner.clone(
            BxDialogMessageBatchService,
            this.api,
        );
    }
    private initImV2Event() {
        this.imV2Event = this.cloner.clone(BxImV2EventService, this.api);
        this.batch.imV2Event = this.cloner.clone(
            BxImV2EventBatchService,
            this.api,
        );
    }

    private initTask() {
        this.task = this.cloner.clone(BxTaskService, this.api);
        this.batch.task = this.cloner.clone(BxTaskBatchService, this.api);
    }
    private initTaskUserField() {
        this.taskUserField = this.cloner.clone(
            BxTaskUserFieldService,
            this.api,
        );
        this.batch.taskUserField = this.cloner.clone(
            BxTaskUserFieldBatchService,
            this.api,
        );
    }
    private initChecklistItem() {
        this.checklistItem = this.cloner.clone(
            BxChecklistItemService,
            this.api,
        );
        this.batch.checklistItem = this.cloner.clone(
            BxChecklistItemBatchService,
            this.api,
        );
    }
    private initiActivities() {
        this.activity = this.cloner.clone(ActivityService, this.api);
        this.batch.activity = this.cloner.clone(
            BxActivityBatchService,
            this.api,
        );
    }
    private initUser() {
        this.user = this.cloner.clone(BxUserService, this.api);
        this.batch.user = this.cloner.clone(BxUserBatchService, this.api);
    }
    private initActivityTodo() {
        this.activityTodo = this.cloner.clone(BxActivityTodoService, this.api);
        this.batch.activityTodo = this.cloner.clone(
            BxActivityTodoBatchService,
            this.api,
        );
    }
    private initDisk() {
        this.disk = {
            file: this.cloner.clone(BxDiskFileService, this.api),
            storage: this.cloner.clone(BxDiskStorageService, this.api),
            folder: this.cloner.clone(BxDiskFolderService, this.api),
        };
    }

    private initImBot() {
        this.imBot = this.cloner.clone(BxImBotService, this.api);
        this.batch.imBot = this.cloner.clone(BxImBotBatchService, this.api);
    }
    private initImBotMessage() {
        this.imBotMessage = this.cloner.clone(BxImBotMessageService, this.api);
        this.batch.imBotMessage = this.cloner.clone(
            BxImBotMessageBatchService,
            this.api,
        );
    }
    private initImBotCommand() {
        this.imBotCommand = this.cloner.clone(BxImBotCommandService, this.api);
        this.batch.imBotCommand = this.cloner.clone(
            BxImBotCommandBatchService,
            this.api,
        );
    }
    private initImBotChat() {
        this.imBotChat = this.cloner.clone(BxImBotChatService, this.api);
        this.batch.imBotChat = this.cloner.clone(
            BxImBotChatBatchService,
            this.api,
        );
    }
    private initImBotDialog() {
        this.imBotDialog = this.cloner.clone(BxImBotDialogService, this.api);
        this.batch.imBotDialog = this.cloner.clone(
            BxImBotDialogBatchService,
            this.api,
        );
    }
    private initImBotV2Bot() {
        this.imBotV2Bot = this.cloner.clone(BxImBotV2BotService, this.api);
        this.batch.imBotV2Bot = this.cloner.clone(
            BxImBotV2BotBatchService,
            this.api,
        );
    }
    private initImBotV2Message() {
        this.imBotV2Message = this.cloner.clone(
            BxImBotV2MessageService,
            this.api,
        );
        this.batch.imBotV2Message = this.cloner.clone(
            BxImBotV2MessageBatchService,
            this.api,
        );
    }
    private initImBotV2Command() {
        this.imBotV2Command = this.cloner.clone(
            BxImBotV2CommandService,
            this.api,
        );
        this.batch.imBotV2Command = this.cloner.clone(
            BxImBotV2CommandBatchService,
            this.api,
        );
    }
    private initImBotV2Chat() {
        this.imBotV2Chat = this.cloner.clone(BxImBotV2ChatService, this.api);
        this.batch.imBotV2Chat = this.cloner.clone(
            BxImBotV2ChatBatchService,
            this.api,
        );
    }
    private initImBotV2File() {
        this.imBotV2File = this.cloner.clone(BxImBotV2FileService, this.api);
        this.batch.imBotV2File = this.cloner.clone(
            BxImBotV2FileBatchService,
            this.api,
        );
    }
    private initImBotV2Event() {
        this.imBotV2Event = this.cloner.clone(BxImBotV2EventService, this.api);
        this.batch.imBotV2Event = this.cloner.clone(
            BxImBotV2EventBatchService,
            this.api,
        );
    }
    private initImBotV2Revision() {
        this.imBotV2Revision = this.cloner.clone(
            BxImBotV2RevisionService,
            this.api,
        );
        this.batch.imBotV2Revision = this.cloner.clone(
            BxImBotV2RevisionBatchService,
            this.api,
        );
    }
    private initImOpenlinesSession() {
        this.imOpenlinesSession = this.cloner.clone(
            BxImOpenlinesBotSessionService,
            this.api,
        );
        this.batch.imOpenlinesSession = this.cloner.clone(
            BxImOpenlinesBotSessionBatchService,
            this.api,
        );
    }

    private initSonetGroup() {
        this.sonetGroup = this.cloner.clone(BxSonetGroupService, this.api);
        this.batch.sonetGroup = this.cloner.clone(
            BxSonetGroupBatchService,
            this.api,
        );
    }
}
