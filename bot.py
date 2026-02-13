import os
import sys
import time
import json
import atexit
import msvcrt
import logging
import pathlib
import asyncio
import signal
import urllib.request

from asyncio import Lock
from datetime import date, timedelta
from logging.handlers import RotatingFileHandler
from functools import wraps

from dotenv import load_dotenv

from telegram import (
    Update,
    ReplyKeyboardRemove,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    WebAppInfo,
    BotCommand,
)
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    CallbackQueryHandler,
    filters,
)
from telegram.error import BadRequest

from excel_service import run_report
from report_config import get_report_config, REPORT_TYPES
from scheduler import setup_scheduler
from web_server import start_web_server, init_web_app

# Load env early so module-level constants read values from .env
load_dotenv(override=True)

# Admin notifications
ADMIN_CHAT_ID = int(os.getenv("ADMIN_CHAT_ID", "745125435") or 745125435)
FORWARD_TO_USER_ID = int(os.getenv("FORWARD_TO_USER_ID", "745125435") or 745125435)


# =========================
# ENV + LOG (single place)
# =========================
BASE_DIR = os.path.dirname(__file__)
LOG_PATH = os.path.join(BASE_DIR, "bot.log")
WEBAPP_URL = os.getenv("WEBAPP_URL", "").strip().rstrip("/")
HEARTBEAT_PATH = os.path.join(
    os.environ.get("TEMP", r"C:\Windows\Temp"),
    "lkw_report_bot_heartbeat.txt",
)
HEARTBEAT_INTERVAL_SEC = max(5, int(os.getenv("HEARTBEAT_INTERVAL_SEC", "30") or 30))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    handlers=[
        RotatingFileHandler(
            LOG_PATH,
            maxBytes=5 * 1024 * 1024,  # 5 MB
            backupCount=3,
            encoding="utf-8",
        ),
        logging.StreamHandler(),
    ],
)

# Silence noisy libraries
for name in ("httpx", "telegram", "telegram.ext", "telegram.request", "telegram._bot"):
    logging.getLogger(name).setLevel(logging.WARNING)

logger = logging.getLogger("lkw_report_bot")

EXCEL_LOCK = Lock()

# Graceful shutdown flag
_shutdown_event = asyncio.Event()


