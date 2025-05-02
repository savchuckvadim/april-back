import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PortalService } from '../portal.service';
import { PortalContextService } from '../services/portal-context.service';

@Injectable()
export class PortalContextMiddleware implements NestMiddleware {
    private readonly logger = new Logger(PortalContextMiddleware.name);

    constructor(
        private readonly portalService: PortalService,
        private readonly portalContext: PortalContextService
    ) {
        this.logger.log('PortalContextMiddleware initialized');
    }

    async use(req: Request, res: Response, next: NextFunction) {
        this.logger.log('Request received PortalContextMiddleware', {
            path: req.path,
            method: req.method,
            // body: req.body,
            query: req.query
        });
        this.logger.log(`PortalContextMiddleware baseUrl: ${req.baseUrl}`);
        this.logger.log(`PortalContextMiddleware path: ${req.path}`);
        const domain = req.body?.auth?.domain || req.query?.domain || req.body?.domain;
        this.logger.log(`PortalContextMiddleware Extracted domain: ${domain}`);
        
        if (domain) {
            try {
                const portal = await this.portalService.getPortalByDomain(domain);
                // this.logger.log(`Portal found: ${portal.domain}`);
                this.portalContext.setPortal(portal);
            } catch (error) {
                this.logger.error('Error:', error);
            }
        } else {
            this.logger.log('No domain found in request');
        }
        next();
    }
} 