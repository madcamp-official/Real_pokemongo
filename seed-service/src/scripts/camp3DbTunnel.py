"""CAMP-3의 로컬 PostgreSQL을 Windows 127.0.0.1:5433으로 전달한다.

비밀번호는 파일이나 명령행 인자에 저장하지 않고 CAMP3_SSH_PASSWORD 환경변수로만 받는다.
"""
from __future__ import annotations

import os
import select
import socketserver
import sys
import threading

import paramiko


SSH_HOST = os.environ.get("CAMP3_SSH_HOST", "172.10.5.71")
SSH_USER = os.environ.get("CAMP3_SSH_USER", "root")
SSH_PASSWORD = os.environ.get("CAMP3_SSH_PASSWORD")
LOCAL_PORT = int(os.environ.get("CAMP3_DB_LOCAL_PORT", "5433"))


class ForwardHandler(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        channel = transport.open_channel(
            "direct-tcpip",
            ("127.0.0.1", 5432),
            self.request.getpeername(),
        )
        if channel is None:
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
    allow_reuse_address = True


if not SSH_PASSWORD:
    print("CAMP3_SSH_PASSWORD 환경변수가 필요합니다.", file=sys.stderr)
    raise SystemExit(2)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(
    SSH_HOST,
    username=SSH_USER,
    password=SSH_PASSWORD,
    timeout=10,
    auth_timeout=10,
)
transport = client.get_transport()
if transport is None:
    raise RuntimeError("SSH transport를 만들지 못했습니다.")
transport.set_keepalive(30)

server = ThreadingForwardServer(("127.0.0.1", LOCAL_PORT), ForwardHandler)
print(f"CAMP-3 DB tunnel ready: 127.0.0.1:{LOCAL_PORT}", flush=True)
try:
    server.serve_forever()
finally:
    server.shutdown()
    transport.close()
    client.close()
