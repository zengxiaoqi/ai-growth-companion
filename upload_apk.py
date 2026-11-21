#!/usr/bin/env python3
"""Upload a large APK to Feishu Cloud Drive using multipart upload API.

Usage:
    export FEISHU_FOLDER_TOKEN=<target folder token>
    export APK_PATH=/path/to/app-release.apk   # optional
    export VERSION_TAG=20261109                 # optional
    # ~/.hermes/.env must contain FEISHU_APP_ID and FEISHU_APP_SECRET
    python upload_apk.py
"""
import json
import os
import sys
import requests

# Machine-specific paths and tenant-specific folder tokens must come from the
# environment — this repository is public, so none of them are hardcoded here.
APK_PATH = os.environ.get(
    "APK_PATH",
    os.path.join(os.path.dirname(__file__), "app-release.apk"),
)
VERSION_TAG = os.environ.get("VERSION_TAG", "dev")
FOLDER_TOKEN = os.environ.get("FEISHU_FOLDER_TOKEN", "")

def get_token():
    # 凭证只从本机文件读取，绝不写入仓库
    env_file = os.path.expanduser("~/.hermes/.env")
    if not os.path.isfile(env_file):
        sys.exit(f"❌ 找不到凭证文件 {env_file}（需含 FEISHU_APP_ID / FEISHU_APP_SECRET）")
    app_id = app_secret = None
    with open(env_file) as f:
        for line in f:
            if line.startswith("FEISHU_APP_ID="):
                app_id = line.strip().split("=", 1)[1]
            elif line.startswith("FEISHU_APP_SECRET="):
                app_secret = line.strip().split("=", 1)[1]
    
    resp = requests.post(
        "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
        json={"app_id": app_id, "app_secret": app_secret}
    )
    data = resp.json()
    token = data.get("tenant_access_token")
    if not token:
        print(f"❌ Token error: {data}")
        sys.exit(1)
    return token

def main():
    if not FOLDER_TOKEN:
        sys.exit("❌ 请先设置环境变量 FEISHU_FOLDER_TOKEN（飞书云盘目标文件夹 token）")
    if not os.path.isfile(APK_PATH):
        sys.exit(f"❌ 找不到 APK：{APK_PATH}（可用环境变量 APK_PATH 指定路径）")
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}
    file_size = os.path.getsize(APK_PATH)
    file_name = f"灵犀伴学-{VERSION_TAG}.apk"
    
    print(f"📤 Uploading {file_name} ({file_size / 1024 / 1024:.1f} MB)...")
    
    # Step 1: Create multipart upload task
    print("Step 1: upload_prepare...")
    resp = requests.post(
        "https://open.feishu.cn/open-apis/drive/v1/files/upload_prepare",
        headers=headers,
        json={
            "file_name": file_name,
            "parent_type": "explorer",
            "parent_node": FOLDER_TOKEN,
            "size": str(file_size),
        }
    )
    data = resp.json()
    print(f"  Response: {json.dumps(data, indent=2, ensure_ascii=False)[:500]}")
    
    if data.get("code") != 0:
        print(f"❌ Upload prepare failed: {data}")
        sys.exit(1)
    
    upload_id = data["data"]["upload_id"]
    block_size = data["data"]["block_size"]
    print(f"✅ Upload prepared: upload_id={upload_id}, block_size={block_size}")
    
    # Step 2: Upload parts
    with open(APK_PATH, "rb") as f:
        part_num = 0
        while True:
            chunk = f.read(block_size)
            if not chunk:
                break
            part_num += 1
            print(f"  Uploading part {part_num} ({len(chunk)} bytes)...", end=" ", flush=True)
            
            resp = requests.post(
                "https://open.feishu.cn/open-apis/drive/v1/files/upload_part",
                headers=headers,
                data={
                    "upload_id": upload_id,
                    "seq": part_num - 1,
                    "size": len(chunk),
                },
                files={"file": (f"part{part_num}", chunk, "application/octet-stream")}
            )
            data = resp.json()
            if data.get("code") != 0:
                print(f"❌ Part {part_num} failed: {data}")
                sys.exit(1)
            print("✅")
    
    print(f"Uploaded {part_num} parts")
    
    # Step 3: Finish upload
    print("Step 3: upload_finish...")
    resp = requests.post(
        "https://open.feishu.cn/open-apis/drive/v1/files/upload_finish",
        headers=headers,
        json={
            "upload_id": upload_id,
            "file_token": upload_id,  # file_token is the upload_id itself
            "block_num": part_num,
        }
    )
    data = resp.json()
    if data.get("code") != 0:
        print(f"❌ Upload finish failed: {data}")
        sys.exit(1)
    
    print(f"\n✅ 上传成功!")
    print(f"   文件名: {file_name}")
    print(f"   文件大小: {file_size / 1024 / 1024:.1f} MB")
    print(f"   versionCode: 2026072601")
    print(f"   versionName: 1.0.0")
    print(f"   Response: {json.dumps(data, indent=2, ensure_ascii=False)[:300]}")

if __name__ == "__main__":
    main()