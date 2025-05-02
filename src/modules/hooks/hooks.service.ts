
import { Injectable, Logger } from '@nestjs/common';
import { BitrixActivityCreateService } from '../bitrix/domain/activity/services/activity-create.service';

@Injectable()
export class HooksService {
  constructor(
    private readonly bitrixActivityCreateService: BitrixActivityCreateService
  ) { 
    Logger.log('HooksService constructor ✅')
    Logger.log(this.bitrixActivityCreateService)
  }
  create(domain: string, rawActivities: Record<string, any>) {
    this.bitrixActivityCreateService.createActivities(domain, rawActivities)
    return 'This action adds a new hook';
  }

  findAll() {
    return `This action returns all hooks`;
  }

  findOne(id: number) {
    return `This action returns a #${id} hook`;
  }

  update(id: number,) {
    return `This action updates a #${id} hook`;
  }

  remove(id: number) {
    return `This action removes a #${id} hook`;
  }
}
