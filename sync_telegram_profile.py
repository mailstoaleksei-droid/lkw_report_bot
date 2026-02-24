import asyncio
import os
import sys

from dotenv import load_dotenv
from telegram import Bot, BotCommand, MenuButtonWebApp, WebAppInfo


def _ids(raw: str) -> list[int]:
    out: list[int] = []
    for part in (raw or "").split(","):
        p = part.strip()
        if p.isdigit():
            out.append(int(p))
    return out


def _ids_from_db(db_url: str) -> list[int]:
    if not db_url:
        return []
    try:
        import psycopg  # type: ignore
    except Exception:
        print("WARN: psycopg is unavailable in this Python environment; DB user sync skipped")
        return []

    ids: list[int] = []
    try:
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT telegram_user_id
                    FROM allowed_users
                    WHERE is_active = TRUE
                    ORDER BY telegram_user_id
                    """
                )
                for row in cur.fetchall():
                    try:
                        ids.append(int(row[0]))
                    except Exception:
                        pass
    except Exception as e:
        print(f"WARN: failed to load allowed_users from DB: {e}")
    return ids


async def _main() -> int:
    load_dotenv(override=True)
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    webapp_url = (os.getenv("WEBAPP_URL") or "").strip().rstrip("/")
    db_url = (os.getenv("DATABASE_URL") or "").strip()
    whitelist_env = _ids(os.getenv("WHITELIST_USER_IDS", ""))
    whitelist_db = _ids_from_db(db_url)
    whitelist = sorted(set(whitelist_env) | set(whitelist_db))

    if not token:
        print("ERROR: TELEGRAM_BOT_TOKEN is empty")
        return 1
    if not webapp_url:
        print("ERROR: WEBAPP_URL is empty")
        return 1

    bot = Bot(token=token)
    # Commands in both locales
    await bot.set_my_commands(
        [
            BotCommand("start", "Start bot"),
            BotCommand("report", "Generate report"),
            BotCommand("open", "Open App"),
            BotCommand("open_diag", "Mini App diagnostics"),
        ],
        language_code="en",
    )
    await bot.set_my_commands(
        [
            BotCommand("start", "Запустить бота"),
            BotCommand("report", "Сформировать отчёт"),
            BotCommand("open", "Open App"),
            BotCommand("open_diag", "Диагностика Mini App"),
        ],
        language_code="ru",
    )

    # Profile text for bot card
    await bot.set_my_short_description("LKW Report Bot — GROO GmbH | ◀️ Open App")
    await bot.set_my_description("LKW Report Bot — GROO GmbH\n◀️ Open App")

    # Global menu button
    await bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(text="Open App", web_app=WebAppInfo(webapp_url))
    )

    # Sync button for each allowed chat
    synced: list[int] = []
    failed: list[tuple[int, str]] = []
    for chat_id in whitelist:
        try:
            await bot.set_chat_menu_button(
                chat_id=chat_id,
                menu_button=MenuButtonWebApp(text="Open App", web_app=WebAppInfo(webapp_url)),
            )
            synced.append(chat_id)
        except Exception as e:
            failed.append((chat_id, str(e)))

    print(f"OK: WEBAPP_URL={webapp_url}")
    print(f"OK: synced_menu_chats={synced}")
    print(f"OK: source_env_ids={whitelist_env}")
    print(f"OK: source_db_ids={whitelist_db}")
    if failed:
        print(f"WARN: failed_menu_chats={failed}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_main()))
