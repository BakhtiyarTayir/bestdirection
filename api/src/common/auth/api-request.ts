import type { Request } from "express";
import type { AppAbility } from "../policies/abilities";
import type { SessionUser } from "./session-user";

export interface ApiRequest extends Request {
  user?: SessionUser;
  ability?: AppAbility;
}
