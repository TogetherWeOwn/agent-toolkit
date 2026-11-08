import { text } from "../../../packages/core/src/schema.js";

export const downloadBucketName = text(60, /^[a-z0-9_-]+$/);
export const downloadObjectKey = {
  parse(raw: unknown): string {
    const value = text(80, /^[A-Za-z0-9][A-Za-z0-9_./-]*$/).parse(raw);
    if (value.split("/").some(part => part === "" || part === "." || part === "..")) throw Error("INVALID_ARGUMENTS");
    return value;
  },
};
