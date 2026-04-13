import {
    Controller,
    Get,
    Param,
    ParseEnumPipe,
    ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CounterNumberService } from '../services/counter-number.service';
import { CounterType } from '../lib/counter-type.enum';
import { DocumentNumberResponseDto } from '../dto/counter-response.dto';

@ApiTags('Document Counter — Numbers')
@Controller('document-counter')
export class CounterNumberController {
    constructor(private readonly numberService: CounterNumberService) {}

    @ApiOperation({
        summary: 'Increment counter and get next document number (thread-safe)',
    })
    @ApiResponse({
        status: 200,
        description: 'Next document number generated',
        type: DocumentNumberResponseDto,
    })
    @ApiParam({ name: 'type', enum: CounterType })
    @Get('next/:rqId/:type')
    async getNextNumber(
        @Param('rqId', ParseIntPipe) rqId: number,
        @Param('type', new ParseEnumPipe(CounterType)) type: CounterType,
    ) {
        const number = await this.numberService.getNextNumber(rqId, type);
        return { number };
    }

    @ApiOperation({
        summary: 'Peek current counter value without incrementing',
    })
    @ApiResponse({
        status: 200,
        description: 'Current document number',
        type: DocumentNumberResponseDto,
    })
    @ApiParam({ name: 'type', enum: CounterType })
    @Get('peek/:rqId/:type')
    async peekCurrentNumber(
        @Param('rqId', ParseIntPipe) rqId: number,
        @Param('type', new ParseEnumPipe(CounterType)) type: CounterType,
    ) {
        const number = await this.numberService.peekCurrentNumber(rqId, type);
        return { number };
    }
}