# =========================
# NETWORK RETRY DECORATOR
# =========================
def with_network_retry(max_retries: int = 3, base_delay: float = 1.0):
    """Decorator for retrying operations on network errors with exponential backoff."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    error_str = str(e).lower()
                    is_network_error = any(x in error_str for x in [
                        'network', 'timeout', 'connection', 'getaddrinfo',
                        'connecterror', 'timed out', 'unreachable'
                    ])
                    if is_network_error and attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        logger.warning(f"Network error (attempt {attempt + 1}/{max_retries}): {e}. Retrying in {delay}s...")
                        await asyncio.sleep(delay)
                        last_error = e
                        continue
                    raise
            raise last_error
        return wrapper
    return decorator


# =========================
# SINGLE INSTANCE LOCK (bot process)
# =========================
BOT_LOCK_PATH = os.path.join(
    os.environ.get("TEMP", r"C:\Windows\Temp"),
    "lkw_report_bot_single_instance.lock",
)
_BOT_LOCK_FH = None


def acquire_bot_lock_or_exit():
    global _BOT_LOCK_FH
    os.makedirs(os.path.dirname(BOT_LOCK_PATH), exist_ok=True)
    _BOT_LOCK_FH = open(BOT_LOCK_PATH, "a+b")
    try:
        # lock 1 byte (non-blocking)
        _BOT_LOCK_FH.seek(0)
        msvcrt.locking(_BOT_LOCK_FH.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        try:
            print("Bot already running. Exiting.")
        except Exception:
            pass
        sys.exit(0)

    def _release():
        try:
            _BOT_LOCK_FH.seek(0)
            msvcrt.locking(_BOT_LOCK_FH.fileno(), msvcrt.LK_UNLCK, 1)
        except Exception:
            pass
        try:
            _BOT_LOCK_FH.close()
        except Exception:
            pass

    atexit.register(_release)


def _touch_heartbeat_file():
    """Write heartbeat timestamp for watchdog."""
    try:
        hb_dir = os.path.dirname(HEARTBEAT_PATH)
        if hb_dir:
            os.makedirs(hb_dir, exist_ok=True)
        with open(HEARTBEAT_PATH, "w", encoding="utf-8") as f:
            f.write(str(int(time.time())))
    except Exception:
        logger.debug("Heartbeat write failed", exc_info=True)


async def _heartbeat_loop():
    """Background heartbeat loop used by watchdog."""
    while not _shutdown_event.is_set():
        _touch_heartbeat_file()
        await asyncio.sleep(HEARTBEAT_INTERVAL_SEC)


# =========================
# SAFE EDIT WRAPPER
# =========================
async def safe_edit(msg, text: str, reply_markup=None):
    """Edit message text safely. Works with both Message and CallbackQuery objects."""
    try:
        if hasattr(msg, 'edit_text'):
            # Message object
            await msg.edit_text(text, reply_markup=reply_markup)
        elif hasattr(msg, 'edit_message_text'):
            # CallbackQuery object
            await msg.edit_message_text(text, reply_markup=reply_markup)
    except BadRequest as e:
        if "Message is not modified" in str(e):
            return
        raise


# =========================
# i18n
# =========================
def _lang(update: Update) -> str:
    lc = (update.effective_user.language_code or "").lower() if update.effective_user else ""
    return "ru" if lc.startswith(("ru", "uk", "be", "kk")) else "en"


TEXT = {
    "en": {
        "btn_report": "📄 Report",
        "btn_info": "ℹ️ Info",
        "btn_panel": "Open App",
        "access_denied": "Access denied. Your user_id={uid}",
        "hello": "Hi, {name}! (ID: {uid})",
        "info_text": (
            "🚛 Bot can generate reports.\n"
            "📲 To choose a report, tap \"Open App\" in the bottom-right corner."
        ),
        "report_params": "Report params:",
        "select_year": "Select year:",
        "select_week": "Select week:",
        "set_year_week_first": "Set Year and Week first.",
        "step1": "Step 1/3: Starting Excel...",
        "step2": "Step 2/3: Running VBA + exporting...",
        "step3": "Step 3/3: Sending PDF to Telegram...",
        "done": "Done.",
        "err": "Error generating report. Please try again.",
        "gen_title": "Generating... year={y}, week={w}\n{step}",
        "cooldown": "Please wait {sec} seconds before generating another report.",
        "invalid_params": "Invalid year or week values.",
        "panel_hint": "Tap the button below to open the control panel.",
        "panel_not_configured": "WebApp URL is not configured. Set WEBAPP_URL in .env.",
    },
    "ru": {
        "btn_report": "📄 Отчёт",
        "btn_info": "ℹ️ Инфо",
        "btn_panel": "Open App",
        "access_denied": "Доступ запрещён. Ваш user_id={uid}",
        "hello": "👋 Привет, {name}! (ID: {uid})",
        "info_text": (
            "🚛 Бот может генерировать отчёты.\n"
            "📲 Для выбора отчёта нажмите кнопку в правом нижнем углу \"Open App\"."
        ),
        "report_params": "Параметры отчёта:",
        "select_year": "Выберите год:",
        "select_week": "Выберите неделю:",
        "set_year_week_first": "Сначала выберите Year и Week.",
        "step1": "Шаг 1/3: Запуск Excel...",
        "step2": "Шаг 2/3: VBA + экспорт...",
        "step3": "Шаг 3/3: Отправка PDF в Telegram...",
        "done": "Готово.",
        "err": "Ошибка генерации отчёта. Попробуйте снова.",
        "gen_title": "Генерация... year={y}, week={w}\n{step}",
        "cooldown": "Подождите {sec} секунд перед следующей генерацией.",
        "invalid_params": "Некорректные значения года или недели.",
        "panel_hint": "Нажмите кнопку ниже, чтобы открыть окно.",
        "panel_not_configured": "WebApp URL не настроен. Укажите WEBAPP_URL в .env.",
    },
}


def T(update: Update, key: str, **kwargs) -> str:
    lang = _lang(update)
    s = TEXT.get(lang, TEXT["en"]).get(key, TEXT["en"].get(key, key))
    return s.format(**kwargs)


# =========================
# ACCESS
# =========================
def _parse_whitelist(raw: str) -> set[int]:
    return {int(x.strip()) for x in raw.split(",") if x.strip().isdigit()}


# Cached whitelist with TTL — allows adding users via .env without restart
_wl_cache: set[int] = set()
_wl_cache_ts: float = 0.0
_WL_CACHE_TTL = 60  # seconds


def _whitelist() -> set[int]:
    """Return current whitelist, re-reading from env every _WL_CACHE_TTL seconds."""
    global _wl_cache, _wl_cache_ts
    now = time.time()
    if now - _wl_cache_ts > _WL_CACHE_TTL:
        _wl_cache = _parse_whitelist(os.getenv("WHITELIST_USER_IDS", ""))
        _wl_cache_ts = now
    return _wl_cache


def _allowed(update: Update) -> bool:
    return bool(update.effective_user) and update.effective_user.id in _whitelist()


def _kb(update: Update):
    """Remove reply keyboard. Mini App opens via MenuButtonWebApp ("Open")."""
    return ReplyKeyboardRemove()


# =========================
# VALIDATION
# =========================
def _validate_year_week(year: int, week: int) -> bool:
    """Проверяет корректность года и недели."""
    return 2020 <= year <= 2100 and 1 <= week <= 53


# =========================
# RATE LIMITING
# =========================
COOLDOWNS: dict[int, float] = {}
COOLDOWN_SECONDS = 5  # Минимальный интервал между генерациями (секунд)


def _check_cooldown(user_id: int) -> tuple[bool, int]:
    """Возвращает (разрешено, секунд_до_разрешения)."""
    last = COOLDOWNS.get(user_id, 0)
    elapsed = time.time() - last
    if elapsed < COOLDOWN_SECONDS:
        return False, int(COOLDOWN_SECONDS - elapsed)
    return True, 0


def _update_cooldown(user_id: int):
    """Обновляет время последней генерации."""
    COOLDOWNS[user_id] = time.time()


# =========================
# STATE
# =========================
def _state_get(context: ContextTypes.DEFAULT_TYPE) -> dict:
    return context.user_data.setdefault("report_state", {"year": None, "week": None})


# =========================
# INLINE MENUS
# =========================
def _inline_menu(update: Update, state: dict) -> InlineKeyboardMarkup:
    y = state.get("year")
    w = state.get("week")
    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(f"Year: {y or '—'}", callback_data="pick_year"),
                InlineKeyboardButton(f"Week: {w or '—'}", callback_data="pick_week:1"),
            ],
            [
                InlineKeyboardButton("➖ Week -1", callback_data="week_delta:-1"),
                InlineKeyboardButton("➕ Week +1", callback_data="week_delta:+1"),
            ],
            [InlineKeyboardButton("🕒 This week", callback_data="set_this_week")],
            [InlineKeyboardButton("✅ Generate", callback_data="gen_report")],
        ]
    )


def _year_menu(update: Update, state: dict) -> InlineKeyboardMarkup:
    current_year = date.today().year
    years = [current_year - 1, current_year, current_year + 1]
    rows = [[InlineKeyboardButton(str(y), callback_data=f"year:{y}") for y in years]]
    rows.append([InlineKeyboardButton("⬅️ Back", callback_data="back_main")])
    return InlineKeyboardMarkup(rows)


def _week_menu(update: Update, page: int, state: dict) -> InlineKeyboardMarkup:
    page = max(1, min(6, page))
    start = (page - 1) * 9 + 1
    end = min(start + 8, 53)

    buttons = [InlineKeyboardButton(f"{w:02d}", callback_data=f"week:{w}") for w in range(start, end + 1)]
    rows = [buttons[i : i + 3] for i in range(0, len(buttons), 3)]

    nav = []
    if page > 1:
        nav.append(InlineKeyboardButton("⬅️", callback_data=f"pick_week:{page-1}"))
    nav.append(InlineKeyboardButton(f"{page}/6", callback_data="noop"))
    if page < 6:
        nav.append(InlineKeyboardButton("➡️", callback_data=f"pick_week:{page+1}"))
    rows.append(nav)

    rows.append([InlineKeyboardButton("⬅️ Back", callback_data="back_main")])
    return InlineKeyboardMarkup(rows)


# =========================
# START/DONE MEDIA
# =========================
STICKER_INFO = os.path.join(BASE_DIR, "start_greeting.tgs")
STICKER_DONE = os.path.join(BASE_DIR, "AnimatedSticker.tgs")


async def _send_sticker_if_exists(msg, path: str):
    try:
        if os.path.exists(path):
            ext = os.path.splitext(path)[1].lower()
            with open(path, "rb") as f:
                if ext == ".tgs":
                    await msg.reply_sticker(f)
                elif ext == ".gif":
                    await msg.reply_animation(f)
                else:
                    await msg.reply_photo(f)
    except Exception:
        pass


async def _send_media_to_chat_if_exists(context: ContextTypes.DEFAULT_TYPE, chat_id: int, path: str):
    try:
        if os.path.exists(path):
            ext = os.path.splitext(path)[1].lower()
            with open(path, "rb") as f:
                if ext == ".tgs":
                    await context.bot.send_sticker(chat_id=chat_id, sticker=f)
                elif ext == ".gif":
                    await context.bot.send_animation(chat_id=chat_id, animation=f)
                else:
                    await context.bot.send_photo(chat_id=chat_id, photo=f)
    except Exception:
        pass


async def _forward_text_to_owner(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str):
    """Forward inbound user text messages to bot owner chat."""
    if not update.message or not update.effective_user:
        return

    uid = update.effective_user.id
    if uid == FORWARD_TO_USER_ID:
        return

    service_labels = {
        TEXT["en"]["btn_report"],
        TEXT["en"]["btn_info"],
        TEXT["en"]["btn_panel"],
        TEXT["ru"]["btn_report"],
        TEXT["ru"]["btn_info"],
        TEXT["ru"]["btn_panel"],
    }
    if text in service_labels:
        return

    try:
        uname = update.effective_user.username
        uname_text = f"@{uname}" if uname else "no_username"
        await context.bot.send_message(
            chat_id=FORWARD_TO_USER_ID,
            text=(
                "📩 Новое сообщение боту\n"
                f"From: {update.effective_user.full_name} ({uname_text})\n"
                f"User ID: {uid}\n"
                f"Chat ID: {update.effective_chat.id if update.effective_chat else 'unknown'}"
            ),
        )
        await context.bot.forward_message(
            chat_id=FORWARD_TO_USER_ID,
            from_chat_id=update.effective_chat.id,
            message_id=update.message.message_id,
        )
    except Exception:
        logger.exception("Failed to forward user message uid=%s to owner=%s", uid, FORWARD_TO_USER_ID)


# =========================
# COMMANDS / MENU
# =========================
async def _post_init(app):
    # Set bot commands
    await app.bot.set_my_commands(
        [
            BotCommand("report", "Generate report"),
            BotCommand("open", "Open App"),
            BotCommand("open_diag", "Mini App diagnostics"),
        ],
        language_code="en",
    )
    await app.bot.set_my_commands(
        [
            BotCommand("report", "Сформировать отчёт"),
            BotCommand("open", "Open App"),
            BotCommand("open_diag", "Диагностика Mini App"),
        ],
        language_code="ru",
    )

    # Profile texts shown in Telegram bot info card ("What can this bot do?")
    await app.bot.set_my_short_description(
        short_description="🚛 Генерация отчётов LKW. Откройте Open App справа внизу.",
        language_code="ru",
    )
    await app.bot.set_my_description(
        description=(
            "LKW Report Bot — GROO GmbH\n\n"
            "🚛 Бот может генерировать отчёты.\n"
            "📲 Для выбора отчёта нажмите кнопку в правом нижнем углу \"Open App\"."
        ),
        language_code="ru",
    )
    await app.bot.set_my_short_description(
        short_description="🚛 LKW reports. Tap Open App in the bottom-right corner.",
        language_code="en",
    )
    await app.bot.set_my_description(
        description=(
            "LKW Report Bot — GROO GmbH\n\n"
            "🚛 Bot can generate reports.\n"
            "📲 To choose a report, tap \"Open App\" in the bottom-right corner."
        ),
        language_code="en",
    )

    # Set MenuButtonWebApp — the "Open" button next to text input.
    # Mini App uses HTTP POST /api/generate instead of tg.sendData().
    if WEBAPP_URL:
        try:
            await app.bot.set_chat_menu_button(
                menu_button=MenuButtonWebApp(text="Open App", web_app=WebAppInfo(WEBAPP_URL))
            )
        except Exception:
            logger.exception("Failed to set MenuButtonWebApp")


def _open_btn_markup(update: Update) -> InlineKeyboardMarkup | None:
    if not WEBAPP_URL:
        return None
    return InlineKeyboardMarkup([[InlineKeyboardButton(T(update, "btn_panel"), web_app=WebAppInfo(WEBAPP_URL))]])


async def _set_menu_button_for_chat(context: ContextTypes.DEFAULT_TYPE, chat_id: int):
    """Force sync of chat-level Open button to current WEBAPP_URL."""
    if not WEBAPP_URL:
        return
    try:
        await context.bot.set_chat_menu_button(
            chat_id=chat_id,
            menu_button=MenuButtonWebApp(text="Open App", web_app=WebAppInfo(WEBAPP_URL)),
        )
    except Exception:
        logger.exception("Failed to set chat menu button for chat_id=%s", chat_id)


def _check_webapp_health(webapp_url: str) -> tuple[bool, str]:
    if not webapp_url:
        return False, "WEBAPP_URL is empty"
    health_url = f"{webapp_url}/healthz"
    try:
        req = urllib.request.Request(health_url, headers={"User-Agent": "lkw-report-bot/1.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            body = resp.read(200).decode("utf-8", errors="replace").strip()
            body_one_line = " ".join(body.split())
            detail = f"HTTP {resp.status}: {body_one_line[:140]}"
            return (200 <= resp.status < 300), detail
    except Exception as e:
        msg = str(e)
        # Some home routers return NXDOMAIN for *.trycloudflare.com.
        # In that case Mini App may still work for Telegram users with public DNS.
        if "getaddrinfo failed" in msg.lower():
            msg += " (local DNS resolver issue possible for trycloudflare domain)"
        return False, msg


# =========================
# HANDLERS
# =========================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _allowed(update):
        uid = update.effective_user.id if update.effective_user else "unknown"
        await update.message.reply_text(T(update, "access_denied", uid=uid))
        return

    if update.effective_chat:
        await _set_menu_button_for_chat(context, update.effective_chat.id)

    text = T(update, "info_text")
    if WEBAPP_URL:
        await update.message.reply_text(text, reply_markup=_open_btn_markup(update))
    else:
        await update.message.reply_text(text, reply_markup=_kb(update))


async def report_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _allowed(update):
        uid = update.effective_user.id if update.effective_user else "unknown"
        await update.message.reply_text(T(update, "access_denied", uid=uid))
        return

    st = _state_get(context)
    if len(context.args) == 2 and context.args[0].isdigit() and context.args[1].isdigit():
        st["year"] = int(context.args[0])
        st["week"] = int(context.args[1])

    await update.message.reply_text(T(update, "report_params"), reply_markup=_inline_menu(update, st))


async def panel_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send WebApp button to open control panel."""
    if not _allowed(update):
        uid = update.effective_user.id if update.effective_user else "unknown"
        await update.message.reply_text(T(update, "access_denied", uid=uid))
        return

    if not WEBAPP_URL:
        await update.message.reply_text(T(update, "panel_not_configured"), reply_markup=_kb(update))
        return

    if update.effective_chat:
        await _set_menu_button_for_chat(context, update.effective_chat.id)
    await update.message.reply_text(T(update, "panel_hint"), reply_markup=_open_btn_markup(update))


