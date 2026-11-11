"""Standalone Smartify Energy Row Card: versioned frontend, shared profiles and persistent settings."""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.resources import ResourceStorageCollection
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.service import async_register_admin_service
from homeassistant.helpers.storage import Store

from .const import DOMAIN, MAX_PROFILES, MAX_SLOTS, PROFILE_NAME_RE, RESOURCE_PATH

_LOGGER = logging.getLogger(__name__)
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
_CARD = Path(__file__).parent / "frontend" / "smartify-energy-row-card.js"
_VERSION = json.loads((Path(__file__).parent / "manifest.json").read_text(encoding="utf-8"))["version"]

@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get"})
@websocket_api.async_response
async def _ws_get(hass, connection, msg):
    connection.send_result(msg["id"], await _load(hass))

@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/save",
    vol.Required("slots"): list,
})
@websocket_api.async_response
async def _ws_save(hass, connection, msg):
    if not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Administrator permissions required")
        return
    # Preserve existing per-slot settings for all dashboards. Only admins may change them.
    slots = msg["slots"]
    if len(slots) > 200 or any(not isinstance(slot, dict) for slot in slots):
        connection.send_error(msg["id"], "invalid_data", "Invalid slot configuration")
        return
    data = await _load(hass)
    data["slots"] = slots
    await hass.data[DOMAIN]["store"].async_save(data)
    connection.send_result(msg["id"], {"saved": True})


def _is_scalar(value) -> bool:
    return value is None or isinstance(value, (str, int, float, bool))


def validate_profile(name, profile) -> dict:
    """Validate a shared profile ({settings: {...}, slots: [...]}); raise ValueError on bad input."""
    if not isinstance(name, str) or not re.fullmatch(PROFILE_NAME_RE, name):
        raise ValueError("Ungültiger Profilname (a-z, 0-9, _ und -, max. 40 Zeichen)")
    if not isinstance(profile, dict):
        raise ValueError("Profil muss ein Objekt sein")
    settings = profile.get("settings") or {}
    slots = profile.get("slots") or []
    if not isinstance(settings, dict) or len(settings) > 60:
        raise ValueError("Ungültige Profileinstellungen")
    if any(not isinstance(k, str) or not _is_scalar(v) for k, v in settings.items()):
        raise ValueError("Profileinstellungen dürfen nur einfache Werte enthalten")
    if not isinstance(slots, list) or len(slots) > MAX_SLOTS:
        raise ValueError("Ungültige Slot-Liste")
    if any(not isinstance(slot, dict) or not isinstance(slot.get("id"), str) for slot in slots):
        raise ValueError("Jeder Slot braucht eine id")
    clean = {"settings": dict(settings), "slots": [dict(slot) for slot in slots]}
    if len(json.dumps(clean)) > 256_000:
        raise ValueError("Profil ist zu groß")
    return clean


async def _load(hass: HomeAssistant) -> dict:
    data = await hass.data[DOMAIN]["store"].async_load() or {}
    slots = data.get("slots") if isinstance(data.get("slots"), list) else []
    profiles = data.get("profiles") if isinstance(data.get("profiles"), dict) else {}
    # 2.0.x stored only shared slots: expose them as profile "standard" without rewriting old data.
    if "standard" not in profiles and slots:
        profiles = {**profiles, "standard": {"settings": {}, "slots": slots}}
    return {"slots": slots, "profiles": profiles}


async def _save_profile(hass: HomeAssistant, name: str, profile: dict) -> None:
    clean = validate_profile(name, profile)
    data = await _load(hass)
    if name not in data["profiles"] and len(data["profiles"]) >= MAX_PROFILES:
        raise ValueError("Zu viele Profile")
    data["profiles"][name] = clean
    await hass.data[DOMAIN]["store"].async_save(data)


