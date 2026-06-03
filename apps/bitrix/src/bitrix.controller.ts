import { Controller, Get } from '@nestjs/common';
import { BitrixService } from './bitrix.service';

@Controller()
export class BitrixController {
    constructor(private readonly bitrixService: BitrixService) {}

    @Get()
    getHello(): string {
        return this.bitrixService.getHello();
    }
}
