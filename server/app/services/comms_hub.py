from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any
from uuid import UUID

from fastapi import WebSocket


class CommunicationsHub:
    """In-memory WebSocket fan-out per organization."""

    def __init__(self) -> None:
        self._rooms: dict[UUID, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, org_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._rooms[org_id].add(websocket)

    async def disconnect(self, org_id: UUID, websocket: WebSocket) -> None:
        async with self._lock:
            room = self._rooms.get(org_id)
            if not room:
                return
            room.discard(websocket)
            if not room:
                self._rooms.pop(org_id, None)

    async def broadcast(self, org_id: UUID, event: dict[str, Any]) -> None:
        async with self._lock:
            sockets = list(self._rooms.get(org_id, set()))
        stale: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_json(event)
            except Exception:
                stale.append(ws)
        for ws in stale:
            await self.disconnect(org_id, ws)


comms_hub = CommunicationsHub()
