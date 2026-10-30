from __future__ import annotations

import socket

from waitress import serve

from app import app
from config import HOST, PORT


def get_local_ip() -> str | None:
    """
    取得目前電腦在區網中的 IPv4 位址。
    這種做法通常比直接猜 en0/en1 更穩。
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # 不需要真的連到外網，只是讓系統決定要走哪張網卡
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except Exception:
        return None
    finally:
        sock.close()


if __name__ == "__main__":
    local_ip = get_local_ip()

    print("=" * 60)
    print("BMP Pro web server is starting...")
    print(f"Local access   : http://127.0.0.1:{PORT}")

    if HOST == "0.0.0.0" and local_ip:
        print(f"LAN access     : http://{local_ip}:{PORT}")
        print("同一個 Wi-Fi / 區網內的其他裝置可使用上面的 LAN access 網址連線。")
    elif HOST == "0.0.0.0":
        print("LAN access     : 無法自動偵測區網 IP，請手動查詢本機 IP。")
    else:
        print(f"Bind host      : {HOST}")

    print("=" * 60)

    serve(app, host=HOST, port=PORT)