async def _delete_profile(hass: HomeAssistant, name: str) -> bool:
    data = await _load(hass)
    if data["profiles"].pop(name, None) is None:
        return False
    await hass.data[DOMAIN]["store"].async_save(data)
    return True


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/save_profile",
    vol.Required("name"): str,
    vol.Required("profile"): dict,
})
@websocket_api.async_response
async def _ws_save_profile(hass, connection, msg):
    if not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Administrator permissions required")
        return
    try:
        await _save_profile(hass, msg["name"], msg["profile"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_data", str(err))
        return
    connection.send_result(msg["id"], {"saved": True})


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/delete_profile",
    vol.Required("name"): str,
})
@websocket_api.async_response
async def _ws_delete_profile(hass, connection, msg):
    if not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Administrator permissions required")
        return
    connection.send_result(msg["id"], {"deleted": await _delete_profile(hass, msg["name"])})


SET_PROFILE_SCHEMA = vol.Schema({
    vol.Required("name"): cv.string,
    vol.Optional("settings", default={}): dict,
    vol.Optional("slots", default=[]): list,
})
DELETE_PROFILE_SCHEMA = vol.Schema({vol.Required("name"): cv.string})


def _register_services(hass: HomeAssistant) -> None:
    async def _set_profile(call: ServiceCall) -> None:
        try:
            await _save_profile(hass, call.data["name"], {"settings": call.data["settings"], "slots": call.data["slots"]})
        except ValueError as err:
            raise HomeAssistantError(str(err)) from err

    async def _del_profile(call: ServiceCall) -> None:
        await _delete_profile(hass, call.data["name"])

    async_register_admin_service(hass, DOMAIN, "set_profile", _set_profile, SET_PROFILE_SCHEMA)
    async_register_admin_service(hass, DOMAIN, "delete_profile", _del_profile, DELETE_PROFILE_SCHEMA)

async def _register_resource(hass: HomeAssistant):
    lovelace = hass.data.get("lovelace")
    if lovelace is None:
        _LOGGER.warning("Lovelace not ready; add the module manually: %s", RESOURCE_PATH)
        return
    mode = getattr(lovelace, "resource_mode", None)
    resources = getattr(lovelace, "resources", None)
    if isinstance(lovelace, dict):
        mode = lovelace.get("resource_mode", mode)
        resources = lovelace.get("resources", resources)
    if mode == "yaml" or not isinstance(resources, ResourceStorageCollection):
        _LOGGER.warning("Add the JavaScript module manually in Lovelace YAML: %s", RESOURCE_PATH)
        return
    await resources.async_get_info()
    url = f"{RESOURCE_PATH}?v={_VERSION}"
    matched = [x for x in resources.async_items() if str(x.get("url", "")).split("?")[0] == RESOURCE_PATH]
    if not matched:
        await resources.async_create_item({"res_type": "module", "url": url})
    else:
        item = matched[0]
        if item.get("url") != url or item.get("res_type") != "module":
            await resources.async_update_item(item["id"], {"res_type": "module", "url": url})
        for old in matched[1:]:
            await resources.async_delete_item(old["id"])

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if DOMAIN not in hass.data:
        # Long-lived browser cache is safe: the resource URL carries ?v=<manifest version>,
        # so every release is fetched under a new URL.
        await hass.http.async_register_static_paths([StaticPathConfig(RESOURCE_PATH, str(_CARD), True)])
        store = Store(hass, 1, f"{DOMAIN}.settings")
        # One-time migration of previously saved shared slots (never mutate legacy data).
        if await store.async_load() is None:
            legacy = await Store(hass, 1, "smartify_energy_row.settings").async_load()
            if isinstance(legacy, dict) and isinstance(legacy.get("slots"), list):
                await store.async_save({"slots": legacy["slots"]})
        hass.data[DOMAIN] = {"store": store}
        websocket_api.async_register_command(hass, _ws_get)
        websocket_api.async_register_command(hass, _ws_save)
        websocket_api.async_register_command(hass, _ws_save_profile)
        websocket_api.async_register_command(hass, _ws_delete_profile)
        _register_services(hass)
    try:
        await _register_resource(hass)
    except Exception:
        _LOGGER.exception("Could not register Smartify Energy Row Card frontend resource")
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return True
