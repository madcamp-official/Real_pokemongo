/**
 * 인가(Authorization) 레이어 (체크리스트 §1.3 — IDOR 원천 차단).
 *
 * 이 서비스에서 가장 치명적인 취약점은 "childId만 바꾸면 남의 아이 데이터에 접근"하는
 * IDOR 다. 이를 막는 원칙: **모든 자녀/계정 데이터 접근 진입점은 AuthContext 를 요구**하고,
 * 자원의 소유권을 여기서 검증한다. "엔드포인트마다 기억해서 체크"가 아니라
 * **타입 수준에서 강제**(ctx 없이는 호출 자체가 불가능)하는 것이 목표다.
 *
 * 이 모듈은 공유 코어에 속한다 — 어떤 버티컬(어린이/탐조/중장년)이든 동일하게 쓴다.
 */
import type { ChildId, ChildProfile, GuardianId } from "../domain/types.js";
import type { ChildRepository } from "../repositories/ports.js";

/**
 * 인증된 주체. **반드시 인증 계층(JWT/세션 검증)이 발급**해야 하며,
 * 클라이언트가 보낸 guardianId 를 그대로 담아서는 절대 안 된다.
 * (테스트/데모에서는 직접 생성하지만, HTTP 계층에서는 토큰 검증 결과로만 만든다.)
 */
export interface AuthContext {
  readonly guardianId: GuardianId;
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
  constructor(private readonly children: ChildRepository) {}

  /**
   * ctx 의 보호자가 childId 의 소유자인지 검증하고, 통과하면 ChildProfile 을 반환한다
   * (호출부의 중복 조회 제거). 미존재/소유 불일치는 동일한 AuthorizationError.
   *
   * 이 검증은 자녀 데이터 접근 진입점에서 **다른 어떤 처리(한도 체크, 외부 API 호출,
   * 기록)보다 먼저** 수행되어야 한다 — 남의 아이로 무료 한도를 소진시키거나 유료 동정
   * 호출을 태우는 비용 공격까지 함께 차단하기 위해서다.
   */
  async assertOwnsChild(ctx: AuthContext, childId: ChildId): Promise<ChildProfile> {
    const child = await this.children.get(childId);
    if (!child || child.guardianId !== ctx.guardianId) {
      throw new AuthorizationError();
    }
    return child;
  }

  /** 본인 계정에 대한 조작인지 검증(예: 위치 저장 설정, 구독 변경). */
  assertSelf(ctx: AuthContext, guardianId: GuardianId): void {
    if (ctx.guardianId !== guardianId) {
      throw new AuthorizationError();
    }
  }
}
