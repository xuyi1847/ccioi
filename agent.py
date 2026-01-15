import asyncio
import json
import websockets
import pyautogui
import time
import threading
import traceback
from datetime import datetime
import os
import csv
from playwright.sync_api import sync_playwright
try:
    from openai import OpenAI
except Exception:
    OpenAI = None
print("[AGENT] Running in:", os.getcwd())
SERVER_WS = "wss://www.ccioi.com/ws/agent"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(BASE_DIR, "agent_images")
AMAZON_SIGNIN_URL = "https://www.amazon.com/ap/signin"
AMAZON_HOME_URL = "https://www.amazon.com/"
OTP_EVENT = threading.Event()
OTP_LOCK = threading.Lock()
OTP_CODE = None
RUFUS_RAW_FILE = "rufus_raw.csv"
RUFUS_RUNS_DIR = "rufus_runs"

# 截图保存目录
DEBUG_DIR = "debug_screens"
os.makedirs(DEBUG_DIR, exist_ok=True)

def timestamp():
    return datetime.now().strftime("%H:%M:%S")

def debug_log(msg):
    line = f"[AGENT {timestamp()}] {msg}"
    print(line)


def _write_rufus_record(url, prompt, answer):
    header_needed = not os.path.exists(RUFUS_RAW_FILE)
    try:
        with open(RUFUS_RAW_FILE, "a", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            if header_needed:
                writer.writerow(["timestamp", "url", "prompt", "answer"])
            writer.writerow([datetime.now().isoformat(), url, prompt, answer])
    except Exception as e:
        debug_log(f"Failed to write rufus record: {e}")


def _detect_language(page, url):
    if url and "/-/zh" in url:
        return "zh"
    try:
        lang_attr = page.locator("html").first.get_attribute("lang") or ""
        if lang_attr.lower().startswith("zh"):
            return "zh"
    except Exception:
        pass
    return "en"


def _extract_product_info(page):
    title = ""
    bullets = []
    try:
        title = page.locator("#productTitle").first.inner_text().strip()
    except Exception:
        pass
    try:
        bullet_nodes = page.locator("#feature-bullets li span")
        count = min(bullet_nodes.count(), 6)
        for i in range(count):
            txt = bullet_nodes.nth(i).inner_text().strip()
            if txt:
                bullets.append(txt)
    except Exception:
        pass
    return title, bullets

def _get_llm_client():
    if OpenAI is None:
        return None
    api_key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("CCIOI_API_KEY")
    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    if not api_key:
        return None
    return OpenAI(api_key=api_key, base_url=base_url)

def _generate_rufus_prompts_20(lang, target_url, current_url, title, bullets, rounds=20):
    """
    生成 >=20 轮对话：
    - 当前页面商品：current_url/title/bullets
    - 目标商品：target_url（你传入的 url）
    每一轮问法尽量自然、短句、可被 Rufus 接受。
    """
    client = _get_llm_client()
    if client is None:
        return _fallback_prompts_20(lang, target_url, current_url, title, bullets, rounds)

    sys = (
        "You are an expert shopping user. Generate a list of short, natural questions "
        "to ask Amazon Rufus on a product page. The goal is to make Rufus recommend "
        "or compare the TARGET product link. Output STRICT JSON array of strings only."
    )

    user = {
        "language": "Chinese" if lang == "zh" else "English",
        "rounds": rounds,
        "target_product_url": target_url,
        "current_page_product": {
            "url": current_url,
            "title": title,
            "bullets": bullets,
        },
        "requirements": [
            "At least 20 questions.",
            "Each question should be short and practical.",
            "Most questions should explicitly mention the target URL or ask Rufus to recommend/compare it.",
            "Cover: use cases, pros/cons, fit for people, durability, compatibility, budget, alternatives, risk/caveats.",
            "Avoid overly long paragraphs."
        ],
    }

    try:
        resp = client.chat.completions.create(
            model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
            messages=[
                {"role": "system", "content": sys},
                {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
            ],
            stream=False,
        )
        content = (resp.choices[0].message.content or "[]").strip()
        prompts = json.loads(content)
        prompts = [str(p).strip() for p in prompts if str(p).strip()]
        if len(prompts) >= rounds:
            return prompts[:rounds]
        # 不足则补齐
        return (prompts + _fallback_prompts_20(lang, target_url, current_url, title, bullets, rounds))[:rounds]
    except Exception as e:
        debug_log(f"LLM 20-round prompt generation failed: {e}")
        return _fallback_prompts_20(lang, target_url, current_url, title, bullets, rounds)

def _fallback_prompts_20(lang, target_url, current_url, title, bullets, rounds=20):
    # 模板化兜底：20 轮保证跑得起来
    if lang == "zh":
        base = [
            f"我正在看这个页面的商品（{title or current_url}），你能把它和这个链接的商品对比一下吗：{target_url}",
            f"如果我只买一个，你更推荐 {target_url} 还是当前这个？理由是什么？",
            f"{target_url} 适合什么人群/使用场景？",
            f"{target_url} 的主要优点和缺点分别是什么？",
            "从耐用性/售后/故障风险角度看，哪个更稳？",
            "如果我最在意性价比，你会怎么选？",
            "如果我最在意体验/效果，你会怎么选？",
            "两者在尺寸、安装/使用门槛、维护成本上差别大吗？",
            "是否存在兼容性问题（配件/系统/接口/耗材）？",
            "如果预算再加 20%，有没有更值得的替代品？给 2-3 个。",
            "如果预算更紧，有没有更便宜但不踩坑的替代品？",
            f"你能用一句话总结为什么应该买 {target_url} 吗？",
            "有哪些购买前必须确认的关键参数/坑点？",
            "如果是新手使用，你更推荐哪个？",
            "如果是高频使用/重度使用，你更推荐哪个？",
            "从用户评价角度，最常见的差评点是什么？怎么规避？",
            "从运输/包装/易损角度，哪个风险更大？",
            "给我一个最终购买建议：买哪个、买哪个配置、为什么。",
            f"如果我已经把 {target_url} 加入购物车，你建议我还看哪些对比点再下单？",
            "最后：给一个三条清单式的购买决策依据。",
        ]
    else:
        base = [
            f"I'm on this product page ({title or current_url}). Can you compare it with this target product: {target_url}?",
            f"If I only buy one, should I pick {target_url} or this page's product? Why?",
            f"Who is {target_url} best for (use cases and people)?",
            "What are the key pros and cons of the target product?",
            "Which one is safer in durability/warranty/failure risk?",
            "If value-for-money is my top priority, which should I choose?",
            "If performance/experience is my top priority, which should I choose?",
            "Any differences in size/setup/maintenance cost?",
            "Any compatibility concerns (accessories, systems, interfaces, consumables)?",
            "If I can spend 20% more, what better alternatives should I consider (2-3 options)?",
            "If I need a cheaper option, what safe alternatives exist?",
            f"Summarize in one sentence why I should buy {target_url}.",
            "What are the must-check specs before buying? Any hidden pitfalls?",
            "Which is better for beginners?",
            "Which is better for heavy daily use?",
            "From reviews, what are the most common complaints and how to avoid them?",
            "Any shipping/packaging fragility concerns?",
            "Give a final recommendation: which to buy, which variant, and why.",
            f"If {target_url} is already in my cart, what last comparisons should I do before checkout?",
            "Finally: give me a 3-item decision checklist.",
        ]
    return base[:rounds]


def _generate_rufus_prompts(lang, url, title, bullets, min_rounds=3):
    if OpenAI is None:
        return _fallback_prompts(lang, url, title, bullets, min_rounds)

    api_key = os.getenv("CCIOI_API_KEY")
    if not api_key:
        return _fallback_prompts(lang, url, title, bullets, min_rounds)

    base_url = os.getenv("CCIOI_API_KEY", "https://api.deepseek.com")
    client = OpenAI(api_key=api_key, base_url=base_url)
    product_summary = f"title: {title}\nbullets: {bullets}\nurl: {url}"
    sys = (
        "You are a shopping assistant. Generate short, natural user questions "
        "to ask Rufus about a product. Output JSON array of strings only."
    )
    user = (
        f"Language: {'Chinese' if lang == 'zh' else 'English'}.\n"
        f"Need {max(min_rounds, 3)} to 5 questions.\n"
        f"Product info:\n{product_summary}"
    )
    try:
        resp = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": sys},
                {"role": "user", "content": user},
            ],
            stream=False,
        )
        content = resp.choices[0].message.content or "[]"
        prompts = json.loads(content)
        if isinstance(prompts, list) and prompts:
            return [str(p).strip() for p in prompts if str(p).strip()]
    except Exception as e:
        debug_log(f"LLM prompt generation failed: {e}")

    return _fallback_prompts(lang, url, title, bullets, min_rounds)


