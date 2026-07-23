/**
 * 계정 서비스 (명세서 F1, F12, §3).
 *
 * - 로그인/결제/인증 주체는 보호자(성인) 계정 하나.
 * - 자녀 프로필은 보호자 계정에 종속. 실명·정밀 생일·연락처를 받지 않는다.
 * - 위치 저장 기본값 = OFF.
 * - 법정대리인 동의 없이는 자녀 프로필 생성 불가.
 *
 * 실제 성인 인증/이메일/토큰 발급은 인증 계층(TODO: AUTH_JWT_SECRET) 소관이라 여기선
 * 도메인 규칙만 다룬다.
 */
import type {
  Guardian,
  GuardianId,
  ChildProfile,
  ChildId,
  AgeBand,
  SubscriptionPlan,
} from "../../core/domain/types.js";
import { newGuardianId, newChildId } from "../../core/domain/ids.js";
import type {
  GuardianRepository,
  ChildRepository,
} from "../../core/repositories/ports.js";
import type { AuthContext, Authorizer } from "../../core/auth/Authorization.js";

const MAX_CHILDREN_PER_GUARDIAN = 4; // 명세서 §3.1

export class ConsentRequiredError extends Error {
  constructor() {
    super("법정대리인 동의 없이는 자녀 프로필을 만들 수 없습니다.");
    this.name = "ConsentRequiredError";
  }
}

export class ChildLimitError extends Error {
  constructor() {
    super(`자녀 프로필은 계정당 최대 ${MAX_CHILDREN_PER_GUARDIAN}개입니다.`);
    this.name = "ChildLimitError";
  }
}

export class AccountService {
  constructor(
    private readonly guardians: GuardianRepository,
    private readonly children: ChildRepository,
    private readonly authorizer: Authorizer,
  ) {}

  /**
   * 보호자 계정 생성. 성인 인증은 상위 인증 계층에서 끝났다고 가정하고 도메인만 생성.
   * 위치 저장은 항상 false 로 시작(프라이버시 기본값).
   */
  async createGuardian(
    plan: SubscriptionPlan = "free",
    now: Date = new Date(),
  ): Promise<Guardian> {
    const g: Guardian = {
      id: newGuardianId(),
      plan,
      locationStorageEnabled: false, // 기본 OFF (F12)
      createdAt: now.toISOString(),
    };
    await this.guardians.save(g);
    return g;
  }

  /**
   * 자녀 프로필 생성. 반드시 legalGuardianConsent=true 여야 한다.
   * 소유자는 params 가 아니라 **ctx(인증된 보호자)에서 취득** — 남의 계정 아래에
   * 프로필을 만드는 위조가 타입 수준에서 불가능하다.
   */
  async createChild(
    ctx: AuthContext,
    params: {
      nickname: string;
      ageBand: AgeBand;
      avatar: string;
      legalGuardianConsent: boolean;
      now?: Date;
    },
  ): Promise<ChildProfile> {
    if (!params.legalGuardianConsent) throw new ConsentRequiredError();

    const siblings = await this.children.listByGuardian(ctx.guardianId);
    if (siblings.length >= MAX_CHILDREN_PER_GUARDIAN) throw new ChildLimitError();

    const child: ChildProfile = {
      id: newChildId(),
      guardianId: ctx.guardianId,
      nickname: params.nickname, // 실명 아님 — 검증은 클라이언트 UX에서 안내
      ageBand: params.ageBand,
      avatar: params.avatar,
      level: 1,
      xp: 0,
      createdAt: (params.now ?? new Date()).toISOString(),
    };
    await this.children.save(child);
    return child;
  }

  /**
   * 보호자가 위치 저장을 켜고 끈다(대시보드에서). 기본은 꺼짐.
   * **본인 계정만** 조작 가능 — 남의 계정 위치 저장을 켜는 프라이버시 통제 탈취를 차단.
   */
  async setLocationStorage(ctx: AuthContext, enabled: boolean): Promise<void> {
    const g = await this.guardians.get(ctx.guardianId);
    if (!g) throw new Error("보호자 계정을 찾을 수 없습니다.");
    await this.guardians.save({ ...g, locationStorageEnabled: enabled });
  }

  /** 소유권 검증을 거친 자녀 프로필 조회. API 계층은 반드시 이것을 쓴다. */
  getChildAuthorized(ctx: AuthContext, childId: ChildId): Promise<ChildProfile> {
    return this.authorizer.assertOwnsChild(ctx, childId);
  }

  // ── 아래 raw 조회는 신뢰 경로(내부 오케스트레이터/조립부) 전용 ──────────────
  // API 계층에서 클라이언트가 보낸 ID로 직접 호출하지 말 것(IDOR). 반드시
  // getChildAuthorized / Authorizer 를 경유한다.
  getGuardian(id: GuardianId): Promise<Guardian | null> {
    return this.guardians.get(id);
  }
  getChild(id: ChildId): Promise<ChildProfile | null> {
    return this.children.get(id);
  }
}