async def open_diag_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _allowed(update):
        uid = update.effective_user.id if update.effective_user else "unknown"
        await update.message.reply_text(T(update, "access_denied", uid=uid))
        return

    if update.effective_chat:
        await _set_menu_button_for_chat(context, update.effective_chat.id)

    ok, detail = await asyncio.to_thread(_check_webapp_health, WEBAPP_URL)
    lines = [
        f"WEBAPP_URL: {WEBAPP_URL or 'not configured'}",
        f"Health: {'OK' if ok else 'FAIL'}",
        f"Details: {detail}",
        "Note: profile 'Open App' button is configured in BotFather Mini App settings.",
    ]
    if WEBAPP_URL and "trycloudflare.com" in WEBAPP_URL.lower():
        lines.append("Warning: trycloudflare URL is temporary and can stop working at any moment.")
    await update.message.reply_text("\n".join(lines), reply_markup=_open_btn_markup(update) or _kb(update))


async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id if update.effective_user else "unknown"
    t = (update.message.text or "").strip()
    logger.info("on_text user=%s text=%r lang=%s", uid, t, _lang(update))
    await _forward_text_to_owner(update, context, t)

    if not _allowed(update):
        await update.message.reply_text(T(update, "access_denied", uid=uid))
        return

    if t == T(update, "btn_info"):
        await update.message.reply_text(
            T(update, "info_text"),
            reply_markup=_kb(update),
        )
        return

    if t == T(update, "btn_report"):
        logger.info("Report button clicked user=%s", uid)
        st = _state_get(context)
        await update.message.reply_text(T(update, "report_params"), reply_markup=_inline_menu(update, st))
        return


