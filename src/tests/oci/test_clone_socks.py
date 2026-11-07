"""Protocol/ownership tests without CAD, credentials, Docker or HTTP parsing."""
import asyncio
import importlib.util
from pathlib import Path
import struct
import unittest

spec = importlib.util.spec_from_file_location("clone_socks", Path(__file__).with_name("clone-socks.py"))
socks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(socks)


def reader(data):
    result = asyncio.StreamReader()
    result.feed_data(data)
    result.feed_eof()
    return result


class SingletonProtocol(unittest.IsolatedAsyncioTestCase):
    async def test_no_auth_transport_only(self):
        await socks.target(reader(b"\x05\x01\x00"))
        for data in [b"\x04\x01\x00", b"\x05\x00", b"\x05\x01\x02", b"\x05\x20"]:
            with self.subTest(data=data):
                with self.assertRaises(ValueError):
                    await socks.target(reader(data))

    async def test_exact_ipv4_destination(self):
        await socks.destination(reader(b"\x05\x01\x00\x01\x7f\x00\x00\x01" + struct.pack("!H", 3000)))

    async def test_exact_domain_destination(self):
        await socks.destination(reader(b"\x05\x01\x00\x03\x09" + b"127.0.0.1" + struct.pack("!H", 3000)))

    async def test_rejects_other_ip_port_domain_command_and_ipv6(self):
        for data in [
            b"\x05\x01\x00\x01\x7f\x00\x00\x02" + struct.pack("!H", 3000),
            b"\x05\x01\x00\x01\x7f\x00\x00\x01" + struct.pack("!H", 3001),
            b"\x05\x01\x00\x03\x09localhost" + struct.pack("!H", 3000),
            b"\x05\x03\x00\x01", b"\x05\x01\x00\x04",
        ]:
            with self.subTest(data=data):
                with self.assertRaises(ValueError):
                    await socks.destination(reader(data))

    async def test_truncated_handshake(self):
        with self.assertRaises(asyncio.IncompleteReadError):
            await socks.destination(reader(b"\x05\x01"))

    async def test_refuses_loopback_or_public_upstream_before_bind(self):
        for upstream in ["127.0.0.1", "8.8.8.8", "::1"]:
            with self.subTest(upstream=upstream):
                with self.assertRaises(ValueError):
                    await socks.serve(upstream, lambda: None, lambda _: None, lifetime=0)

    async def test_failed_identity_never_opens_listener(self):
        called = []
        def reject():
            raise ValueError("IDENTITY_CHANGED")
        with self.assertRaises(ValueError):
            await socks.serve("172.18.0.2", reject, called.append, lifetime=0)
        self.assertEqual(called, [])

    async def test_per_connect_identity_failure_closes_without_upstream(self):
        ready = asyncio.get_running_loop().create_future()
        calls = []
        def identity():
            calls.append(True)
            if len(calls) > 1:
                raise ValueError("IDENTITY_CHANGED")
        server = asyncio.create_task(socks.serve("172.18.0.2", identity, ready.set_result))
        port = await asyncio.wait_for(ready, 2)
        reader_, writer = await asyncio.open_connection("127.0.0.1", port)
        try:
            writer.write(b"\x05\x01\x00")
            await writer.drain()
            self.assertEqual(await reader_.readexactly(2), b"\x05\x00")
            writer.write(b"\x05\x01\x00\x01\x7f\x00\x00\x01" + struct.pack("!H", 3000))
            await writer.drain()
            self.assertEqual(await asyncio.wait_for(reader_.read(), 2), b"")
            self.assertGreaterEqual(len(calls), 2)
        finally:
            writer.close()
            server.cancel()
            await asyncio.gather(server, return_exceptions=True)

    async def test_periodic_identity_failure_closes_listener(self):
        ready = asyncio.get_running_loop().create_future()
        calls = []
        def identity():
            calls.append(True)
            if len(calls) > 1:
                raise ValueError("IDENTITY_CHANGED")
        server = asyncio.create_task(socks.serve("172.18.0.2", identity, ready.set_result))
        port = await asyncio.wait_for(ready, 2)
        with self.assertRaises(ValueError):
            await asyncio.wait_for(server, 3)
        with self.assertRaises(OSError):
            await asyncio.open_connection("127.0.0.1", port)


if __name__ == "__main__":
    unittest.main()
