import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
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

  // Revoke = reversible soft-disable: stamps `revokedAt` so the key stops authenticating but
  // its row (and audit trail) is retained. POST, not DELETE — it mutates, it doesn't remove.
  @Post(':id/revoke')
  @JwtOnly()
  @HttpCode(200)
  revoke(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.apiKeys.revoke(id, user.id);
  }

  // Hard delete: the row is permanently removed (its unique hashedKey is freed). Irreversible.
  @Delete(':id')
  @JwtOnly()
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.apiKeys.remove(id, user.id);
  }
}
