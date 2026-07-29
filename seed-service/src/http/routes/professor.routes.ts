import type { FastifyInstance, FastifyRequest } from "fastify";
import type { App } from "../../composition.js";
import { asTaxonId } from "../../core/domain/ids.js";
import { RateLimitedError } from "./vision.routes.js";
import { requireAuthContext, type AuthenticateHandler } from "../auth.js";

interface AskBody {
  question: string;
  context_species_id?: string | null;
}

const askSchema = {
  type: "object",
  additionalProperties: false,
  required: ["question"],
  properties: {
    question: { type: "string", minLength: 2, maxLength: 200 },
    context_species_id: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] },
  },
} as const;

/** 계정별 1분 30회. 질문 원문은 키나 로그에 저장하지 않는다. */
class AccountRateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();

  consume(request: FastifyRequest): void {
    const userId = requireAuthContext(request).userId as string;
    const now = Date.now();
    const current = this.windows.get(userId);
    if (!current || now - current.startedAt >= 60_000) {
      this.windows.set(userId, { startedAt: now, count: 1 });
      if (this.windows.size > 10_000) {
        for (const [key, window] of this.windows) {
          if (now - window.startedAt >= 60_000) this.windows.delete(key);
        }
      }
      return;
    }
    current.count += 1;
    if (current.count > 30) throw new RateLimitedError();
  }
}

export function registerProfessorRoutes(
  server: FastifyInstance,
  app: App,
  authenticate: AuthenticateHandler,
): void {
  const limiter = new AccountRateLimiter();

  server.post<{ Body: AskBody }>(
    "/professor/ask",
    { preHandler: authenticate, schema: { body: askSchema } },
    async (request) => {
      limiter.consume(request);
      const ctx = requireAuthContext(request);
      return app.professor.ask({
        userId: ctx.userId,
        question: request.body.question,
        contextSpeciesId: request.body.context_species_id
          ? asTaxonId(request.body.context_species_id)
          : undefined,
      });
    },
  );

  server.get("/professor/suggestions", { preHandler: authenticate }, async (request) => {
    const ctx = requireAuthContext(request);
    return app.professor.suggestions(ctx.userId);
  });

  server.get("/professor/greeting", { preHandler: authenticate }, async (request) => {
    const ctx = requireAuthContext(request);
    return app.professor.greeting(ctx.userId);
  });
}
