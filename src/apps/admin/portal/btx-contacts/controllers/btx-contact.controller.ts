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
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BtxContactService } from '../services/btx-contact.service';
import { CreateBtxContactDto } from '../dto/create-btx-contact.dto';
import { UpdateBtxContactDto } from '../dto/update-btx-contact.dto';
import { BtxContactResponseDto } from '../dto/btx-contact-response.dto';
import { SuccessResponseDto, EResultCode } from '@/core';

@ApiTags('Admin Btx Contacts Management')
@Controller('admin/pbx/btx-contacts')
export class BtxContactController {
    constructor(private readonly contactService: BtxContactService) {}

    @ApiOperation({ summary: 'Create a new btx contact' })
    @ApiResponse({
        status: 201,
        description: 'Contact created successfully',
        type: BtxContactResponseDto,
    })
    @Post()
    async createContact(
        @Body() createContactDto: CreateBtxContactDto,
    ): Promise<BtxContactResponseDto> {
        const contact = await this.contactService.create(createContactDto);
        return contact;
    }

    @ApiOperation({ summary: 'Get contact by ID' })
    @ApiResponse({
        status: 200,
        description: 'Contact found',
        type: BtxContactResponseDto,
    })
    @Get(':id')
    async getContactById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<BtxContactResponseDto> {
        const contact = await this.contactService.findById(id);
        return contact;
    }

    @ApiOperation({ summary: 'Get all contacts' })
    @ApiResponse({
        status: 200,
        description: 'Contacts found',
        type: [BtxContactResponseDto],
    })
    @Get()
    async getAllContacts(
        @Query('portal_id') portalId?: string,
    ): Promise<BtxContactResponseDto[]> {
        let contacts;
        if (portalId) {
            contacts = await this.contactService.findByPortalId(
                Number(portalId),
            );
        } else {
            contacts = await this.contactService.findMany();
        }

        return contacts;
    }

    @ApiOperation({ summary: 'Update contact' })
    @ApiResponse({
        status: 200,
        description: 'Contact updated successfully',
        type: BtxContactResponseDto,
    })
    @Put(':id')
    async updateContact(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateContactDto: UpdateBtxContactDto,
    ): Promise<BtxContactResponseDto> {
        const contact = await this.contactService.update(id, updateContactDto);
        return contact;
    }

    @ApiOperation({ summary: 'Delete contact' })
    @ApiResponse({
        status: 200,
        description: 'Contact deleted successfully',
    })
    @Delete(':id')
    async deleteContact(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<boolean> {
        await this.contactService.delete(id);
        return true;
    }
}
