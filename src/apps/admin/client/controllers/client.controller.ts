import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    ParseIntPipe,
    HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ClientService } from '@/modules/client/services/client.service';
import { CreateClientDto } from '@/modules/client/dto/create-client.dto';
import { UpdateClientDto } from '@/modules/client/dto/update-client.dto';
import { ClientResponseDto, ClientWithRelationsResponseDto } from '@/modules/client/dto/client-response.dto';
import { SuccessResponseDto, EResultCode, ErrorResponseDto } from '@/core';

@ApiTags('Admin Client Management')
@Controller('admin/clients')
export class AdminClientController {
    constructor(private readonly clientService: ClientService) { }

    @ApiOperation({ summary: 'Create a new client' })
    @ApiResponse({
        status: 201,
        description: 'Client created successfully',
        type: ClientResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Bad request - validation error or email already exists',
        type: ErrorResponseDto,
    })
    @Post()
    async createClient(@Body() createClientDto: CreateClientDto): Promise<ClientResponseDto> {
        const client = await this.clientService.create(createClientDto);
        return client;
    }

    @ApiOperation({ summary: 'Get client by ID' })
    @ApiResponse({
        status: 200,
        description: 'Client found',
        type: ClientWithRelationsResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Client not found',
        type: ErrorResponseDto,
    })
    @Get(':id')
    async getClientById(@Param('id', ParseIntPipe) id: number): Promise<ClientWithRelationsResponseDto> {
        const client = await this.clientService.findByIdWithRelations(id);
        return client;
    }

    @ApiOperation({ summary: 'Get all clients' })
    @ApiResponse({
        status: 200,
        description: 'Clients found',
        type: [ClientResponseDto],
    })
    @Get()
    async getAllClients(
        @Query('status') status?: string,
        @Query('is_active') isActive?: string,
    ): Promise<ClientResponseDto[]> {
        let clients;
        if (status) {
            clients = await this.clientService.findByStatus(status);
        } else if (isActive !== undefined) {
            clients = await this.clientService.findByIsActive(isActive === 'true');
        } else {
            clients = await this.clientService.findMany();
        }

        return clients;
    }

    @ApiOperation({ summary: 'Get client by email' })
    @ApiResponse({
        status: 200,
        description: 'Client found',
        type: ClientResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Client not found',
    })
    @Get('email/:email')
    async getClientByEmail(@Param('email') email: string): Promise<SuccessResponseDto> {
        const client = await this.clientService.findByEmail(email);
        if (!client) {
            return {
                resultCode: EResultCode.ERROR,
                data: null,
            };
        }
        return {
            resultCode: EResultCode.SUCCESS,
            data: client,
        };
    }

    @ApiOperation({ summary: 'Update client' })
    @ApiResponse({
        status: 200,
        description: 'Client updated successfully',
        type: ClientResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Client not found',
        type: ErrorResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Bad request - validation error or email already exists',
    })
    @Put(':id')
    async updateClient(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateClientDto: UpdateClientDto,
    ): Promise<ClientResponseDto> {
        const client = await this.clientService.update(id, updateClientDto);
        return client;
    }

    @ApiOperation({ summary: 'Delete client' })
    @ApiResponse({
        status: 200,
        description: 'Client deleted successfully',
        type: Boolean,
    })
    @ApiResponse({
        status: 404,
        description: 'Client not found',
    })
    @Delete(':id')
    async deleteClient(@Param('id', ParseIntPipe) id: number): Promise<boolean> {
        await this.clientService.delete(id);
        return true;
    }
}

