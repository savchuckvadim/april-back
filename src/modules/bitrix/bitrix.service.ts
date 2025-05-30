import { Injectable } from '@nestjs/common';

import { BitrixBaseApi } from './core/base/bitrix-base-api';
import { BitrixApiFactoryService } from './core/queue/bitrix-api.factory.service';
import {
    BxCompanyService, BxContactBatchService, BxContactService,
    BxDealService, BxProductRowBatchService, BxProductRowService,
    BxCategoryService, BxStatusService, BxItemService, BxItemBatchService,
    BxTimelineService, BxTimelineBatchService
} from './domain/crm/';
import { IPortal } from '../portal/interfaces/portal.interface';
import { BxDealBatchService, BxCompanyBatchService } from './domain/crm/';

@Injectable()
export class BitrixService {
    public api: BitrixBaseApi
    public deal: BxDealService
    public company: BxCompanyService
    public productRow: BxProductRowService
    public contact: BxContactService
    public category: BxCategoryService
    public status: BxStatusService
    public item: BxItemService
    public timeline: BxTimelineService


    public batch = {
        deal: null as unknown as BxDealBatchService,
        company: null as unknown as BxCompanyBatchService,
        productRow: null as unknown as BxProductRowBatchService,
        contact: null as unknown as BxContactBatchService,
        item: null as unknown as BxItemBatchService,
        timeline: null as unknown as BxTimelineBatchService
    }
    constructor(
        private readonly bitrixApiFactoryService: BitrixApiFactoryService,
        private readonly bitrixDealService: BxDealService,
        private readonly bitrixDealBatchService: BxDealBatchService,
        private readonly bitrixCompanyService: BxCompanyService,
        private readonly bitrixCompanyBatchService: BxCompanyBatchService,
        private readonly bitrixProductRowService: BxProductRowService,
        private readonly bitrixProductRowBatchService: BxProductRowBatchService,
        private readonly bitrixContactService: BxContactService,
        private readonly bitrixContactBatchService: BxContactBatchService,
        private readonly bitrixCategoryService: BxCategoryService,
        private readonly bitrixStatusService: BxStatusService,
        private readonly bitrixItemService: BxItemService,
        private readonly bitrixItemBatchService: BxItemBatchService,
        private readonly bitrixTimelineService: BxTimelineService,
        private readonly bitrixTimelineBatchService: BxTimelineBatchService
    ) { }
    init(portal: IPortal) {
        this.api = this.bitrixApiFactoryService.create(portal);
        this.initDeal()
        this.initCompany()
        this.initProductRow()
        this.initContact()
        this.initCategory()
        this.initStatus()
        this.initItem()
        this.initTimeline()
    }

    private initDeal() {
        this.deal = this.bitrixDealService
        this.deal.init(this.api)
        this.batch.deal = this.bitrixDealBatchService
        this.batch.deal.init(this.api)
    }

    private initCompany() {
        this.company = this.bitrixCompanyService
        this.company.init(this.api)
        this.batch.company = this.bitrixCompanyBatchService
        this.batch.company.init(this.api)
    }
    private initProductRow() {
        this.productRow = this.bitrixProductRowService
        this.productRow.init(this.api)
        this.batch.productRow = this.bitrixProductRowBatchService
        this.batch.productRow.init(this.api)
    }
    private initContact() {
        this.contact = this.bitrixContactService
        this.contact.init(this.api)
        this.batch.contact = this.bitrixContactBatchService
        this.batch.contact.init(this.api)
    }
    private initCategory() {
        this.category = this.bitrixCategoryService
        this.category.init(this.api)
    }
    private initStatus() {
        this.status = this.bitrixStatusService
        this.status.init(this.api)
    }
    private initItem() {
        this.item = this.bitrixItemService
        this.item.init(this.api)
        this.batch.item = this.bitrixItemBatchService
        this.batch.item.init(this.api)
    }
    private initTimeline() {
        this.timeline = this.bitrixTimelineService
        this.timeline.init(this.api)
        this.batch.timeline = this.bitrixTimelineBatchService
        this.batch.timeline.init(this.api)
    }
}
