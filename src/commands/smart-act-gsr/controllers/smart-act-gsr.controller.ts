import { Controller, Get, Injectable } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SmartActGsrService } from '../services/smart/smart-act-gsr.service';

@Injectable()
@ApiTags('Commands Smart Act Gsr')
@Controller('commands/smart-act-gsr')
export class SmartActGsrController {
    constructor(private readonly smartActGsrService: SmartActGsrService) { }

    @Get()
    @ApiOperation({ summary: 'Get smart act gsr' })
    @ApiResponse({
        status: 200,
        description: 'Returns smart act gsr',
    })
    async getSmartActGsr() {
        return await this.smartActGsrService.getSmartActGsr();
    }
}