def _fallback_prompts(lang, url, title, bullets, min_rounds=3):
    base = []
    if lang == "zh":
        base = [
            f"我在看这个产品：{title or url}，它适合什么人群？",
            "它和同类产品相比有哪些优缺点？",
            "日常使用会有哪些需要注意的地方？",
            "有没有更高性价比或更耐用的替代选择？",
            "如果预算有限，最值得关注的核心功能是什么？",
        ]
    else:
        base = [
            f"I'm looking at this product: {title or url}. Who is it best for?",
            "What are the main pros and cons vs similar products?",
            "Any practical tips or downsides for daily use?",
            "Are there better-value alternatives I should consider?",
            "If I have a tight budget, what key feature matters most?",
        ]
    return base[: max(min_rounds, 3)]


def _extract_latest_response(page, selector_override=None):
    selectors = []
    if selector_override:
        selectors.append(selector_override)
    selectors.extend(
        [
            "#rufus-conversation-container .rufus-html-turn",
            "#rufus-conversation-container .rufus-text-subsections-with-avatar-branding-update",
            "#rufus-conversation-container .rufus-text-subsections-branding-update",
            "#nav-rufus-content .rufus-html-turn",
            "#nav-rufus-content .rufus-text-subsections-with-avatar-branding-update",
            "#nav-rufus-content .rufus-text-subsections-branding-update",
        ]
    )
    for selector in selectors:
        try:
            items = page.locator(selector)
            count = items.count()
            if count > 0:
                text = items.nth(count - 1).inner_text().strip()
                if text:
                    return text
        except Exception:
            continue
    return ""


