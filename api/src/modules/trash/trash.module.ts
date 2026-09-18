import { Module } from "@nestjs/common";
import { TrashService } from "./trash.service";

@Module({
  providers: [TrashService],
  exports: [TrashService],
})
export class TrashModule {}
