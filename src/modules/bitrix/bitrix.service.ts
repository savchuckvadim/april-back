import { IPortal } from '../portal/interfaces/portal.interface';
import { BitrixBaseApi } from './core/base/bitrix-base-api';
// import { BitrixApiFactoryService } from './core/queue/bitrix-api.factory.service';
import {
    BxCompanyService,
    BxContactBatchService,
    BxContactService,
    BxDealService,
    BxProductRowBatchService,
    BxProductRowService,
    BxCategoryService,
    BxStatusService,
    BxItemService,
    BxItemBatchService,
    BxTimelineService,
    BxTimelineBatchService,
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
import { BxFileService } from './domain/file/bx-file.service';
import { BxListItemService } from './domain/list-item';
import { BxRecentService } from './domain/chat/recent/services/bx-recent.service';
import { BxRecentBatchService } from './domain/chat/recent/services/bx-recent.batch.service';
import { BxMessageService } from './domain/chat/message/services/bx-message.service';
import { BxMessageBatchService } from './domain/chat/message/services/bx-message.batch.service';
import { BxTaskBatchService, BxTaskService } from './domain/tasks/task';
import { ActivityService } from './domain/activity/services/bx-activity.service';
import { BxActivityBatchService } from './domain/activity/services/bx-activity.batch.service';
import { BxFileBatchService } from './domain/file/bx-file.batch.service';


// @Injectable()
export class BitrixService {
    public api: BitrixBaseApi;
    public deal: BxDealService;
    public company: BxCompanyService;
    public productRow: BxProductRowService;
    public contact: BxContactService;
    public category: BxCategoryService;
    public status: BxStatusService;
    public item: BxItemService;
    public timeline: BxTimelineService;
    public list: BxListService;
    public listItem: BxListItemService;
    public product: BxProductService;
    public userFieldConfig: BxUserFieldConfigService;
    public smartType: BxSmartTypeService;
    public rpaItem: BxRpaItemService;
    public file: BxFileService;
    public recent: BxRecentService;
    public message: BxMessageService;
    public task: BxTaskService;
    public activity: ActivityService

    public batch = {
        deal: null as unknown as BxDealBatchService,
        company: null as unknown as BxCompanyBatchService,
        productRow: null as unknown as BxProductRowBatchService,
        contact: null as unknown as BxContactBatchService,
        item: null as unknown as BxItemBatchService,
        timeline: null as unknown as BxTimelineBatchService,
        list: null as unknown as BxListBatchService,
        product: null as unknown as BxProductBatchService,
        userFieldConfig: null as unknown as BxUserFieldConfigBatchService,
        rpaItem: null as unknown as BxRpaItemBatchService,
        recent: null as unknown as BxRecentBatchService,
        message: null as unknown as BxMessageBatchService,
        task: null as unknown as BxTaskBatchService,
        activity: null as unknown as BxActivityBatchService,
        file: null as unknown as BxFileBatchService
    };
    constructor(
        private readonly bxApi: BitrixBaseApi,
        private readonly cloner: ServiceClonerFactory,
    ) {
        this.api = bxApi;
    }
    init(portal: IPortal) {
        // this.api = this.bitrixApiFactoryService.create(portal);
        this.initDeal();
        this.initCompany();
        this.initProductRow();
        this.initContact();
        this.initCategory();
        this.initStatus();
        this.initItem();
        this.initTimeline();
        this.initList();
        this.initListItem();
        this.initProduct();
        this.initUserFieldConfig();
        this.initSmartType();
        this.initRpaItem();
        this.initFile();
        this.initRecent();
        this.initMessage();
        this.initTask();
        this.initiActivities();
    }

    private initDeal() {
        this.deal = this.cloner.clone(BxDealService, this.api);
        this.batch.deal = this.cloner.clone(BxDealBatchService, this.api);
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
    }
    private initStatus() {
        this.status = this.cloner.clone(BxStatusService, this.api);
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
    private initList() {
        this.list = this.cloner.clone(BxListService, this.api);
        this.batch.list = this.cloner.clone(BxListBatchService, this.api);
    }
    private initListItem() {
        this.listItem = this.cloner.clone(BxListItemService, this.api);
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
    private initFile() {
        this.file = this.cloner.clone(BxFileService, this.api);
        this.batch.file = this.cloner.clone(BxFileBatchService, this.api);
    }

    private initRecent() {
        this.recent = this.cloner.clone(BxRecentService, this.api);
        this.batch.recent = this.cloner.clone(BxRecentBatchService, this.api);
    }

    private initMessage() {
        this.message = this.cloner.clone(BxMessageService, this.api);
        this.batch.message = this.cloner.clone(BxMessageBatchService, this.api);
    }

    private initTask() {
        this.task = this.cloner.clone(BxTaskService, this.api);
        this.batch.task = this.cloner.clone(BxTaskBatchService, this.api);
    }
    private initiActivities() {
        this.activity = this.cloner.clone(ActivityService, this.api);
        this.batch.activity = this.cloner.clone(BxActivityBatchService, this.api);
    }
}