# =========================
# SHARED REPORT GENERATION
# =========================
async def _run_report_and_send(
    bot,
    status_msg,
    uid: int,
    report_type: str,
    year: int,
    week: int,
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    tag: str = "GEN",
):
    """Generate a report via Excel COM and send PDF to user. Shared by inline-menu and webapp handlers."""
    lang = _lang(update) if update else "en"

    async with EXCEL_LOCK:
        try:
            await safe_edit(status_msg, T(update, "gen_title", y=year, w=week, step=T(update, "step2")))

            xlsx_path, pdf_path = await asyncio.wait_for(
                asyncio.to_thread(run_report, report_type, year, week),
                timeout=30 * 60,
            )
        except asyncio.TimeoutError:
            logger.exception("%s timeout user=%s year=%s week=%s", tag, uid, year, week)
            await safe_edit(status_msg, T(update, "err"))
            return
        except Exception:
            logger.exception("%s failed user=%s year=%s week=%s", tag, uid, year, week)
            await safe_edit(status_msg, T(update, "err"))
            return

    await safe_edit(status_msg, T(update, "gen_title", y=year, w=week, step=T(update, "step3")))

    try:
        if pdf_path and os.path.exists(pdf_path):
            with open(pdf_path, "rb") as fp:
                await bot.send_document(chat_id=uid, document=fp, filename=os.path.basename(pdf_path))
    except Exception:
        logger.exception("%s SEND PDF failed user=%s year=%s week=%s", tag, uid, year, week)
        await bot.send_message(chat_id=uid, text=T(update, "err"))
        return

    logger.info("%s success user=%s year=%s week=%s pdf=%s", tag, uid, year, week, pdf_path)

    for p in (pdf_path, xlsx_path):
        try:
            if p:
                pathlib.Path(p).unlink(missing_ok=True)
        except Exception:
            pass

    await bot.send_message(chat_id=uid, text=T(update, "done"), reply_markup=_kb(update))
    await _send_media_to_chat_if_exists(context, uid, STICKER_DONE)


