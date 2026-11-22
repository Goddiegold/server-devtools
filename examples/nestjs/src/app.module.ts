import { Module } from "@nestjs/common";

import { AppService } from "./app.service";
import { ExternalController } from "./external.controller";
import { FetchTestService } from "./fetch-test.service";
import { UsersController } from "./users.controller";

@Module({
  controllers: [UsersController, ExternalController],
  providers: [AppService, FetchTestService],
})
export class AppModule {}