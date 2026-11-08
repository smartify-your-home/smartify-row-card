"""Standalone Smartify Energy Row: versioned frontend and persistent shared settings."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.resources import ResourceStorageCollection
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.storage import Store

from .const import DOMAIN, RESOURCE_PATH

_LOGGER = logging.getLogger(__name__)
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
_CARD = Path(__file__).parent / "frontend" / "smartify-energy-row.js"
_VERSION = json.loads((Path(__file__).parent / "manifest.json").read_text(encoding="utf-8"))["version"]

@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get"})
@websocket_api.async_response
async def _ws_get(hass, connection, msg):
    store = hass.data[DOMAIN]["store"]
    data = await store.async_load()
    connection.send_result(msg["id"], data or {"slots": []})

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
    await hass.data[DOMAIN]["store"].async_save({"slots": slots})
    connection.send_result(msg["id"], {"saved": True})

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
        await hass.http.async_register_static_paths([StaticPathConfig(RESOURCE_PATH, str(_CARD), False)])
        hass.data[DOMAIN] = {"store": Store(hass, 1, f"{DOMAIN}.settings")}
        websocket_api.async_register_command(hass, _ws_get)
        websocket_api.async_register_command(hass, _ws_save)
    try:
        await _register_resource(hass)
    except Exception:
        _LOGGER.exception("Could not register Smartify Energy Row frontend resource")
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return True
