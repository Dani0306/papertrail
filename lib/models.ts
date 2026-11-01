// The only place model IDs live. Overridable from the environment so a
// comparison run can swap models without code changes.

export const DEFAULT_PRIMARY_MODEL = "gpt-6-luna";
export const DEFAULT_ESCALATION_MODEL = "gpt-6.1-sol";

export function primaryModel(): string {
  return process.env.PAPERTRAIL_PRIMARY_MODEL || DEFAULT_PRIMARY_MODEL;
}

export function escalationModel(): string {
  return process.env.PAPERTRAIL_ESCALATION_MODEL || DEFAULT_ESCALATION_MODEL;
}
