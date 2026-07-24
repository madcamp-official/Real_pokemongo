/**
 * 인가(Authorization) 레이어 (체크리스트 §1.3 — IDOR 원천 차단).
 *
 * v1.2: 보호자·자녀 2단계 계정 모델을 단일 사용자 계정으로 통합하면서, 이 모듈도
 * "guardian owns child" 2단계 검증에서 "ctx가 실제 존재하는 본인 계정인가" 1단계 검증으로
 * 단순화됐다. 자원 접근 진입점은 여전히 AuthContext 를 요구하고, 여기서 존재/소유를
 * 검증한다 — "엔드포인트마다 기억해서 체크"가 아니라 **타입 수준에서 강제**(ctx 없이는
 * 호출 자체가 불가능)하는 목표는 그대로 유지한다.
 *
 * 이 모듈은 공유 코어에 속한다 — 어떤 버티컬(어린이/탐조/중장년)이든 동일하게 쓴다.
 */
import type { User, UserId } from "../domain/types.js";
import type { UserRepository } from "../repositories/ports.js";

/**
 * 인증된 주체. **반드시 인증 계층(JWT/세션 검증)이 발급**해야 하며,
 * 클라이언트가 보낸 userId 를 그대로 담아서는 절대 안 된다.
 * (테스트/데모에서는 직접 생성하지만, HTTP 계층에서는 토큰 검증 결과로만 만든다.)
 */
export interface AuthContext {
  readonly userId: UserId;
}

/**
 * 인가 실패. API 계층에서는 403 대신 **404 로 매핑할 것을 권장**한다 —
 * "남의 자원이 존재한다"는 사실 자체를 누설하지 않기 위해서다.
 * 같은 이유로, 자원이 아예 없을 때와 남의 것일 때 **구분되지 않는 동일한 에러**를 던진다.
 */
export class AuthorizationError extends Error {
  readonly code = "forbidden" as const;
  constructor() {
    super("요청한 자원을 찾을 수 없습니다.");
    this.name = "AuthorizationError";
  }
}

export class Authorizer {
  constructor(private readonly users: UserRepository) {}

  /**
   * ctx 가 실제 존재하는 계정인지 검증하고, 통과하면 User 를 반환한다(호출부의 중복 조회
   * 제거). 계정이 없으면 AuthorizationError.
   *
   * 이 검증은 사용자 데이터 접근 진입점에서 **다른 어떤 처리(한도 체크, 외부 API 호출,
   * 기록)보다 먼저** 수행되어야 한다 — 존재하지 않는/파기된 계정으로 무료 한도를
   * 소진시키거나 유료 동정 호출을 태우는 비용 공격까지 함께 차단하기 위해서다.
   */
  async requireUser(ctx: AuthContext): Promise<User> {
    const user = await this.users.get(ctx.userId);
    if (!user) throw new AuthorizationError();
    return user;
  }

  /**
   * 범용 소유권 비교. 지금은 계정=자원 소유자가 대부분 일치해 직접 쓰이는 곳이 적지만,
   * 나중에 Creature/GardenLayout 등 "사용자가 소유한 하위 자원"이 생기면(F9/F16) 그
   * 자원의 소유자 id 를 ctx 와 비교하는 용도로 재사용한다.
   */
  assertOwns(ctx: AuthContext, ownerId: UserId): void {
    if (ctx.userId !== ownerId) {
      throw new AuthorizationError();
    }
  }
}
