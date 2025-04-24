import { Injectable, Logger } from '@nestjs/common';
import { IPortal } from '../interfaces/portal.interface';

@Injectable()
export class PortalContextService {
    private readonly logger = new Logger(PortalContextService.name);
    // private static instance: PortalContextService;
    private portal: IPortal;

 
    constructor() {
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
} 