import pino from "pino";

import { config } from "./config.js";

/**
 * Structured JSON logger. Message bodies, tokens and other sensitive values are
 * never logged - only ids, lengths and counters.
 */
export const logger = pino({
  name: config.serviceName,
  level: config.logLevel,
  base: { service: config.serviceName },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["x-service-token"]',
      "token",
      "*.token",
      "password",
      "*.password",
      "text",
      "*.text",
    ],
    remove: true,
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
});

export function childLogger(bindings) {
  return logger.child(bindings);
}