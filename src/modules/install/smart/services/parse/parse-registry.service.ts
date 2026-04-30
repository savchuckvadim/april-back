import { PbxGroupDefinition, PbxRegistryService } from '@/modules/pbx-registry';
import { SmartGroupEnum, SmartNameEnum } from '../../dto/install-smart.dto';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class ParseSmartRegistryService {
    constructor(private readonly registry: PbxRegistryService) {}

    getParsedData(
        smartName: SmartNameEnum,
        group: SmartGroupEnum,
    ): PbxGroupDefinition {
        console.log('getParsedData', smartName, group);
        const data = this.registry.getAllPbxTemplateData();
        const filtredData = data.find(item => item.group === (group as string));
        if (!filtredData) {
            throw new NotFoundException('Group not found');
        }
        const resultData: PbxGroupDefinition = {
            ...filtredData,
            fields: filtredData.fields.filter(item =>
                item.smarts?.includes(smartName.toString()),
            ),
        };
        return resultData;
    }
}
