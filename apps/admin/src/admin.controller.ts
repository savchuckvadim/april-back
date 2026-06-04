import { Controller, Get } from '@nestjs/common';

@Controller()
export class AdminController {
    constructor() {}

    @Get()
    getHello(): string {
        return 'hellou ';
    }
}
