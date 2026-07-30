import assert from "node:assert/strict";
import test from "node:test";
import { PgCredentialRepo, PgUserRepo } from "./PostgresRepositories.js";

function transientError(code?: string): Error {
  const error = new Error("Connection terminated unexpectedly") as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

test("PgCredentialRepo.findByEmail: 끊어진 터널 소켓을 한 번 재시도한다", async () => {
  let calls = 0;
  const pool = {
    query: async () => {
      calls += 1;
      if (calls === 1) throw transientError("ECONNRESET");
      return {
        rows: [{
          user_id: "user-1",
          email: "kid@example.com",
          password_hash: "hash",
        }],
      };
    },
  };

  const repo = new PgCredentialRepo(pool as never);
  const result = await repo.findByEmail("kid@example.com");

  assert.equal(calls, 2);
  assert.equal(result?.userId, "user-1");
});

test("PgUserRepo.get: 코드 없는 connection terminated 오류도 한 번 재시도한다", async () => {
  let calls = 0;
  const pool = {
    query: async () => {
      calls += 1;
      if (calls === 1) throw transientError();
      return {
        rows: [{
          id: "user-1",
          plan: "free",
          location_storage_enabled: false,
          nickname: "탐험가",
          avatar: "fox",
          level: 1,
          xp: 0,
          created_at: new Date("2026-07-31T00:00:00.000Z"),
        }],
      };
    },
  };

  const repo = new PgUserRepo(pool as never);
  const result = await repo.get("user-1" as never);

  assert.equal(calls, 2);
  assert.equal(result?.nickname, "탐험가");
});

test("PgCredentialRepo.findByEmail: 비일시적 DB 오류는 재시도하지 않는다", async () => {
  let calls = 0;
  const pool = {
    query: async () => {
      calls += 1;
      const error = new Error("relation does not exist") as NodeJS.ErrnoException;
      error.code = "42P01";
      throw error;
    },
  };

  const repo = new PgCredentialRepo(pool as never);
  await assert.rejects(() => repo.findByEmail("kid@example.com"), /relation does not exist/);
  assert.equal(calls, 1);
});
