"""飞书扫码一键创建机器人并写入 Antigravity-Everywhere 配置 (~/.gemini/antigravity/feishu-config.json)。"""

import asyncio
import io
import json
import os
import sys
from pathlib import Path

import lark_oapi as lark
import qrcode

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CONFIG_PATH = Path.home() / ".gemini" / "antigravity" / "feishu-config.json"


def render_qr(url: str) -> str:
    qr = qrcode.QRCode(border=1)
    qr.add_data(url)
    qr.make(fit=True)
    buf = io.StringIO()
    qr.print_ascii(out=buf, invert=True)
    return buf.getvalue()


async def main() -> None:
    def on_qr_code(info: dict) -> None:
        url = info["url"]
        mins = max(1, int(info.get("expire_in", 600)) // 60)
        print("\n" + "=" * 60)
        print("请使用手机【飞书 / Lark】扫描下方二维码，一键创建并授权机器人：")
        print("=" * 60)
        print(render_qr(url))
        print(f"有效期约 {mins} 分钟，等待扫码确认中...")
        print(f"备用链接：\n{url}\n")

    def on_status_change(info: dict) -> None:
        if info.get("status") == "domain_switched":
            print("[INFO] 检测到 Lark 国际版账号，已自动切换域名。")

    result = await lark.aregister_app(
        on_qr_code=on_qr_code,
        on_status_change=on_status_change,
        source="antigravity-everywhere",
        app_preset={
            "name": "Antigravity Gateway",
            "desc": "连接本机 Antigravity 桌面端与多工作区的飞书助手",
        },
    )

    if not result or not result.get("client_id") or not result.get("client_secret"):
        raise RuntimeError("扫码注册未返回有效的 App ID / App Secret。")

    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing: dict = {}
    if CONFIG_PATH.exists():
        try:
            loaded = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                existing = loaded
        except Exception:
            existing = {}

    merged = {
        **existing,
        "appId": result["client_id"],
        "appSecret": result["client_secret"],
    }
    tmp_path = CONFIG_PATH.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp_path.replace(CONFIG_PATH)
    if os.name != "nt":
        try:
            os.chmod(CONFIG_PATH, 0o600)
        except OSError:
            pass

    print("\n" + "=" * 60)
    print("[SUCCESS] 飞书机器人创建并配置成功！")
    print(f"  - App ID:   {result['client_id']}")
    print(f"  - 配置文件: {CONFIG_PATH}")
    print("  - 下一步:   在 WebUI (http://localhost:3000) 左下角点击「飞书机器人管理中心」→ 保存并重连。")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[CANCELLED] 已取消扫码配置。")
        sys.exit(1)
    except Exception as exc:
        print(f"\n[ERROR] 飞书扫码配置失败: {exc}", file=sys.stderr)
        sys.exit(1)