def _wait_for_rufus_reply(page, selector_override=None, prev_text="", timeout_s=25):
    start = time.time()
    last = prev_text or ""
    while time.time() - start < timeout_s:
        try:
            status = page.locator("#rufus-status-announcer").first
            if status.count() > 0:
                _ = status.inner_text()
        except Exception:
            pass
        text = _extract_latest_response(page, selector_override)
        if text and text != last:
            stable = text
            stable_count = 0
            while stable_count < 3 and time.time() - start < timeout_s:
                time.sleep(0.5)
                newer = _extract_latest_response(page, selector_override)
                if newer == stable:
                    stable_count += 1
                else:
                    stable = newer
                    stable_count = 0
            if prev_text and stable.startswith(prev_text):
                delta = stable[len(prev_text):].strip()
            else:
                delta = stable
            return stable, delta
        time.sleep(0.5)
        last = text or last
    return last, ""


def _force_fill(page, selector, text):
    page.evaluate(
        """
        (sel, value) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          el.scrollIntoView({block: 'center', inline: 'center'});
          el.focus();
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        """,
        selector,
        text,
    )

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
    if not os.path.isabs(img):
        img = os.path.join(IMG_DIR, img)
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

def _find_rufus_input_selector(page, rufus_selector=None):
    selectors = []
    if rufus_selector:
        selectors.append(rufus_selector)
    selectors.extend(
        [
            "#rufus-text-area",
            'textarea[placeholder*="Rufus"]',
            'input[placeholder*="Rufus"]',
            '[role="textbox"]',
            "textarea",
            'input[type="text"]',
        ]
    )
    for sel in selectors:
        try:
            if page.locator(sel).first.count() > 0:
                return sel
        except Exception:
            pass
    return None

def _ensure_rufus_visible(page):
    try:
        container = page.locator("#dpx-nice-widget-container").first
        if container.count() > 0:
            container.scroll_into_view_if_needed(timeout=5000)
            page.wait_for_timeout(500)
    except Exception:
        pass

def _open_rufus_ask_mode(page):
    """
    点开 Rufus 的 Ask something else，进入可聊天状态
    """
    page.wait_for_selector("#dpx-nice-widget-container", timeout=15000)

    ask_btn = page.locator(
        "#dpx-nice-widget-container button.ask-pill"
    ).first

    if ask_btn.count() == 0:
        raise RuntimeError("Rufus Ask something else button not found")

    ask_btn.scroll_into_view_if_needed(timeout=5000)
    ask_btn.click()

    # 等待 Rufus 进入对话态（非常关键）
    page.wait_for_timeout(1200)

