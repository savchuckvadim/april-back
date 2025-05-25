import { Injectable } from '@nestjs/common';
import { GetCategoryListDto, GetCategoryWithStagesDto, GetStagesDto } from './dto/get-category.dto';
import { BitrixService } from 'src/modules/bitrix/bitrix.service';
import { PortalService } from 'src/modules/portal/portal.service';



@Injectable()
export class CategoryService {

  constructor(
    private readonly bitrix: BitrixService,
    private readonly portalService: PortalService,

  ) { }
  async init(domain: string) {
    const portal = await this.portalService.getPortalByDomain(domain);
    this.bitrix.init(portal);
  }

  async get(dto: GetCategoryWithStagesDto) {
    await this.init(dto.domain)
    const categoryResponse = await this.bitrix.category.get(dto.categoryId, dto.entityTypeId);
    const category = categoryResponse.result.category
    const stages = await this.bitrix.status.getList({ CATEGORY_ID: dto.categoryId, ENTITY_ID: `DEAL_STAGE_${dto.categoryId}` });

    return {
      category,
      stages: stages.result
    };
  }
  async findAll(dto: GetCategoryListDto) {
    await this.init(dto.domain)
    return this.bitrix.category.getList(dto.entityTypeId);
  }



  async findStages(dto: GetStagesDto) {
    await this.init(dto.domain)
    return this.bitrix.status.getList({ CATEGORY_ID: dto.categoryId });
  }



}