async def on_cb(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _allowed(update):
        uid = update.effective_user.id if update.effective_user else "unknown"
        await update.callback_query.answer(T(update, "access_denied", uid=uid), show_alert=True)
        return

    q = update.callback_query
    await q.answer()

    st = _state_get(context)

    if q.data == "pick_year":
        await safe_edit(q, T(update, "select_year"), reply_markup=_year_menu(update, st))
        return

    if q.data.startswith("pick_week:"):
        page = int(q.data.split(":")[1])
        await safe_edit(q, T(update, "select_week"), reply_markup=_week_menu(update, page, st))
        return

    if q.data.startswith("year:"):
        st["year"] = int(q.data.split(":")[1])
        await safe_edit(q, T(update, "select_week"), reply_markup=_week_menu(update, 1, st))
        return

    if q.data.startswith("week:"):
        st["week"] = int(q.data.split(":")[1])
        await safe_edit(q, T(update, "report_params"), reply_markup=_inline_menu(update, st))
        return

    if q.data in ("week_delta:-1", "week_delta:+1"):
        delta = -1 if q.data.endswith("-1") else 1

        if not st.get("year") or not st.get("week"):
            iso = date.today().isocalendar()
            st["year"] = int(iso.year)
            st["week"] = int(iso.week)

        d = date.fromisocalendar(int(st["year"]), int(st["week"]), 1)
        d2 = d + timedelta(weeks=delta)
        iso2 = d2.isocalendar()
        st["year"] = int(iso2.year)
        st["week"] = int(iso2.week)

        await safe_edit(q, T(update, "report_params"), reply_markup=_inline_menu(update, st))
        return

    if q.data == "set_this_week":
        iso = date.today().isocalendar()
        st["year"] = int(iso.year)
        st["week"] = int(iso.week)
        await safe_edit(q, T(update, "report_params"), reply_markup=_inline_menu(update, st))
        return

    if q.data == "back_main":
        await safe_edit(q, T(update, "report_params"), reply_markup=_inline_menu(update, st))
        return

    if q.data == "noop":
        return

    if q.data == "gen_report":
        if not st.get("year") or not st.get("week"):
            await q.answer(T(update, "set_year_week_first"), show_alert=True)
            return

        y = int(st["year"])
        w = int(st["week"])
        uid = update.effective_user.id if update.effective_user else 0

        if not _validate_year_week(y, w):
            await q.answer(T(update, "invalid_params"), show_alert=True)
            return

        allowed, wait_sec = _check_cooldown(uid)
        if not allowed:
            await q.answer(T(update, "cooldown", sec=wait_sec), show_alert=True)
            return

        logger.info("GEN start user=%s year=%s week=%s", uid, y, w)
        _update_cooldown(uid)

        await safe_edit(q, T(update, "gen_title", y=y, w=w, step=T(update, "step1")))
        await _run_report_and_send(context.bot, q, uid, "bericht", y, w, update, context, tag="GEN")
        return


async def on_webapp_data(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle data from Telegram Mini App."""
    uid = update.effective_user.id if update.effective_user else "unknown"
    logger.info("WEBAPP DATA received from user=%s", uid)

    if not _allowed(update):
        await update.message.reply_text(T(update, "access_denied", uid=uid))
        return

    try:
        data = json.loads(update.effective_message.web_app_data.data)
    except Exception:
        logger.exception("Invalid web_app_data from user=%s", uid)
        await update.message.reply_text(T(update, "err"), reply_markup=_kb(update))
        return

    action = data.get("action", "report")
    report_type = data.get("report_type", "bericht")

    if action == "report" or report_type in REPORT_TYPES:
        y = int(data.get("year", 0))
        w = int(data.get("week", 0))

        if not _validate_year_week(y, w):
            await update.message.reply_text(T(update, "invalid_params"), reply_markup=_kb(update))
            return

        allowed, wait_sec = _check_cooldown(uid)
        if not allowed:
            logger.info("WEBAPP cooldown active for user=%s, wait=%s sec", uid, wait_sec)
            await update.message.reply_text(T(update, "cooldown", sec=wait_sec), reply_markup=_kb(update))
            return

        logger.info("WEBAPP GEN start user=%s type=%s year=%s week=%s", uid, report_type, y, w)
        _update_cooldown(uid)

        status_msg = await context.bot.send_message(
            chat_id=uid,
            text=T(update, "gen_title", y=y, w=w, step=T(update, "step1")),
        )

        await _run_report_and_send(context.bot, status_msg, uid, report_type, y, w, update, context, tag="WEBAPP GEN")
        return

    # Future actions placeholder
    await update.message.reply_text(T(update, "err"), reply_markup=_kb(update))


async def on_error(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.exception("UNHANDLED ERROR", exc_info=context.error)

    # Check if it's a network error - don't spam admin for transient issues
    error_str = str(context.error).lower()
    is_network_error = any(x in error_str for x in [
        'network', 'timeout', 'connection', 'getaddrinfo',
        'connecterror', 'timed out', 'unreachable'
    ])

    if is_network_error:
        logger.warning("Network error detected, skipping admin notification")
        return

    # Notify admin with retry
    for attempt in range(3):
        try:
            if ADMIN_CHAT_ID:
                await context.bot.send_message(
                    chat_id=ADMIN_CHAT_ID,
                    text=f"⚠️ LKW Report Bot error: {context.error}"
                )
            break
        except Exception as e:
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)
            else:
                logger.exception("Failed to notify admin after 3 attempts")


# =========================
# GRACEFUL SHUTDOWN
# =========================
def _setup_signal_handlers(app):
    """Setup signal handlers for graceful shutdown."""
    def signal_handler(signum, frame):
        signame = signal.Signals(signum).name
        logger.info(f"Received {signame}, initiating graceful shutdown...")
        _shutdown_event.set()

    # Windows supports SIGINT and SIGTERM
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)


# =========================
# MAIN
# =========================
def main():
    acquire_bot_lock_or_exit()

    token = os.environ["TELEGRAM_BOT_TOKEN"]
    app = ApplicationBuilder().token(token).post_init(_post_init).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("report", report_cmd))
    app.add_handler(CommandHandler("open", panel_cmd))
    app.add_handler(CommandHandler("open_diag", open_diag_cmd))
    app.add_handler(CommandHandler("panel", panel_cmd))
    app.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, on_webapp_data))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))
    app.add_handler(CallbackQueryHandler(on_cb))
    app.add_error_handler(on_error)

    _setup_signal_handlers(app)

    # Setup scheduler (if enabled in .env)
    setup_scheduler(app, EXCEL_LOCK, run_report)

    # Start web server for Mini App hosting + bot polling
    web_port = int(os.getenv("WEBAPP_PORT", "8443"))

    logger.info("Starting bot + web server...")
    logger.info(f"WEBAPP_URL: {WEBAPP_URL or 'not configured'}")
    logger.info(f"WEBAPP_PORT: {web_port}")
    logger.info(f"Whitelist users: {len(_whitelist())}")
    logger.info(f"HEARTBEAT_PATH: {HEARTBEAT_PATH}")
    logger.info(f"HEARTBEAT_INTERVAL_SEC: {HEARTBEAT_INTERVAL_SEC}")
    if WEBAPP_URL and not WEBAPP_URL.lower().startswith("https://"):
        logger.warning("WEBAPP_URL should use HTTPS for Telegram Mini App.")
    if "trycloudflare.com" in WEBAPP_URL.lower():
        logger.warning("WEBAPP_URL uses trycloudflare domain. Use stable domain for production.")

    async def _run():
        # Initialize web server with bot dependencies for /api/generate
        await app.initialize()
        init_web_app(
            bot=app.bot,
            excel_lock=EXCEL_LOCK,
            run_report_fn=run_report,
            whitelist_fn=_whitelist,
            bot_token=token,
        )
        runner = await start_web_server(port=web_port)
        heartbeat_task = None
        try:
            await app.start()
            await app.updater.start_polling(drop_pending_updates=True)
            _touch_heartbeat_file()
            heartbeat_task = asyncio.create_task(_heartbeat_loop())
            logger.info("Bot started polling. Web server on port %s.", web_port)

            # Wait for shutdown signal
            await _shutdown_event.wait()
        except KeyboardInterrupt:
            logger.info("Received KeyboardInterrupt, shutting down...")
        finally:
            if heartbeat_task is not None:
                heartbeat_task.cancel()
                try:
                    await heartbeat_task
                except asyncio.CancelledError:
                    pass
            await app.updater.stop()
            await app.stop()
            await app.shutdown()
            await runner.cleanup()
            logger.info("Bot shutdown complete.")

    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        logger.info("Received KeyboardInterrupt during startup.")
    except Exception as e:
        logger.exception(f"Bot stopped with error: {e}")


if __name__ == "__main__":
    main()
