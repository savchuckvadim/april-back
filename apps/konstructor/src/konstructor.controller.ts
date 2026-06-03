import { Controller, Get } from '@nestjs/common';
import { KonstructorService } from './konstructor.service';

@Controller()
export class KonstructorController {
    constructor(private readonly konstructorService: KonstructorService) {}

    @Get()
    getHello(): string {
        return this.konstructorService.getHello();
    }
}
