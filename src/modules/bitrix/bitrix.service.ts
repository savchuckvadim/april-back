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
import { ServiceClonerFactory } from './domain/service-clone.factory';

// @Injectable()
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
        private readonly cloner: ServiceClonerFactory,
       
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
        this.deal = this.cloner.clone(BxDealService, this.api);
        this.batch.deal = this.cloner.clone(BxDealBatchService, this.api);
    }

    private initCompany() {
        this.company = this.cloner.clone(BxCompanyService, this.api);
        this.batch.company = this.cloner.clone(BxCompanyBatchService, this.api);
    }
    private initProductRow() {
        this.productRow = this.cloner.clone(BxProductRowService, this.api);
        this.batch.productRow = this.cloner.clone(BxProductRowBatchService, this.api);
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
        this.batch.timeline = this.cloner.clone(BxTimelineBatchService, this.api);
    }
}
