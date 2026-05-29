import { Body, Controller, Post } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { PresignDto } from './dto';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('presign')
  presign(@Body() dto: PresignDto) {
    return this.uploads.presign(dto);
  }
}
