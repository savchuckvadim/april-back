import { Injectable } from '@nestjs/common';
import { BitrixService } from './bitrix.service';
import { BitrixApiFactoryService } from './core/queue/bitrix-api.factory.service';

import { IPortal } from '../portal/interfaces/portal.interface';
import { ServiceClonerFactory } from './domain/service-clone.factory';

@Injectable()
export class BitrixServiceFactory {
  constructor(
    private readonly bitrixApiFactoryService: BitrixApiFactoryService,
    private readonly cloner: ServiceClonerFactory,
   
  ) {}

  create(portal: IPortal): BitrixService {
    const instance = new BitrixService(
      this.bitrixApiFactoryService,
      this.cloner,
  
    );

    instance.init(portal);
    return instance;
  }
}
