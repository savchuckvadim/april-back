import { Injectable, Logger, Scope } from '@nestjs/common';
import { IPortal } from '../interfaces/portal.interface';
import { PortalModelFactory } from '../factory/potal-model.factory';
import { PortalModel } from './portal.model';

@Injectable({ scope: Scope.REQUEST })
export class PortalContextService {
    private readonly logger = new Logger(PortalContextService.name);
    // private static instance: PortalContextService;
    private portal: IPortal;

 
    constructor(
        private readonly modelFactory: PortalModelFactory,
    ) {
       
        this.logger.log('PortalContextService initialized');
      }
      
    setPortal(portal: IPortal) {
        this.logger.log(`Setting portal context for domain: ${portal.domain}`);
        this.portal = portal;
    }

    getPortal(): IPortal {
        this.logger.log('Getting portal');
        if (!this.portal) {
            this.logger.error('Portal not found');
            throw new Error('Portal not found');
        }
        this.logger.log(`Portal found: ${this.portal.domain}`);
        return this.portal;
    }

    getModel(): PortalModel {
        const portal = this.getPortal();
        return this.modelFactory.create(portal);
      }
} 