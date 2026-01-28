import os
import sys
import time
import json
import atexit
import msvcrt
import logging
import pathlib
import asyncio

from asyncio import Lock
from datetime import date, timedelta
from logging.handlers import RotatingFileHandler

from dotenv import load_dotenv

from telegram import (
    Update,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    KeyboardButton,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    WebAppInfo,
    BotCommand,
    MenuButtonWebApp,
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


# =========================
# ENV + LOG (single place)
# =========================
load_dotenv(override=True)

BASE_DIR = os.path.dirname(__file__)
LOG_PATH = os.path.join(BASE_DIR, "bot.log")
WEBAPP_URL = os.getenv("WEBAPP_URL", "").strip()

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
        "btn_panel": "📲 Open panel",
        "access_denied": "Access denied. Your user_id={uid}",
        "hello": "Hi, {name}!\nYour user_id={uid}",
        "info_text": (
            "LKW Report Bot — GROO GmbH\n\n"
            "How it works:\n"
            "1) Tap 📄 Report\n"
            "2) Select Year and Week (or use Week -1 / Week +1)\n"
            "3) Tap ✅ Generate\n\n"
            "Result: you will receive a PDF report."
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
        "btn_panel": "📲 Открыть окно",
        "access_denied": "Доступ запрещён. Ваш user_id={uid}",
        "hello": "Привет, {name}!\nВаш user_id={uid}",
        "info_text": (
            "LKW Report Bot — GROO GmbH\n\n"
            "Как пользоваться:\n"
            "1) Нажми 📄 Отчёт\n"
            "2) Выбери год и неделю (или Week -1 / Week +1)\n"
            "3) Нажми ✅ Generate\n\n"
            "Результат: придёт PDF-отчёт."
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
def _whitelist() -> set[int]:
    raw = os.getenv("WHITELIST_USER_IDS", "")
    return {int(x.strip()) for x in raw.split(",") if x.strip().isdigit()}


WL = _whitelist()


def _allowed(update: Update) -> bool:
    return bool(update.effective_user) and update.effective_user.id in WL


def _kb(update: Update):
    """Remove reply keyboard when WebApp is configured (use Menu Button instead)."""
    if WEBAPP_URL:
        # No reply keyboard - user uses Menu Button "Open" to access WebApp
        return ReplyKeyboardRemove()
    else:
        # Fallback to old buttons if WebApp not configured
        rows = [[T(update, "btn_report"), T(update, "btn_info")]]
        return ReplyKeyboardMarkup(rows, resize_keyboard=True)


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
# STICKERS
# =========================
STICKER_INFO = os.path.join(BASE_DIR, "AnimatedSticker_INFO.tgs")
STICKER_DONE = os.path.join(BASE_DIR, "AnimatedSticker.tgs")


async def _send_sticker_if_exists(msg, path: str):
    try:
        if os.path.exists(path):
            with open(path, "rb") as f:
                await msg.reply_sticker(f)
    except Exception:
        pass


# =========================
# COMMANDS / MENU
# =========================
async def _post_init(app):
    # Set bot commands
    await app.bot.set_my_commands([BotCommand("start", "Start bot")], language_code="en")
    await app.bot.set_my_commands([BotCommand("start", "Запустить бота")], language_code="ru")

    # Set Menu Button to open WebApp directly (like BotFather)
    if WEBAPP_URL:
        menu_button = MenuButtonWebApp(text="Open", web_app=WebAppInfo(WEBAPP_URL))
        await app.bot.set_chat_menu_button(menu_button=menu_button)


# =========================
# HANDLERS
# =========================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _allowed(update):
        uid = update.effective_user.id if update.effective_user else "unknown"
        await update.message.reply_text(T(update, "access_denied", uid=uid))
        return

    await _send_sticker_if_exists(update.message, STICKER_INFO)

    name = update.effective_user.first_name if update.effective_user else "User"
    uid = update.effective_user.id if update.effective_user else "unknown"

    await update.message.reply_text(
        f"{T(update, 'hello', name=name, uid=uid)}\n\n{T(update, 'info_text')}",
        reply_markup=_kb(update),
    )


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

    await update.message.reply_text(T(update, "panel_hint"), reply_markup=_kb(update))


async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id if update.effective_user else "unknown"
    t = (update.message.text or "").strip()
    logger.info("on_text user=%s text=%r lang=%s", uid, t, _lang(update))

    if not _allowed(update):
        await update.message.reply_text(T(update, "access_denied", uid=uid))
        return

    if t == T(update, "btn_info"):
        await _send_sticker_if_exists(update.message, STICKER_INFO)

        name = update.effective_user.first_name if update.effective_user else "User"
        uid = update.effective_user.id if update.effective_user else "unknown"

        await update.message.reply_text(
            f"{T(update, 'hello', name=name, uid=uid)}\n\n{T(update, 'info_text')}",
            reply_markup=_kb(update),
        )
        return

    if t == T(update, "btn_report"):
        logger.info("Report button clicked user=%s", uid)
        st = _state_get(context)
        await update.message.reply_text(T(update, "report_params"), reply_markup=_inline_menu(update, st))
        return

    if WEBAPP_URL and t == T(update, "btn_panel"):
        logger.info("Panel button clicked user=%s", uid)
        await update.message.reply_text(T(update, "panel_hint"), reply_markup=_kb(update))
        return


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

        # Валидация параметров
        if not _validate_year_week(y, w):
            await q.answer(T(update, "invalid_params"), show_alert=True)
            return

        # Rate limiting
        allowed, wait_sec = _check_cooldown(uid)
        if not allowed:
            await q.answer(T(update, "cooldown", sec=wait_sec), show_alert=True)
            return

        logger.info("GEN start user=%s year=%s week=%s", uid, y, w)
        _update_cooldown(uid)

        await safe_edit(q, T(update, "gen_title", y=y, w=w, step=T(update, "step1")))

        async with EXCEL_LOCK:
            try:
                await safe_edit(q, T(update, "gen_title", y=y, w=w, step=T(update, "step2")))

                xlsx_path, pdf_path = await asyncio.wait_for(
                    asyncio.to_thread(run_report, y, w),
                    timeout=30 * 60,
                )
            except asyncio.TimeoutError:
                logger.exception("GEN timeout user=%s year=%s week=%s", uid, y, w)
                await safe_edit(q, T(update, "err"))
                return
            except Exception:
                logger.exception("GEN failed user=%s year=%s week=%s", uid, y, w)
                await safe_edit(q, T(update, "err"))
                return

        await safe_edit(q, T(update, "gen_title", y=y, w=w, step=T(update, "step3")))

        try:
            if pdf_path and os.path.exists(pdf_path):
                with open(pdf_path, "rb") as fp:
                    await q.message.reply_document(fp, filename=os.path.basename(pdf_path))
        except Exception:
            logger.exception("SEND PDF failed user=%s year=%s week=%s", uid, y, w)
            await q.message.reply_text(T(update, "err"), reply_markup=_kb(update))
            return

        logger.info("GEN success user=%s year=%s week=%s pdf=%s", uid, y, w, pdf_path)

        for p in (pdf_path, xlsx_path):
            try:
                if p:
                    pathlib.Path(p).unlink(missing_ok=True)
            except Exception:
                pass

        await q.message.reply_text(T(update, "done"), reply_markup=_kb(update))
        await _send_sticker_if_exists(q.message, STICKER_DONE)
        return


async def on_webapp_data(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle data from Telegram Mini App."""
    uid = update.effective_user.id if update.effective_user else "unknown"

    if not _allowed(update):
        await update.message.reply_text(T(update, "access_denied", uid=uid))
        return

    try:
        data = json.loads(update.effective_message.web_app_data.data)
    except Exception:
        logger.exception("Invalid web_app_data from user=%s", uid)
        await update.message.reply_text(T(update, "err"), reply_markup=_kb(update))
        return

    action = data.get("action")

    if action == "report":
        y = int(data.get("year", 0))
        w = int(data.get("week", 0))

        if not _validate_year_week(y, w):
            await update.message.reply_text(T(update, "invalid_params"), reply_markup=_kb(update))
            return

        allowed, wait_sec = _check_cooldown(uid)
        if not allowed:
            await update.message.reply_text(T(update, "cooldown", sec=wait_sec), reply_markup=_kb(update))
            return

        logger.info("WEBAPP GEN start user=%s year=%s week=%s", uid, y, w)
        _update_cooldown(uid)

        status_msg = await update.message.reply_text(
            T(update, "gen_title", y=y, w=w, step=T(update, "step1"))
        )

        async with EXCEL_LOCK:
            try:
                await safe_edit(status_msg, T(update, "gen_title", y=y, w=w, step=T(update, "step2")))

                xlsx_path, pdf_path = await asyncio.wait_for(
                    asyncio.to_thread(run_report, y, w),
                    timeout=30 * 60,
                )
            except asyncio.TimeoutError:
                logger.exception("WEBAPP GEN timeout user=%s year=%s week=%s", uid, y, w)
                await safe_edit(status_msg, T(update, "err"))
                return
            except Exception:
                logger.exception("WEBAPP GEN failed user=%s year=%s week=%s", uid, y, w)
                await safe_edit(status_msg, T(update, "err"))
                return

        await safe_edit(status_msg, T(update, "gen_title", y=y, w=w, step=T(update, "step3")))

        try:
            if pdf_path and os.path.exists(pdf_path):
                with open(pdf_path, "rb") as fp:
                    await update.message.reply_document(fp, filename=os.path.basename(pdf_path))
        except Exception:
            logger.exception("WEBAPP SEND PDF failed user=%s year=%s week=%s", uid, y, w)
            await update.message.reply_text(T(update, "err"), reply_markup=_kb(update))
            return

        logger.info("WEBAPP GEN success user=%s year=%s week=%s pdf=%s", uid, y, w, pdf_path)

        for p in (pdf_path, xlsx_path):
            try:
                if p:
                    pathlib.Path(p).unlink(missing_ok=True)
            except Exception:
                pass

        await update.message.reply_text(T(update, "done"), reply_markup=_kb(update))
        await _send_sticker_if_exists(update.message, STICKER_DONE)
        return

    # Future actions placeholder
    await update.message.reply_text(T(update, "err"), reply_markup=_kb(update))


async def on_error(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.exception("UNHANDLED ERROR", exc_info=context.error)


# =========================
# MAIN
# =========================
def main():
    acquire_bot_lock_or_exit()

    token = os.environ["TELEGRAM_BOT_TOKEN"]
    app = ApplicationBuilder().token(token).post_init(_post_init).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("report", report_cmd))
    app.add_handler(CommandHandler("panel", panel_cmd))
    app.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, on_webapp_data))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))
    app.add_handler(CallbackQueryHandler(on_cb))
    app.add_error_handler(on_error)

    logger.info("Starting polling...")
    app.run_polling()


if __name__ == "__main__":
    main()
