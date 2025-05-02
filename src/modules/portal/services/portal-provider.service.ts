import { Injectable, Logger, Scope } from "@nestjs/common";
import { PortalService } from "../portal.service";
import { IPortal } from "../interfaces/portal.interface";
import { PortalModelFactory } from "../factory/potal-model.factory";
import { PortalModel } from "./portal.model";
import { PortalContextService } from "./portal-context.service";

@Injectable()
export class PortalProviderService {
  constructor(
    private readonly portalService: PortalService,

    private readonly modelFactory: PortalModelFactory,
    private readonly portalContext: PortalContextService, // scope: REQUEST
  ) { 
    // Logger.log(this)
  }

  async getPortalFromRequest(): Promise<IPortal> {
    if (!this.portalContext) throw new Error('Request context not available');
    return this.portalContext.getPortal();
  }
  async getPortalByDomain(domain: string): Promise<IPortal> {
    Logger.log('getPortalByDomain: ' + domain);
    return this.portalService.getPortalByDomain(domain);
  }

  async getModelFromRequest(): Promise<PortalModel> {
    const portal = await this.getPortalFromRequest();
    return this.modelFactory.create(portal);
  }

  async getModelByDomain(domain: string): Promise<PortalModel> {
    Logger.log('getModelByDomain: ' + domain);
    const portal = await this.getPortalByDomain(domain);
    Logger.log('getModelByDomain: ' + portal?.id);
    return this.modelFactory.create(portal);
  }
}