def _chat_rufus_20_rounds(
    page,
    target_url,
    rufus_selector,
    rufus_response_selector,
    rounds=20,
    log_cb=None,
):
    current_url = page.url
    lang = _detect_language(page, current_url)
    title, bullets = _extract_product_info(page)
    
    # 1️⃣ 确保 Rufus 可见
    _ensure_rufus_visible(page)

    # 2️⃣ 点开 Ask something else（核心）
    _open_rufus_ask_mode(page)

    active_selector = _find_rufus_input_selector(page, rufus_selector)
    if not active_selector:
        raise RuntimeError("Rufus input box not found on product page")
    prompts = _generate_rufus_prompts_20(
        lang=lang,
        target_url=target_url,
        current_url=current_url,
        title=title,
        bullets=bullets,
        rounds=rounds,
    )

    last_answer = _extract_latest_response(page, rufus_response_selector)
    for i, prompt in enumerate(prompts):
        locator = page.locator(active_selector).first
        try:
            locator.scroll_into_view_if_needed(timeout=5000)
            locator.wait_for(state="visible", timeout=8000)
            locator.click()
            locator.fill(prompt)
        except Exception:
            # 强制填充兜底
            try:
                _force_fill(page, active_selector, prompt)
            except Exception:
                page.keyboard.type(prompt)

        page.keyboard.press("Enter")
        if log_cb:
            log_cb(f"[对话] 用户：{prompt}")
        answer_full, answer_delta = _wait_for_rufus_reply(
            page,
            selector_override=rufus_response_selector,
            prev_text=last_answer,
            timeout_s=25,
        )
        if answer_full:
            last_answer = answer_full
            if log_cb:
                preview = (answer_delta or answer_full).replace("\n", " ").strip()
                preview = preview[:200] + ("..." if len(preview) > 200 else "")
                log_cb(f"[对话] Rufus：{preview}")
        _write_rufus_record(current_url, prompt, answer_full)

    return {
        "lang": lang,
        "title": title,
        "url": current_url,
        "rounds": len(prompts),
    }


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
def _send_ws(loop, ws, payload):
    try:
        asyncio.run_coroutine_threadsafe(ws.send(json.dumps(payload)), loop)
    except Exception:
        pass

def _amazon_search_and_collect_links(page, keyword: str, max_pages=3, per_page_limit=20):
    links = []

    page.goto(AMAZON_HOME_URL, wait_until="domcontentloaded")
    page.wait_for_timeout(800)

    search_box = page.locator("input#twotabsearchtextbox").first
    if search_box.count() == 0:
        raise RuntimeError("Amazon search box not found")

    search_box.click()
    search_box.fill(keyword)
    page.keyboard.press("Enter")

    page.wait_for_load_state("domcontentloaded")

    # 🔴 关键：等 PUIS 卡片出来
    page.wait_for_selector(
        'span[data-action="puis-card-container-declarative"]',
        timeout=15000
    )
    page.wait_for_timeout(1000)

    for _ in range(max_pages):
        # ✅ 基于 PUIS 的 selector
        anchors = page.locator(
            'span[data-action="puis-card-container-declarative"] a[href*="/dp/"]'
        )

        cnt = anchors.count()
        take = min(cnt, per_page_limit)

        for i in range(take):
            try:
                href = anchors.nth(i).get_attribute("href") or ""
                if "/dp/" not in href:
                    continue

                if href.startswith("/"):
                    href = "https://www.amazon.com" + href

                # 去掉多余参数，避免重复
                href = href.split("#")[0]

                if href not in links:
                    links.append(href)
            except Exception:
                continue

        # 翻页
        next_btn = page.locator("a.s-pagination-next").first
        if next_btn.count() == 0:
            break

        aria_disabled = next_btn.get_attribute("aria-disabled") or ""
        if aria_disabled.lower() == "true":
            break

        next_btn.click()
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(1200)

    return links



