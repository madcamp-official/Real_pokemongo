"""CAMP-3의 로컬 서비스를 Windows의 로컬 포트로 전달한다.

비밀번호는 파일이나 명령행 인자에 저장하지 않고 CAMP3_SSH_PASSWORD 환경변수로만 받는다.
기본값은 PostgreSQL(127.0.0.1:5432 → 127.0.0.1:5433)이고,
CAMP3_REMOTE_PORT/CAMP3_LOCAL_PORT로 BioCLIP 같은 다른 서비스도 전달할 수 있다.
"""
from __future__ import annotations

import os
import select
import socketserver
import sys
import threading
import time

import paramiko


SSH_HOST = os.environ.get("CAMP3_SSH_HOST", "172.10.5.71")
SSH_USER = os.environ.get("CAMP3_SSH_USER", "root")
SSH_PASSWORD = os.environ.get("CAMP3_SSH_PASSWORD")
LOCAL_PORT = int(
    os.environ.get("CAMP3_LOCAL_PORT", os.environ.get("CAMP3_DB_LOCAL_PORT", "5433"))
)
REMOTE_PORT = int(os.environ.get("CAMP3_REMOTE_PORT", "5432"))

client: paramiko.SSHClient | None = None
transport: paramiko.Transport | None = None
transport_lock = threading.Lock()


def close_transport_locked() -> None:
    global client, transport
    if transport is not None:
        transport.close()
    if client is not None:
        client.close()
    transport = None
    client = None


def connect_transport_locked() -> paramiko.Transport:
    """끊어진 SSH 세션을 요청 시점에 자동으로 다시 연결한다."""
    global client, transport
    if transport is not None and transport.is_active():
        return transport

    close_transport_locked()
    next_client = paramiko.SSHClient()
    next_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    next_client.connect(
        SSH_HOST,
        username=SSH_USER,
        password=SSH_PASSWORD,
        timeout=10,
        auth_timeout=10,
    )
    next_transport = next_client.get_transport()
    if next_transport is None:
        next_client.close()
        raise RuntimeError("SSH transport를 만들지 못했습니다.")
    next_transport.set_keepalive(15)
    client = next_client
    transport = next_transport
    return next_transport


def open_forward_channel(source_address: tuple[str, int]) -> paramiko.Channel:
    """채널 생성 실패 시 SSH 세션을 폐기하고 한 번 새로 연결해 재시도한다."""
    with transport_lock:
        for attempt in range(2):
            current = connect_transport_locked()
            try:
                channel = current.open_channel(
                    "direct-tcpip",
                    ("127.0.0.1", REMOTE_PORT),
                    source_address,
                )
                if channel is not None:
                    return channel
            except (EOFError, OSError, paramiko.SSHException):
                close_transport_locked()
                if attempt == 0:
                    time.sleep(0.2)
                    continue
                raise
        raise RuntimeError("CAMP-3 전달 채널을 만들지 못했습니다.")


class ForwardHandler(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        try:
            channel = open_forward_channel(self.request.getpeername())
        except Exception as error:
            print(f"CAMP-3 tunnel reconnect failed: {error}", file=sys.stderr, flush=True)
            self.request.close()
            return
        try:
            while True:
                readable, _, _ = select.select([self.request, channel], [], [])
                if self.request in readable:
                    data = self.request.recv(65536)
                    if not data:
                        break
                    channel.sendall(data)
                if channel in readable:
                    data = channel.recv(65536)
                    if not data:
                        break
                    self.request.sendall(data)
        finally:
            channel.close()
            self.request.close()


class ThreadingForwardServer(socketserver.ThreadingTCPServer):
    daemon_threads = True
    # BioCLIP은 82개 후보를 반환하고 백엔드가 학명 매핑을 병렬 조회한다. 기본 backlog(5)는
    # 최초 요청의 PostgreSQL 풀 연결을 ECONNREFUSED로 떨어뜨리므로 충분히 넉넉하게 둔다.
    request_queue_size = 128
    # Windows에서 SO_REUSEADDR를 켜면 같은 포트에 여러 터널이 동시에 바인딩되어
    # 요청이 오래된 SSH transport로 무작위 분산될 수 있다. 단일 소유를 강제한다.
    allow_reuse_address = False


if not SSH_PASSWORD:
    print("CAMP3_SSH_PASSWORD 환경변수가 필요합니다.", file=sys.stderr)
    raise SystemExit(2)

with transport_lock:
    connect_transport_locked()

server = ThreadingForwardServer(("127.0.0.1", LOCAL_PORT), ForwardHandler)
print(
    f"CAMP-3 tunnel ready: 127.0.0.1:{LOCAL_PORT} -> 127.0.0.1:{REMOTE_PORT}",
    flush=True,
)
try:
    server.serve_forever()
finally:
    server.shutdown()
    with transport_lock:
        close_transport_locked()
