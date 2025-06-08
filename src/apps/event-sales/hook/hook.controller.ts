import { Body, Controller, Post, Query, Req } from "@nestjs/common";
import { ColdCallUseCase } from "./use-cases/cold-call.use-case";
import { ColdCallBodyDto, ColdCallQueryDto } from "./dto/cold.dto";
import { plainToInstance } from "class-transformer";

@Controller('event-sales/hook')
export class HookController {
    constructor(private readonly coldCallUseCase: ColdCallUseCase) { }

    @Post('cold-call')
    async coldCall(@Req() req: Request, @Query() dto: ColdCallQueryDto) {
        const body = plainToInstance(ColdCallBodyDto, req.body)
        const domain = body.auth.domain
        return this.coldCallUseCase.flow(dto, domain);
    }       
}