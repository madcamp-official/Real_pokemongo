# Nature Go 운영 배포

모바일 앱과 Windows Garden은 모두 아래 공개 API와 동일한 PostgreSQL을 사용합니다.

- API: `https://api.iconflorinity.madcamp-kaist.org`
- 공개 경로: Cloudflare Tunnel → VM `127.0.0.1:8080`
- DB: VM Docker PostgreSQL, `127.0.0.1:5432`에만 바인딩
- GPU 모델: VM의 systemd SSH 터널 → CAMP-3의 BioCLIP/BirdNET/Professor worker

`api` 이름에는 별도 A/CNAME 레코드를 만들지 않습니다. Madcamp DNS 관리 API의 Tunnel
hostname이 DNS와 ingress를 함께 관리합니다.

## VM 점검

```bash
cd /opt/nature-go/current/deploy
docker compose --env-file .env.production -f compose.yaml ps
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:8080/ready
systemctl status cloudflared
systemctl status nature-go-gpu-tunnel
```

운영 비밀값은 VM의 `/opt/nature-go/current/deploy/.env.production`에만 두며 Git에
커밋하지 않습니다. DB 마이그레이션은 API 컨테이너 시작 전에 자동 실행됩니다.

## 내부 배포 빌드

저장소 루트의 PowerShell에서 실행합니다.

```powershell
.\installer\Build-AndroidInternal.ps1 `
  -ApiBaseUrl https://api.iconflorinity.madcamp-kaist.org

.\installer\Build-WindowsInstaller.ps1 `
  -ApiBaseUrl https://api.iconflorinity.madcamp-kaist.org
```

산출물은 각각 `dist/android`와 `dist/windows`에 생성됩니다. 배포 전에는 스크립트가
출력하는 SHA-256을 보관하고, 설치 대상에서 다시 계산한 값과 비교합니다.
