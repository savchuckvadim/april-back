import { Body, Controller, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { OrkOnActCreateUseCase } from "./use-cases/ork-act-create.use-case";
import { BxWebHookDto, OrkQueryDto } from "./ork-act.dto";
import { OrkOnActCloseUseCase } from "./use-cases/ork-act-close.use-case";


@ApiTags('Ork Act')
@Controller('ork-act')
export class OrkActController {
    constructor(
        private readonly createCase: OrkOnActCreateUseCase,
        private readonly closeCase: OrkOnActCloseUseCase

    ) { }

    @ApiOperation({ summary: 'Create act' })
    @ApiResponse({ status: 200, description: 'Act created successfully' })
    @ApiResponse({ status: 400, description: 'Bad request' })
    @Post('create')
    async getAct(@Body() body: BxWebHookDto, @Query() query: OrkQueryDto) {

        return await this.createCase.createAct({
            ...query,
            ...body.auth
        });
    }


    @ApiOperation({ summary: 'Close act' })
    @ApiResponse({ status: 200, description: 'Act closed successfully' })
    @ApiResponse({ status: 400, description: 'Bad request' })
    @Post('close')
    async closeAct(@Body() body: BxWebHookDto, @Query() query: OrkQueryDto) {
        return await this.closeCase.closeAct({
            ...query,
            ...body.auth
        });
    }
}
