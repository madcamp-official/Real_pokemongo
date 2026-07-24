/**
 * 계정 서비스 (명세서 F1, F18, §3).
 *
 * v1.2: 보호자·자녀 2단계 계정 구조를 제거하고 단일 사용자 계정 모델로 단순화.
 * - 로그인/결제/인증 주체와 프로필(닉네임/아바타/레벨/XP)이 전부 한 User.
 * - 위치 저장 기본값 = OFF.
 *
 * 실제 이메일/비밀번호 인증/토큰 발급은 인증 계층(TODO: AUTH_JWT_SECRET) 소관이라 여기선
 * 도메인 규칙만 다룬다.
 */
import type { User, UserId, SubscriptionPlan } from "../../core/domain/types.js";
import { newUserId } from "../../core/domain/ids.js";
import type { UserRepository } from "../../core/repositories/ports.js";
import type { AuthContext, Authorizer } from "../../core/auth/Authorization.js";

export class AccountService {
  constructor(
    private readonly users: UserRepository,
    private readonly authorizer: Authorizer,
  ) {}

  /**
   * 계정 생성(단일 가입 트랜잭션, F1). 위치 저장은 항상 false 로 시작(프라이버시 기본값).
   */
  async createUser(
    params: { plan?: SubscriptionPlan; nickname: string; avatar: string; now?: Date },
  ): Promise<User> {
    const u: User = {
      id: newUserId(),
      plan: params.plan ?? "free",
      locationStorageEnabled: false, // 기본 OFF (F12)
      nickname: params.nickname,
      avatar: params.avatar,
      level: 1,
      xp: 0,
      createdAt: (params.now ?? new Date()).toISOString(),
    };
    await this.users.save(u);
    return u;
  }

  /**
   * 위치 저장을 켜고 끈다. 기본은 꺼짐. **본인 계정만** 조작 가능 — ctx 이외의 대상을
   * 지정할 방법이 없으므로 프라이버시 통제 탈취가 타입 수준에서 불가능하다.
   */
  async setLocationStorage(ctx: AuthContext, enabled: boolean): Promise<void> {
    const u = await this.authorizer.requireUser(ctx);
    await this.users.save({ ...u, locationStorageEnabled: enabled });
  }

  /** 인증된 본인 계정 조회. */
  getSelf(ctx: AuthContext): Promise<User> {
    return this.authorizer.requireUser(ctx);
  }

  // ── 아래 raw 조회는 신뢰 경로(내부 오케스트레이터/조립부) 전용 ──────────────
  // API 계층에서 클라이언트가 보낸 ID로 직접 호출하지 말 것(IDOR). 반드시
  // getSelf / Authorizer 를 경유한다.
  getUser(id: UserId): Promise<User | null> {
    return this.users.get(id);
  }
}
