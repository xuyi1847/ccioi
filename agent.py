import asyncio
import json
import websockets
import pyautogui
import time
import threading
import traceback
from datetime import datetime
import os
print("[AGENT] Running in:", os.getcwd())
SERVER_WS = "ws://127.0.0.1:8000/ws/agent"

# 截图保存目录
DEBUG_DIR = "debug_screens"
os.makedirs(DEBUG_DIR, exist_ok=True)

def timestamp():
    return datetime.now().strftime("%H:%M:%S")

def debug_log(msg):
    line = f"[AGENT {timestamp()}] {msg}"
    print(line)

# 带日志的安全截图
def save_screen(tag):
    try:
        path = f"{DEBUG_DIR}/{tag}_{int(time.time())}.jpg"
        pyautogui.screenshot(path)
        debug_log(f"Saved screenshot: {path}")
    except Exception as e:
        debug_log(f"Failed to save screenshot: {e}")

# 带日志的按钮检测
def find_image(img, confidence=0.8):
    debug_log(f"Trying to find image: {img}")
    save_screen("before_find")   # 截图帮助调试

    try:
        location = pyautogui.locateCenterOnScreen(img, confidence=confidence)
        if location:
            debug_log(f"Image found at: {location}")
        else:
            debug_log("Image NOT found on screen")
        return location
    except Exception as e:
        debug_log(f"Image search error: {e}")
        return None

# 带日志的点击
def click_image(img, confidence=0.8, timeout=10):
    debug_log(f"Searching for button [{img}] ... timeout={timeout}s")
    start = time.time()

    while time.time() - start < timeout:
        pos = find_image(img, confidence)
        if pos:
            debug_log(f"Clicking {img} at {pos}")
            pyautogui.moveTo(pos)
            pyautogui.click()
            return True

        debug_log(f"Not found yet... retrying...")
        time.sleep(1)

    debug_log(f"[ERROR] Timeout: Could not find {img}")
    save_screen("NOT_FOUND_" + img.replace(".jpg", ""))
    return False

# ============================================================
# TASK：Amazon 自动化
# ============================================================
def run_amazon_pollution(ws, task):
    debug_log("===== START Amazon Pollution Task =====")

    params = task.get("parameters", {})
    username = params.get("username")
    password = params.get("password")
    amazon_url = params.get("url")
    keywords = params.get("keywords", [])

    debug_log(f"Params: username={username}, url={amazon_url}, keywords={keywords}")

    # 1. 屏幕信息
    debug_log(f"Screen size: {pyautogui.size()}")

    try:
        # 2. 打开 Chrome
        debug_log("Opening Chrome...")
        os.system("open -a 'Google Chrome' https://www.amazon.com")
        time.sleep(5)
        debug_log("Chrome opened.")

        # 3. 点击 sign in
        if not click_image("sign_in.jpg", confidence=0.8, timeout=12):
            ws.send(json.dumps({
                "type": "TASK_LOG",
                "stream": "stderr",
                "line": "ERROR: sign_in.jpg not found"
            }))
            return

        time.sleep(3)

        # 4. 输入手机号
        debug_log("Step: Input phone...")
        if not click_image("phone_input.jpg", timeout=12):
            ws.send(json.dumps({"type": "TASK_LOG","stream":"stderr","line":"找不到手机号输入框"}))
            return

        pyautogui.typewrite(username)
        debug_log(f"Typed username: {username}")
        time.sleep(1)

        # Continue
        click_image("continue_button.jpg", timeout=10)
        time.sleep(3)

        # 5. 输入密码
        debug_log("Step: Input password...")
        if not click_image("password_input.jpg", timeout=12):
            ws.send(json.dumps({"type": "TASK_LOG","stream":"stderr","line":"找不到密码输入框"}))
            return

        pyautogui.typewrite(password)
        debug_log("Typed password.")
        time.sleep(1)

        click_image("login_button.jpg", timeout=10)
        time.sleep(5)

        debug_log("Login attempt finished.")

        # ===== 进入 Rufus 污染 =====
        for i in range(3):
            debug_log(f"Round {i+1}: locating Rufus input box...")
            if click_image("rufus_input.jpg", timeout=10):
                pyautogui.typewrite("Recommend me something about " + ",".join(keywords))
                pyautogui.press('enter')
                debug_log("Question submitted.")
            else:
                debug_log("Rufus input box not found.")
            time.sleep(6)

        debug_log("===== END Amazon Pollution Task =====")

    except Exception as e:
        debug_log(f"[FATAL ERROR] {e}")
        traceback.print_exc()
        save_screen("fatal_error")

        ws.send(json.dumps({
            "type": "TASK_LOG",
            "stream": "stderr",
            "line": f"Agent fatal error: {e}"
        }))

# ============================================================
# WebSocket Agent
# ============================================================
async def run_agent():
    while True:
        debug_log(f"Connecting to server {SERVER_WS} ...")
        try:
            async with websockets.connect(SERVER_WS) as ws:
                debug_log("Connected to server.")

                # 心跳线程
                async def heartbeat():
                    while True:
                        try:
                            await ws.send(json.dumps({"type": "HEARTBEAT"}))
                        except:
                            return
                        await asyncio.sleep(5)

                asyncio.create_task(heartbeat())

                while True:
                    msg = await ws.recv()
                    data = json.loads(msg)

                    debug_log(f"Received message: {data}")

                    # 支持没有 type，只靠 task 判断
                    if data.get("task") == "AMAZON_POLLUTION":
                        debug_log("Trigger AMAZON_POLLUTION task")
                        threading.Thread(target=run_amazon_pollution, args=(ws, data), daemon=True).start()
                        continue

        except Exception as e:
            debug_log(f"Connection lost: {e}, retrying...")
            await asyncio.sleep(3)


if __name__ == "__main__":
    asyncio.run(run_agent())
