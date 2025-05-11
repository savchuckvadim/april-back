import { Controller } from '@nestjs/common';
import { KonstructorService } from './konstructor.service';

@Controller('konstructor')
export class KonstructorController {
  constructor(private readonly konstructorService: KonstructorService) {}
}
