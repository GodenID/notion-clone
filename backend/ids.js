import { randomUUID } from "node:crypto";

export function uid() {
  return randomUUID();
}

export function now() {
  return Date.now();
}