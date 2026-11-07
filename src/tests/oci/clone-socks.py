#!/usr/bin/env python3
"""FUP1 opaque, singleton-destination loopback SOCKS5 transport.

No HTTP parsing, credentials, packet capture or general proxy destinations.
The caller supplies an identity check which closes active streams on failure.
"""
import asyncio
import ipaddress
import socket
import struct


async def target(reader):
    version, methods = await reader.readexactly(2)
    if version != 5 or methods > 16 or methods == 0:
        raise ValueError("SOCKS_GREETING")
    if 0 not in await reader.readexactly(methods):
        raise ValueError("SOCKS_AUTH_UNSUPPORTED")


async def destination(reader):
    version, command, reserved, kind = await reader.readexactly(4)
    if (version, command, reserved) != (5, 1, 0):
        raise ValueError("SOCKS_COMMAND")
    if kind == 1:
        host = socket.inet_ntoa(await reader.readexactly(4))
    elif kind == 3:
        size = (await reader.readexactly(1))[0]
        if size > 64:
            raise ValueError("SOCKS_HOST")
        host = (await reader.readexactly(size)).decode("ascii")
    else:
        raise ValueError("SOCKS_ADDRESS")
    port = struct.unpack("!H", await reader.readexactly(2))[0]
    if (host, port) != ("127.0.0.1", 3000):
        raise ValueError("SOCKS_DESTINATION_REFUSED")


async def serve(upstream, validate, ready, *, lifetime=3600):
    address = ipaddress.ip_address(upstream)
    if address.version != 4 or address.is_loopback or not address.is_private:
        raise ValueError("SOCKS_UPSTREAM_INVALID")
    active = set()
    peers = set()
    # The Docker bridge's private IP is pinned, never resolved from client input.
    semaphore = asyncio.Semaphore(32)

    async def pipe(reader, writer):
        while chunk := await reader.read(65536):
            writer.write(chunk)
            await writer.drain()

    async def client(reader, writer):
        if len(peers) >= 32:
            writer.close()
            return
        peer = asyncio.current_task()
        peers.add(peer)
        other = None
        active.add(writer)
        try:
            async with semaphore:
                await asyncio.wait_for(target(reader), 5)
                writer.write(b"\x05\x00")
                await writer.drain()
                await asyncio.wait_for(destination(reader), 5)
                await asyncio.to_thread(validate)
                source, other = await asyncio.wait_for(
                    asyncio.open_connection(str(address), 3000), 5)
                active.add(other)
                writer.write(b"\x05\x00\x00\x01\x00\x00\x00\x00\x00\x00")
                await writer.drain()
                tasks = [asyncio.create_task(pipe(reader, other)),
                         asyncio.create_task(pipe(source, writer))]
                try:
                    done, _ = await asyncio.wait(tasks, timeout=120,
                                                 return_when=asyncio.FIRST_COMPLETED)
                    for task in done:
                        task.result()
                finally:
                    for task in tasks:
                        task.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)
        except (ValueError, OSError, asyncio.IncompleteReadError, asyncio.TimeoutError):
            pass  # No upstream exception strings, addresses or HTTP data in logs.
        finally:
            for stream in [writer, other]:
                if stream:
                    active.discard(stream)
                    stream.close()
            peers.discard(peer)

    await asyncio.to_thread(validate)
    server = await asyncio.start_server(client, "127.0.0.1", 0, limit=65536)
    ready(server.sockets[0].getsockname()[1])
    try:
        async with server:
            for _ in range(lifetime):
                await asyncio.sleep(1)
                await asyncio.to_thread(validate)
    finally:
        server.close()
        await server.wait_closed()
        for stream in list(active):
            stream.close()
        for peer in list(peers):
            peer.cancel()
        await asyncio.gather(*list(peers), return_exceptions=True)
