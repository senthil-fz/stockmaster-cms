import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { JwtOnly } from '../common/decorators/scopes.decorator';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto';

// Every handler is @JwtOnly(): key management is a user-session-only concern. ScopeGuard
// rejects ApiKey principals here (403) so a draft-only key can never mint, list, or
// revoke keys — i.e. never escalate its own privileges.
@Controller('admin/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Post()
  @JwtOnly()
  create(@Body() dto: CreateApiKeyDto, @CurrentUser() user: AuthUser) {
    return this.apiKeys.create(dto, user.id);
  }

  @Get()
  @JwtOnly()
  list(@CurrentUser() user: AuthUser) {
    return this.apiKeys.list(user.id);
  }

  @Delete(':id')
  @JwtOnly()
  revoke(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.apiKeys.revoke(id, user.id);
  }
}