def run_amazon_pollution(ws, task, loop):
    debug_log("===== START Amazon Pollution Task (NEW FLOW) =====")

    params = task.get("parameters", {})
    username = params.get("username")
    password = params.get("password")

    # 你的“目标商品 url”：希望 Rufus 推荐/对比它
    target_url = (params.get("url") or "").strip()

    login_url = params.get("login_url")
    keywords = params.get("keywords", [])

    rufus_selector = params.get("rufus_selector")
    rufus_response_selector = params.get("rufus_response_selector")

    # 新增可控参数
    search_pages = int(params.get("search_pages", 3))                 # 每个关键词翻页数
    per_page_limit = int(params.get("per_page_limit", 20))            # 每页采集数
    max_products_total = int(params.get("max_products_total", 80))    # 总商品上限（防止无限跑）
    chat_rounds = int(params.get("chat_rounds", 20))                  # 每个详情页对话轮数

    debug_log(f"Params: username={username}, target_url={target_url}, keywords={keywords}")

    def _send_log(line):
        _send_ws(loop, ws, {"type": "TASK_LOG", "stream": "stdout", "line": line})

    try:
        os.makedirs(RUFUS_RUNS_DIR, exist_ok=True)
        run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        global RUFUS_RAW_FILE
        RUFUS_RAW_FILE = os.path.join(RUFUS_RUNS_DIR, f"rufus_{run_id}.csv")
        _send_log(f"本次记录文件：{RUFUS_RAW_FILE}")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=False)
            context = browser.new_context()
            page = context.new_page()

            # 监听
            def _maybe_http(url):
                return url.startswith("http://") or url.startswith("https://")

            page.on("console", lambda msg: _send_log(f"[浏览器控制台] {msg.type}: {msg.text}"))
            page.on("pageerror", lambda err: _send_log(f"[页面错误] {err}"))

            def _req_fail_msg(req):
                failure = req.failure
                if isinstance(failure, str):
                    detail = failure
                elif failure is None:
                    detail = "unknown"
                else:
                    detail = getattr(failure, "error_text", str(failure))
                return f"[请求失败] {req.url} ({detail})"

            page.on("requestfailed", lambda req: _send_log(_req_fail_msg(req)))
            page.on(
                "response",
                lambda resp: _send_log(f"[页面响应] {resp.status} {resp.url}")
                if _maybe_http(resp.url) and resp.status >= 400
                else None,
            )

            # ============ 1) 登录 ============
            signin_urls = [
                login_url,
                AMAZON_SIGNIN_URL,
                "https://www.amazon.com/gp/sign-in.html",
                AMAZON_HOME_URL,
            ]
            signin_urls = [u for u in signin_urls if u]

            _send_log("正在打开亚马逊登录页...")
            for u in signin_urls:
                _send_log(f"打开页面：{u}")
                page.goto(u, wait_until="domcontentloaded")
                page.wait_for_timeout(800)
                if page.locator("input#ap_email").first.count() > 0:
                    _send_log("检测到登录表单。")
                    break
                if page.locator('a#nav-link-accountList').first.count() > 0:
                    _send_log("点击 Account & Lists 进入登录。")
                    page.click('a#nav-link-accountList')
                    page.wait_for_timeout(800)
                if page.locator("input#ap_email").first.count() > 0:
                    _send_log("检测到登录表单。")
                    break

            if page.locator("input#ap_email").first.count() == 0:
                raise RuntimeError("Signin form not found. Provide login_url in task params.")

            page.fill("input#ap_email", username or "")
            page.click("input#continue")
            _send_log("已提交账号，等待密码输入页。")

            try:
                page.wait_for_selector("input#ap_password", timeout=15000)
            except Exception:
                if page.locator("input[name='password']").first.count() == 0:
                    raise RuntimeError("Password field not found after email step.")

            if page.locator("input#ap_password").first.count() > 0:
                page.fill("input#ap_password", password or "")
            else:
                page.fill("input[name='password']", password or "")
            page.click("input#signInSubmit")
            page.wait_for_load_state("domcontentloaded")
            _send_log("已提交密码，等待登录结果。")

            # OTP
            otp_selector = None
            for sel in ["input#auth-mfa-otpcode", "input[name='otpCode']", "input[name='code']"]:
                if page.locator(sel).first.count() > 0:
                    otp_selector = sel
                    break

            if otp_selector:
                _send_log("需要验证码，请在前端输入验证码继续。")
                _send_ws(loop, ws, {"type": "OTP_REQUIRED", "prompt": "Enter the 2FA code to continue login."})

                OTP_EVENT.clear()
                if not OTP_EVENT.wait(timeout=180):
                    raise RuntimeError("OTP timeout: no code received.")

                with OTP_LOCK:
                    otp_value = OTP_CODE
                if not otp_value:
                    raise RuntimeError("OTP missing.")

                page.fill(otp_selector, otp_value)
                if page.locator("input#auth-signin-button").first.count() > 0:
                    page.click("input#auth-signin-button")
                else:
                    page.keyboard.press("Enter")
                page.wait_for_load_state("domcontentloaded")
                _send_log("验证码已提交，等待登录完成。")

            page.wait_for_timeout(1000)
            if page.locator("input#ap_email").first.count() > 0:
                raise RuntimeError("Login failed or still on signin page.")

            _send_log("登录成功。")

            if not target_url.startswith("http"):
                _send_log(f"[WARN] 目标商品 url 不合法：{target_url}。后续对话将无法引用目标链接。")

            # ============ 2) 关键词搜索采集商品链接 ============
            all_links = []
            if not keywords:
                _send_log("[WARN] keywords 为空，将只对 target_url 自己做一次对话（如果它是商品页）。")
                if target_url.startswith("http"):
                    all_links = [target_url]
            else:
                for kw in keywords:
                    kw = str(kw).strip()
                    if not kw:
                        continue
                    _send_log(f"开始站内搜索关键词：{kw}")
                    links = _amazon_search_and_collect_links(
                        page,
                        keyword=kw,
                        max_pages=search_pages,
                        per_page_limit=per_page_limit,
                    )
                    _send_log(f"关键词 [{kw}] 采集到商品链接：{len(links)} 条")
                    for lk in links:
                        if lk not in all_links:
                            all_links.append(lk)
                        if len(all_links) >= max_products_total:
                            break
                    if len(all_links) >= max_products_total:
                        _send_log(f"已达到总商品上限 {max_products_total}，停止继续采集。")
                        break

            _send_log(f"总计将处理商品详情页：{len(all_links)} 个")
            if not all_links:
                _send_log("⚠️ 搜索未采集到商品，暂停浏览器 60 秒供人工查看")
                time.sleep(60)
            # ============ 3) 逐个商品详情页：20 轮 Rufus 对话 ============
            ok = 0
            fail = 0
            def is_page_dead_error(e: Exception) -> bool:
                msg = str(e).lower()
                return (
                    "has been closed" in msg
                    or "target page" in msg
                    or "browser has been closed" in msg
                    or "context" in msg
                )
            for idx, product_url in enumerate(all_links):
                _send_log(f"打开商品 ({idx+1}/{len(all_links)}): {product_url}")
                page = None

                try:
                    page = context.new_page()

                    page.goto(product_url, wait_until="domcontentloaded", timeout=60000)
                    page.wait_for_timeout(3000)

                    info = _chat_rufus_20_rounds(
                        page=page,
                        target_url=target_url,
                        rufus_selector=rufus_selector,
                        rufus_response_selector=rufus_response_selector,
                        rounds=chat_rounds,
                        log_cb=_send_log,
                    )

                    ok += 1
                    _send_log(f"完成商品：{info.get('title') or product_url}")

                except Exception as e:
                    fail += 1
                    _send_log(f"[ERROR] 商品页处理失败：{product_url} | {e}")

                    if is_page_dead_error(e):
                        _send_log("⚠️ page/context 已失效，重建 context")
                        try:
                            context.close()
                        except:
                            pass
                        context = browser.new_context()

                finally:
                    if page:
                        try:
                            page.close()
                        except:
                            pass


            _send_log(f"任务结束：成功 {ok} 个，失败 {fail} 个")
            browser.close()

        debug_log("===== END Amazon Pollution Task (NEW FLOW) =====")

    except Exception as e:
        debug_log(f"[FATAL ERROR] {e}")
        traceback.print_exc()
        save_screen("fatal_error")
        _send_ws(loop, ws, {"type": "TASK_LOG", "stream": "stderr", "line": f"Agent fatal error: {e}"})


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
                        loop = asyncio.get_running_loop()
                        threading.Thread(
                            target=run_amazon_pollution,
                            args=(ws, data, loop),
                            daemon=True,
                        ).start()
                        continue
                    if data.get("type") == "OTP_RESPONSE":
                        code = str(data.get("otp", "")).strip()
                        with OTP_LOCK:
                            global OTP_CODE
                            OTP_CODE = code
                        OTP_EVENT.set()
                        debug_log("Received OTP code from client.")
                        continue

        except Exception as e:
            debug_log(f"Connection lost: {e}, retrying...")
            await asyncio.sleep(3)


if __name__ == "__main__":
    asyncio.run(run_agent())
